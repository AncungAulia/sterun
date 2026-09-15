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
    // The reader of this sentence is a runner or an organiser, so it says what
    // they can do about it. Which variable is missing is a developer's problem,
    // and it is already in the code they are looking at.
    throw new ApiError(0, "no-api-url", "Sterun is not available right now. Please try again later.");
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { Accept: "application/json", ...init?.headers },
  });

  if (!response.ok) {
    // A proxy in front of the API can answer with HTML, so the documented
    // shape is attempted and not assumed. Losing the body is better than
    // turning a 502 into a JSON parse error nobody can act on.
    //
    // Only the code is taken from the body. The server's own `message` is
    // written for whoever reads a log, and putting it on screen is how a page
    // ends up telling a runner about a row that failed to insert.
    let code = "http-error";
    try {
      const body = (await response.json()) as { error?: string; message?: string };
      if (body.error) code = body.error;
    } catch {
      // Keep the default code above.
    }
    throw new ApiError(response.status, code, "Something went wrong on our side. Please try again.");
  }

  return (await response.json()) as T;
}
