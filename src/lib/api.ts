import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function withAuth<T>(
  handler: (session: NonNullable<
    Awaited<ReturnType<typeof requireSession>>
  >) => Promise<T>,
): Promise<T | NextResponse> {
  const session = await requireSession();
  if (!session) {
    return jsonError("Unauthorized", 401);
  }
  return handler(session);
}
