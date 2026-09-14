/**
 * STE-20 — one error shape for the whole API.
 *
 * Before this, three shapes were in circulation. The routers answered
 * `{ error, message }`; Fastify's schema validation answered
 * `{ statusCode, error: "Bad Request", message }`, where `error` is the HTTP
 * *reason phrase* rather than anything a client can branch on; and an
 * unhandled throw answered `{ statusCode: 500, error: "Internal Server Error",
 * message }` with the exception's own text in it.
 *
 * Two people are writing clients against this API. Three shapes means three
 * parsers, and the middle one is actively misleading — a client that branches
 * on `error === "Bad Request"` is branching on a string that changes with the
 * status code.
 *
 * So every failure leaves as:
 *
 *     { "error": "<stable-kebab-code>", "message": "<a sentence>", "details"?: [...] }
 *
 * `error` is the machine's field and never changes for a given condition.
 * `message` is the human's and may be reworded. `details` appears only for
 * validation, where "which field" is the whole content of the answer.
 *
 * ## Nothing internal leaves the process
 *
 * A 500 says "internal-error" and nothing else. Exception text carries file
 * paths, SQL fragments and occasionally the value that caused the failure —
 * which, in a service holding identity documents, is exactly the thing that
 * must not appear in a response body. The real error is logged with the request
 * id, so support means correlating an id, not reading it off the client's
 * screen.
 */
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { AuthError } from "../auth.js";
import { ContractRevertError } from "../chain/errors.js";
import { NormalizationError } from "../spec/normalize.js";
import {
  AlreadyConfirmedError,
  ParticipantExistsError,
  ParticipantNotFoundError,
} from "../vault.js";

export interface ErrorBody {
  error: string;
  message: string;
  details?: { path: string; problem: string }[];
  /**
   * Which input field the spec refused. Only for a normalization failure, where
   * the frozen code and the field together are the whole answer
   * (docs/specs/HASH_AND_TOTP.md) and a client uses them to highlight a form.
   */
  field?: string;
}

/** A failure this service raised on purpose, with the status it deserves. */
export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Plain sentences for the validation failures a person will actually cause.
 *
 * Ajv's own wording names the rule, not the fix: `must match pattern
 * "^\\+[1-9][0-9]{6,14}$"` tells a form builder nothing they can show a runner.
 * Keyed by field and rule, so a message only replaces Ajv's where it is known to
 * mean the same thing. Everything else keeps Ajv's message.
 */
const PROBLEM_HINTS: Record<string, string> = {
  "/emergency_contact pattern":
    "must be a phone number in E.164 form: a plus and the country code, digits only, " +
    "e.g. +6281234567890",
  "/phone pattern":
    "must be a phone number in E.164 form: a plus and the country code, digits only, " +
    "e.g. +6281234567890",
  "/email format": "must be an email address, e.g. runner@example.com",
  "/date_of_birth format": "must be a date of birth as YYYY-MM-DD, e.g. 1990-05-17, not an age",
  "/date_of_birth type": "must be a date of birth as YYYY-MM-DD, e.g. 1990-05-17, not an age",
  "/id_type enum": "must be one of national_id_card, passport, driving_licence, other",
  "/gender enum": "must be female or male",
};

const validationDetails = (error: FastifyError): ErrorBody["details"] =>
  error.validation?.map((issue) => ({
    // `instancePath` is "" for a problem with the root object; "body" reads
    // better than an empty string in a client's error list.
    path: issue.instancePath === "" ? (error.validationContext ?? "body") : issue.instancePath,
    problem:
      PROBLEM_HINTS[`${issue.instancePath} ${issue.keyword}`] ?? issue.message ?? "is invalid",
  }));

/**
 * Map a thrown value to a response body and a status.
 *
 * Exported separately from the handler so the mapping is unit-testable without
 * standing up a server.
 */
export function toErrorBody(error: FastifyError): { status: number; body: ErrorBody } {
  if (error instanceof AuthError) {
    return { status: 401, body: { error: error.reason, message: error.message } };
  }
  if (error instanceof NormalizationError) {
    // The frozen code (E_EMPTY / E_NUL) and the field, unchanged: a client
    // points at a form field with them.
    return {
      status: 400,
      body: { error: error.code, field: error.field, message: error.message },
    };
  }
  if (error instanceof ParticipantNotFoundError) {
    return { status: 404, body: { error: "not-found", message: error.message } };
  }
  if (error instanceof AlreadyConfirmedError || error instanceof ParticipantExistsError) {
    return { status: 409, body: { error: "conflict", message: error.message } };
  }
  if (error instanceof ApiError) {
    return { status: error.statusCode, body: { error: error.code, message: error.message } };
  }
  if (error instanceof ContractRevertError) {
    return error.isNotFound
      ? { status: 404, body: { error: "not-found", message: "no such record on-chain" } }
      : {
          status: 502,
          body: {
            error: "contract-reverted",
            // The variant name is public ABI (docs/specs/INTERFACE.md), so it
            // is safe to surface and is the one thing a client can act on.
            message: `the contract refused this: ${error.variant ?? `error #${error.code}`}`,
          },
        };
  }
  if (error.validation) {
    const details = validationDetails(error);
    return {
      status: 400,
      body: {
        error: "invalid-request",
        message: "the request did not match the schema for this endpoint",
        ...(details && details.length > 0 ? { details } : {}),
      },
    };
  }
  if (error.statusCode === 429) {
    return {
      status: 429,
      body: { error: "rate-limited", message: error.message },
    };
  }
  if (error.statusCode === 413) {
    return {
      status: 413,
      body: { error: "payload-too-large", message: "the request body is too large" },
    };
  }
  if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
    return {
      status: error.statusCode,
      body: { error: error.code ?? "bad-request", message: error.message },
    };
  }
  return {
    status: 500,
    body: {
      error: "internal-error",
      // Deliberately says nothing. See the header.
      message: "the request could not be completed; quote the x-request-id when reporting this",
    },
  };
}

/** Install as the root handler. Routers with their own handler keep theirs. */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    const { status, body } = toErrorBody(error);
    if (status >= 500) {
      // The whole exception, on our side only, tied to what the client was told.
      request.log.error({ err: error, requestId: request.id }, "unhandled error");
    }
    void reply.code(status).send(body);
  });

  app.setNotFoundHandler((request, reply) => {
    void reply
      .code(404)
      .send({ error: "no-such-route", message: `${request.method} ${request.url} is not a route` });
  });
}
