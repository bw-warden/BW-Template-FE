import bcrypt from "bcrypt";
import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api";
import { findUserByEmail } from "@/lib/db";
import { syncGroupsInBackground } from "@/lib/groups";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
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

  const user = findUserByEmail(parsed.data.email);
  if (!user) {
    return jsonError("Invalid email or password", 401);
  }

  const ok = await bcrypt.compare(parsed.data.password, user.password_hash);
  if (!ok) {
    return jsonError("Invalid email or password", 401);
  }

  const session = await getSession();
  session.userId = user.id;
  session.email = user.email;
  session.isLoggedIn = true;
  await session.save();

  // Warm Bitwarden group cache without blocking login.
  syncGroupsInBackground();

  return jsonOk({ ok: true, email: user.email });
}
