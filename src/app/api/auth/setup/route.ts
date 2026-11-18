import bcrypt from "bcrypt";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { jsonError, jsonOk } from "@/lib/api";
import { countUsers, createUser } from "@/lib/db";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

const SetupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export async function POST(request: Request) {
  if (countUsers() > 0) {
    return jsonError("Setup is locked — an admin already exists", 409);
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

  const id = uuidv4();
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  createUser(id, parsed.data.email, passwordHash);

  const session = await getSession();
  session.userId = id;
  session.email = parsed.data.email.trim().toLowerCase();
  session.isLoggedIn = true;
  await session.save();

  return jsonOk({ ok: true, email: session.email });
}
