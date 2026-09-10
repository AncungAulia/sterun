/**
 * STE-17 — the one place this app talks to the backend (`be/`).
 *
 * The backend is a *cache and a vault*, never an authority on anything the
 * chain can answer (ARCHITECTURE.md §5.1). It is used here for the two things
 * the chain genuinely cannot do: enumerate an event's scanners, and review a
 * results CSV against the roster.
 */
import { API_URL } from "./env";

/**
 * A backend refusal, with the code it refused by.
 *
 * Every route answers `{error, message}` (be/CLAUDE.md), and the difference
 * between `not_indexed` and a 500 changes what the page should say, so the
 * code is carried rather than flattened into a sentence.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_URL) {
    throw new ApiError(0, "no-api-url", "NEXT_PUBLIC_API_URL is not set, so the backend cannot be reached.");
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { Accept: "application/json", ...init?.headers },
  });

  if (!response.ok) {
    // A proxy in front of the API can answer with HTML, so the documented
    // shape is attempted and not assumed. Losing the body is better than
    // turning a 502 into a JSON parse error nobody can act on.
    let code = "http-error";
    let message = `The backend answered ${response.status}.`;
    try {
      const body = (await response.json()) as { error?: string; message?: string };
      if (body.error) code = body.error;
      if (body.message) message = body.message;
    } catch {
      // Keep the defaults above.
    }
    throw new ApiError(response.status, code, message);
  }

  return (await response.json()) as T;
}
