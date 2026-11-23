import { NextResponse } from "next/server";
import { AppUser, getCurrentUser } from "@/lib/session";

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
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
