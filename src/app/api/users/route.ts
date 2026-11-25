import bcrypt from "bcrypt";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { jsonError, jsonOk, withAdmin } from "@/lib/api";
import { appendAuditEvent } from "@/lib/audit";
import { createUser, findUserByEmail, listUsers } from "@/lib/db";

export const runtime = "nodejs";

const CreateUserSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["admin", "member"]).default("member"),
});

export async function GET() {
  return withAdmin(async (user) => {
    return jsonOk({ users: await listUsers(), currentUserId: user.id });
  });
}

export async function POST(request: Request) {
  return withAdmin(async (user) => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError("Invalid JSON");
    }

    const parsed = CreateUserSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message || "Invalid input");
    }

    if (await findUserByEmail(parsed.data.email)) {
      return jsonError("A user with that email already exists", 409);
    }

    const id = uuidv4();
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    await createUser(id, parsed.data.email, passwordHash, parsed.data.role);
    await appendAuditEvent({
      actorId: user.id,
      actorEmail: user.email,
      action: "user.create",
      scope: parsed.data.email.trim().toLowerCase(),
      detail: `Created ${parsed.data.role} user`,
    });
    return jsonOk({ users: await listUsers() }, { status: 201 });
  });
}
