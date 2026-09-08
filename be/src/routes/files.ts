/**
 * Event metadata files — upload, and serve back.
 *
 * Asked for by Ancung for the organiser console (STE-17). The wizard needs a
 * `uri` and a `metadata_hash` to pass to `create_event`, and until now the only
 * way to get one was "host the file yourself and paste the URL" — the step most
 * likely to make the whole feature go unused.
 *
 * ## This does not touch the frozen spec
 *
 * Worth stating because it was the first thing to check. `create_event` already
 * takes `metadata_hash: BytesN<32>` and `uri: String` (docs/specs/INTERFACE.md
 * §1.1). The on-chain half of the product claim exists; what was missing was
 * somewhere to put the bytes. So this is entirely off-chain work and needs no
 * spec-change PR.
 *
 * ## The URL and the hash are the same number
 *
 * Files are content-addressed (`files/store.ts`): the path is the sha256. So
 * `url` and `sha256` in the response are not two facts that could drift apart —
 * they are one fact written two ways. A file served from this URL cannot later
 * be different bytes, which is exactly the property `metadata_hash` needs.
 *
 * ## Serving other people's bytes from our own origin
 *
 * This is the part that deserves care and got it. Anyone holding any Stellar
 * keypair can upload here — keypairs are free — so these bytes are hostile
 * until proven otherwise, and they come back out under
 * `api-sterun.jameshub.fun`, an origin that also serves the PII vault.
 *
 * Four things stand between those two facts:
 *
 *   1. The stored type is SNIFFED from the bytes, never read from the
 *      uploader's `Content-Type` (files/content-type.ts). SVG is not on the
 *      allow-list, because SVG executes script.
 *   2. Responses are sent with a `sandbox` CSP and `default-src 'none'`, so
 *      anything that did slip through runs in an opaque origin with no network.
 *   3. `X-Content-Type-Options: nosniff` (set globally in http/hardening.ts)
 *      stops a browser from deciding for itself that a .png is HTML.
 *   4. `Content-Disposition` names the file by its hash, so nothing the
 *      uploader chose is echoed back into a header.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ChallengeStore } from "../auth.js";
import { RATE_LIMITS } from "../http/hardening.js";
import { sniffContentType, ALLOWED_CONTENT_TYPES, EXTENSIONS } from "../files/content-type.js";
import { R2Error } from "../files/r2.js";
import { FileStoreError, SHA256_PATTERN, type FileStore } from "../files/store.js";

/**
 * Ancung's brief said 5 MB and that is the right number, for a reason worth
 * recording: this is a poster and a JSON document, not a video. A limit large
 * enough to be invisible to the honest case and small enough that the abusive
 * case is boring.
 */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

const uploadResponse = {
  201: {
    type: "object",
    additionalProperties: false,
    required: ["url", "sha256", "size", "content_type", "created"],
    properties: {
      /**
       * Absolute, because its destination is `create_event`'s `uri` argument
       * on-chain. A relative path would be useless there.
       */
      url: { type: "string" },
      /**
       * The same value the URL ends with. Sent separately anyway: this is what
       * goes into `metadata_hash`, and making the console slice it out of a URL
       * would be inviting an off-by-one that only shows up on-chain.
       */
      sha256: { type: "string", pattern: "^[0-9a-f]{64}$" },
      size: { type: "integer" },
      content_type: { type: "string", enum: [...ALLOWED_CONTENT_TYPES] },
      /**
       * False when these exact bytes were already stored. Not an error — the
       * URL is the same and so is the hash. It is here so the console can say
       * "already uploaded" instead of implying work happened.
       */
      created: { type: "boolean" },
    },
  },
} as const;

export const RESPONSE_SCHEMAS = { uploadResponse };

export interface FilesDeps {
  store: FileStore;
  challenges: ChallengeStore;
  /**
   * Origin the stored files are reachable at, e.g.
   * `https://api-sterun.jameshub.fun`. Undefined means "work it out from the
   * request", which is right for development and wrong for production — see
   * `publicOrigin` below.
   */
  publicBaseUrl: string | undefined;
}

/**
 * Where a caller should be told the file lives.
 *
 * Configured value first. The fallback derives the origin from the request,
 * which is convenient in development and deliberately NOT trusted in
 * production: `Host` is attacker-controlled, and a minted URL pointing at
 * someone else's domain would be committed on-chain by the organiser who asked
 * for it. `STERUN_PUBLIC_BASE_URL` is therefore set on the deployed box.
 */
function publicOrigin(configured: string | undefined, request: FastifyRequest): string {
  if (configured) return configured.replace(/\/+$/, "");
  const proto = firstHeader(request.headers["x-forwarded-proto"]) ?? request.protocol;
  const host = firstHeader(request.headers["x-forwarded-host"]) ?? request.headers.host ?? "";
  return `${proto}://${host}`.replace(/\/+$/, "");
}

const firstHeader = (value: string | string[] | undefined): string | undefined => {
  const single = Array.isArray(value) ? value[0] : value;
  return single?.split(",")[0]?.trim() || undefined;
};

export async function filesRoutes(
  app: FastifyInstance,
  { store, challenges, publicBaseUrl }: FilesDeps,
): Promise<void> {
  /**
   * Raw body, not multipart — the same call the results upload makes, and for
   * the same reasons. One file is a document, not a form, and `curl
   * --data-binary @poster.png` is what somebody driving this from a shell will
   * reach for.
   *
   * The parsed types are DERIVED from the allow-list rather than written out
   * again, and that is not tidiness. Fastify refuses a content type it has no
   * parser for with its own 415 before this router's handler runs, so a type
   * added to the allow-list and forgotten here is rejected with an error that
   * says nothing about sniffing and points at no fix. Deriving it means the
   * two cannot disagree.
   *
   * `application/octet-stream` and `text/plain` are additions rather than
   * exceptions: they are what curl and fetch send when nobody sets a type, and
   * the bytes still have to pass the sniffer either way.
   */
  const parsedTypes = [...ALLOWED_CONTENT_TYPES, "application/octet-stream", "text/plain"];
  app.addContentTypeParser(
    parsedTypes,
    { parseAs: "buffer", bodyLimit: MAX_FILE_BYTES },
    (_request, body, done) => {
      done(null, body);
    },
  );

  /**
   * Upload.
   *
   * The path is the one Ancung's brief named. It reads as "a file belonging to
   * an event", which is not quite what it is — the upload happens BEFORE
   * `create_event`, because the wizard needs the URL and hash to pass to it.
   * Kept as asked rather than renamed unilaterally, since the console is being
   * written against it.
   */
  app.post(
    "/events/files",
    {
      config: { rateLimit: { max: RATE_LIMITS.files, timeWindow: "1 minute" } },
      schema: {
        summary: "Upload an event metadata document or poster",
        description:
          "Content-addressed: the returned URL ends with the sha256 of the bytes, which is " +
          "also the value to pass as create_event's metadata_hash. Re-uploading identical " +
          "bytes returns the same URL with created:false. The stored content type is " +
          "detected from the bytes; the request's Content-Type is ignored.",
        security: [{ walletSignature: [] }],
        response: uploadResponse,
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      /**
       * Authenticated, but NOT authorised against an event.
       *
       * There is no event to check against yet — that is the whole ordering of
       * the wizard. Ancung's brief suggested restricting uploads to addresses
       * that have already created an event; that gate would lock out exactly
       * the first-time organiser the feature exists for, so it is deliberately
       * not implemented. What bounds abuse instead is the size limit, the rate
       * limit, the sniffed type allow-list, and the store's hard ceiling.
       */
      await challenges.verify(
        request.headers["x-sterun-address"] as string | undefined,
        request.headers["x-sterun-nonce"] as string | undefined,
        request.headers["x-sterun-signature"] as string | undefined,
      );

      const body = request.body;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        return reply.code(400).send({
          error: "empty-body",
          message:
            "send the file as the request body (curl --data-binary @poster.png " +
            "-H 'Content-Type: image/png')",
        });
      }

      const contentType = sniffContentType(body);
      if (!contentType) {
        return reply.code(415).send({
          error: "unsupported-file-type",
          message:
            `the bytes are not one of ${ALLOWED_CONTENT_TYPES.join(", ")}. The request's ` +
            `Content-Type header is not consulted — the file itself has to be one of these. ` +
            `SVG is not accepted because it can carry script.`,
        });
      }

      try {
        const stored = await store.put(body, contentType);
        const origin = publicOrigin(publicBaseUrl, request);
        return reply.code(201).send({
          url: `${origin}/files/${stored.sha256}.${EXTENSIONS[contentType]}`,
          sha256: stored.sha256,
          size: stored.size,
          content_type: contentType,
          created: stored.created,
        });
      } catch (e) {
        if (e instanceof FileStoreError) {
          // 507, not 500: nothing is broken, there is no room. The distinction
          // matters to whoever is on the other end of the alert.
          return reply.code(507).send({ error: "store-full", message: e.message });
        }
        if (e instanceof R2Error && e.transient) {
          /**
           * 503, not 500. The store already retried and the failure outlasted
           * it, so the honest answer is "upstream is unwell, try again" rather
           * than "we are broken" — and the difference decides what the person
           * on the other end does next. `Retry-After` makes that instruction
           * machine-readable instead of implied.
           *
           * Safe to advertise a retry because uploads are idempotent: the same
           * bytes resolve to the same URL, so trying again cannot duplicate
           * anything.
           */
          void reply.header("retry-after", "5");
          return reply.code(503).send({
            error: "storage-unavailable",
            message: "the file store is temporarily unreachable; retry in a few seconds",
          });
        }
        throw e;
      }
    },
  );

  /**
   * Serve it back.
   *
   * Public and unauthenticated, which is required rather than lax: this URL
   * goes on-chain, and anyone looking at an event has to be able to fetch it
   * without holding a Sterun credential. Nothing here is private — the file was
   * published by the organiser the moment they committed its hash.
   *
   * The extension in the path is cosmetic: it makes the URL look like a file to
   * humans and to link previews. The hash is what resolves.
   */
  app.get(
    "/files/:filename",
    {
      schema: {
        summary: "Fetch a stored file by its sha256",
        params: {
          type: "object",
          required: ["filename"],
          properties: { filename: { type: "string" } },
        },
        // No response schema: this returns raw bytes, not JSON. Declaring one
        // would make Fastify try to serialise a Buffer as an object.
        response: {},
      },
    },
    async (request: FastifyRequest<{ Params: { filename: string } }>, reply: FastifyReply) => {
      const sha256 = request.params.filename.replace(/\.[a-z0-9]+$/i, "");
      if (!SHA256_PATTERN.test(sha256)) {
        return reply.code(400).send({
          error: "bad-file-name",
          message: "a file name is a 64-character lowercase sha256, optionally with an extension",
        });
      }

      let found;
      try {
        found = await store.get(sha256);
      } catch (e) {
        if (e instanceof R2Error && e.transient) {
          void reply.header("retry-after", "5");
          return reply.code(503).send({
            error: "storage-unavailable",
            message: "the file store is temporarily unreachable; retry in a few seconds",
          });
        }
        throw e;
      }
      if (!found) {
        return reply.code(404).send({
          error: "not-found",
          message: "no file is stored under that hash",
        });
      }

      /**
       * Immutable, and honestly so. Content addressing means these bytes cannot
       * become different bytes at this URL, so a year-long cache is not a
       * gamble — it is a statement of fact. This is also what keeps egress off
       * our box: Cloudflare's edge answers almost all of it.
       */
      void reply.header("cache-control", "public, max-age=31536000, immutable");
      void reply.header("etag", `"${sha256}"`);
      /**
       * The uploaded bytes are not ours and are served from an origin that also
       * serves the vault. `sandbox` puts the response in an opaque origin with
       * no script, no forms, and no same-origin privileges; `default-src 'none'`
       * stops it fetching anything. Together they mean that even a file that
       * defeated the sniffer cannot reach anything that matters.
       */
      void reply.header("content-security-policy", "default-src 'none'; sandbox");
      // The hash, never anything the uploader chose — a filename from user
      // input is how header injection and confusing downloads happen.
      void reply.header(
        "content-disposition",
        `inline; filename="${sha256}.${EXTENSIONS[found.contentType]}"`,
      );

      // The sniffed type, not the one claimed at upload time. By this point
      // they are the same thing, because the claimed one was never stored.
      return reply.type(found.contentType).send(found.bytes);
    },
  );
}
