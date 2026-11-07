// Typed fetch layer over the FastAPI backend.
// VITE_API_ORIGIN is set at build time for each deployment. Keep Render as the
// fallback so the existing web deployment does not change when the variable is absent.
const configuredApiOrigin = (import.meta.env.VITE_API_ORIGIN ?? "").trim();
export const API_ORIGIN = (configuredApiOrigin || "https://huilerie-pro3.onrender.com").replace(/\/+$/, "");
const BASE = `${API_ORIGIN}/api`;

// Fields are declared, not constructor parameter properties: tsconfig sets
// erasableSyntaxOnly, which rejects `constructor(readonly status: number)`.
export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    const detail = body && typeof body === "object" && "detail" in body
      ? (body as { detail?: unknown }).detail
      : undefined;
    const validationMessages = Array.isArray(detail)
      ? detail.map((item) => item && typeof item === "object" && "msg" in item
        ? String((item as { msg?: unknown }).msg ?? "").trim()
        : "").filter(Boolean)
      : [];
    const message = status < 500 && typeof detail === "string" && detail.trim()
      ? detail.trim()
      : validationMessages.length
        ? validationMessages.join("; ")
        : `request failed with ${status}`;
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

type JsonBody = unknown;

async function request<T>(method: string, path: string, body?: JsonBody, externalSignal?: AbortSignal): Promise<T> {
  // Auth uses an httpOnly cookie issued by the Render backend.
  // React Query may cancel an obsolete request when the last observer unmounts;
  // forward that cancellation to fetch instead of leaving a stale request in flight.
  const controller = new AbortController();
  const abortFromExternal = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) {
    controller.abort(externalSignal.reason);
  } else {
    externalSignal?.addEventListener("abort", abortFromExternal, { once: true });
  }
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      credentials: "include",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    // Keep the timeout active while reading the response body too. Some browsers
    // can receive headers but stall while consuming the body.
    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      throw new ApiError(res.status, errBody);
    }

    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  } catch (error) {
    // Cancellation by React Query is not a server timeout and must stay a cancellation.
    if (externalSignal?.aborted) throw error;
    if (controller.signal.aborted) {
      throw new Error("Session/API request timed out after 15 seconds. Check your connection and try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener("abort", abortFromExternal);
  }
}

// The response type is yours to declare: nothing infers across the Python boundary, so a
// TS interface here mirrors the endpoint's Pydantic model by hand — keep the two in sync.
export const apiGet = <T>(path: string, signal?: AbortSignal) => request<T>("GET", path, undefined, signal);
export const apiPost = <T>(path: string, body?: JsonBody) => request<T>("POST", path, body ?? null);
export const apiPut = <T>(path: string, body?: JsonBody) => request<T>("PUT", path, body ?? null);
export const apiPatch = <T>(path: string, body?: JsonBody) =>
  request<T>("PATCH", path, body ?? null);
export const apiDelete = <T>(path: string) => request<T>("DELETE", path);
