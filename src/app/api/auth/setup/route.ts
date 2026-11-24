import bcrypt from "bcrypt";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { jsonError, jsonOk } from "@/lib/api";
import { countUsers, createUser } from "@/lib/db";
import { allowRequest, clientIp } from "@/lib/rate-limit";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

const SetupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const SETUP_LIMIT = 10;
const SETUP_WINDOW_MS = 15 * 60 * 1000;

export async function POST(request: Request) {
  const ip = clientIp(request);
  if (!allowRequest(`setup:ip:${ip}`, SETUP_LIMIT, SETUP_WINDOW_MS)) {
    return jsonError("Too many setup attempts. Try again later.", 429);
  }

  if ((await countUsers()) > 0) {
    return jsonError("Setup is locked — a user already exists", 409);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON");
  }

  const parsed = SetupSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message || "Invalid input");
  }

  const emailKey = parsed.data.email.trim().toLowerCase();
  if (!allowRequest(`setup:email:${emailKey}`, SETUP_LIMIT, SETUP_WINDOW_MS)) {
    return jsonError("Too many setup attempts. Try again later.", 429);
  }

  // Re-check after parse so a race cannot create a second user.
  if ((await countUsers()) > 0) {
    return jsonError("Setup is locked — a user already exists", 409);
  }

  const id = uuidv4();
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await createUser(id, parsed.data.email, passwordHash, "admin");

  const session = await getSession();
  session.userId = id;
  session.email = emailKey;
  session.isLoggedIn = true;
  await session.save();

  return jsonOk({ ok: true, email: session.email });
}
