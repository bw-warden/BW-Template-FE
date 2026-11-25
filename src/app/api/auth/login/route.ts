import bcrypt from "bcrypt";
import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api";
import { appendAuditEvent } from "@/lib/audit";
import { findUserByEmail } from "@/lib/db";
import { syncGroupsInBackground } from "@/lib/groups";
import { allowRequest, clientIp } from "@/lib/rate-limit";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export async function POST(request: Request) {
  const ip = clientIp(request);
  if (!allowRequest(`login:ip:${ip}`, LOGIN_LIMIT, LOGIN_WINDOW_MS)) {
    return jsonError("Too many login attempts. Try again later.", 429);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON");
  }

  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("Email and password are required");
  }

  const emailKey = parsed.data.email.trim().toLowerCase();
  if (!allowRequest(`login:email:${emailKey}`, LOGIN_LIMIT, LOGIN_WINDOW_MS)) {
    return jsonError("Too many login attempts. Try again later.", 429);
  }

  const user = await findUserByEmail(parsed.data.email);
  // Constant-ish failure path: always run a bcrypt compare when user missing
  // so timing does not reveal whether the email exists.
  // Precomputed bcrypt of a throwaway string — used only so missing users
  // still pay compare cost (does not accept any real password).
  const TIMING_HASH =
    "$2b$12$TL5qcUUz8ZvtbQ/o.0ExyetcsNTDJx2YKr0pIk0VzxXP4XiuzDJLu";
  const ok = await bcrypt.compare(
    parsed.data.password,
    user?.password_hash || TIMING_HASH,
  );
  if (!user || !ok) {
    return jsonError("Invalid email or password", 401);
  }

  const session = await getSession();
  session.userId = user.id;
  session.email = user.email;
  session.isLoggedIn = true;
  await session.save();

  // Warm Bitwarden group cache without blocking login.
  syncGroupsInBackground();

  await appendAuditEvent({
    actorId: user.id,
    actorEmail: user.email,
    action: "auth.login",
    scope: "Auth",
    detail: "Signed in",
  });

  return jsonOk({ ok: true, email: user.email });
}
