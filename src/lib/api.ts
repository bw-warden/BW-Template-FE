import { NextResponse } from "next/server";
import { AppUser, getCurrentUser } from "@/lib/session";

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Log the real error server-side; return a generic message to the client so
 * Bitwarden/CLI/oauth stderr never leaks API keys or stack details.
 */
export function jsonServerError(
  err: unknown,
  fallback = "Something went wrong. Check server logs for details.",
  status = 500,
) {
  const detail = err instanceof Error ? err.message : String(err);
  console.error("[api]", detail);
  return jsonError(fallback, status);
}

export async function withAuth<T>(
  handler: (user: AppUser) => Promise<T>,
): Promise<T | NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return jsonError("Unauthorized", 401);
  }
  return handler(user);
}

export async function withAdmin<T>(
  handler: (user: AppUser) => Promise<T>,
): Promise<T | NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return jsonError("Unauthorized", 401);
  }
  if (user.role !== "admin") {
    return jsonError("Admin access required", 403);
  }
  return handler(user);
}
