/**
 * STE-20 — one error shape, checked at the mapping and then at the wire.
 *
 * The mapping is pure, so most of this needs no server. What it is protecting
 * is a promise to two people writing clients: `error` is a stable code they may
 * branch on, `message` is prose they may not, and a 500 leaks nothing.
 */
import type { FastifyError } from "fastify";
import { describe, expect, it } from "vitest";
import { AuthError } from "../src/auth.js";
import { ContractRevertError, classifyContractError } from "../src/chain/errors.js";
import { ApiError, toErrorBody } from "../src/http/errors.js";
import { NormalizationError } from "../src/spec/normalize.js";
import { AlreadyConfirmedError, ParticipantNotFoundError } from "../src/vault.js";
import { loadConfig } from "../src/config.js";
import { buildServer } from "../src/server.js";

const as = (error: unknown) => toErrorBody(error as FastifyError);

describe("every failure maps to a code a client can branch on", () => {
  it("carries an auth failure's own reason, which is already the code", () => {
    expect(as(new AuthError("expired-nonce", "the nonce has expired"))).toEqual({
      status: 401,
      body: { error: "expired-nonce", message: "the nonce has expired" },
    });
  });

  it("keeps the frozen normalization code and the field it refers to", () => {
    // E_EMPTY / E_NUL are frozen in docs/specs/HASH_AND_TOTP.md, and a client
    // uses the pair to highlight the right form field.
    const body = as(new NormalizationError("E_EMPTY", "name", "name is empty"));
    expect(body.status).toBe(400);
    expect(body.body).toMatchObject({ error: "E_EMPTY", field: "name" });
  });

  it("distinguishes not-found from conflict in the vault", () => {
    expect(as(new ParticipantNotFoundError("no such participant")).status).toBe(404);
    expect(as(new AlreadyConfirmedError(7)).status).toBe(409);
  });

  it("turns a contract not-found revert into a 404", () => {
    const revert = new ContractRevertError(classifyContractError(2), "get_organiser", "raw");
    expect(as(revert).status).toBe(404);
  });

  it("turns any other contract revert into a 502, naming the variant", () => {
    // 502 rather than 500: the failure came from a service upstream of us, and
    // the variant name is public ABI, so it is safe and useful to say.
    const revert = new ContractRevertError(classifyContractError(5), "reserve_slot", "raw");
    const body = as(revert);
    expect(body.status).toBe(502);
    expect(body.body.message).toContain("QuotaFull");
  });

  it("reports schema validation with the offending paths", () => {
    const error = Object.assign(new Error("body must have required property 'address'"), {
      validation: [{ instancePath: "/address", message: "must match pattern" }],
      validationContext: "body",
    });
    const body = as(error);
    expect(body.status).toBe(400);
    expect(body.body.error).toBe("invalid-request");
    expect(body.body.details).toEqual([{ path: "/address", problem: "must match pattern" }]);
  });

  it("names the root object `body` rather than an empty path", () => {
    const error = Object.assign(new Error("bad"), {
      validation: [{ instancePath: "", message: "must NOT have additional properties" }],
      validationContext: "body",
    });
    expect(as(error).body.details?.[0]?.path).toBe("body");
  });

  it("passes an ApiError through with the status it chose", () => {
    expect(as(new ApiError(409, "not-indexed", "the poller has not caught up"))).toEqual({
      status: 409,
      body: { error: "not-indexed", message: "the poller has not caught up" },
    });
  });
});

describe("a 500 leaks nothing", () => {
  it("says internal-error and discards the exception's own text", () => {
    // Exception text carries file paths, SQL fragments and sometimes the value
    // that caused the failure. In a service holding identity documents that is
    // precisely what must not reach a response body.
    const body = as(new Error("connect ECONNREFUSED 10.0.0.5:5432 while SELECT national_id_enc"));
    expect(body.status).toBe(500);
    expect(body.body.error).toBe("internal-error");
    expect(body.body.message).not.toContain("ECONNREFUSED");
    expect(body.body.message).not.toContain("national_id_enc");
    expect(JSON.stringify(body.body)).not.toContain("10.0.0.5");
  });

  it("tells the caller what to quote instead", () => {
    expect(as(new Error("boom")).body.message).toContain("x-request-id");
  });
});

describe("the shape is the same at the wire", () => {
  const app = buildServer(loadConfig({ NODE_ENV: "test" }));

  it("answers an unknown route with a code, not Fastify's default", () => {
    return app
      .inject({ method: "GET", url: "/nope" })
      .then((res) => {
        expect(res.statusCode).toBe(404);
        expect(res.json()).toEqual({
          error: "no-such-route",
          message: "GET /nope is not a route",
        });
      });
  });

  it("echoes a request id on every response", async () => {
    // The only thing a 500 gives a caller to quote, so it has to be there on
    // the successful responses too — support asks for it after the fact.
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.headers["x-request-id"]).toBeTruthy();
  });

  it("never answers with Fastify's reason-phrase `error` field", async () => {
    // `{"error": "Not Found"}` is the HTTP reason phrase, which changes with
    // the status code — branching on it is branching on nothing.
    const res = await app.inject({ method: "GET", url: "/nope" });
    expect(res.json().error).not.toBe("Not Found");
    expect(res.json()).not.toHaveProperty("statusCode");
  });
});
