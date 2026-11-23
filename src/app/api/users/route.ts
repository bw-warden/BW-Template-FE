import bcrypt from "bcrypt";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { jsonError, jsonOk, withAdmin } from "@/lib/api";
import { createUser, findUserByEmail, listUsers } from "@/lib/db";

export const runtime = "nodejs";

const CreateUserSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["admin", "member"]).default("member"),
});

export async function GET() {
  return withAdmin(async (user) => {
    return jsonOk({ users: listUsers(), currentUserId: user.id });
  });
}

export async function POST(request: Request) {
  return withAdmin(async () => {
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

    if (findUserByEmail(parsed.data.email)) {
      return jsonError("A user with that email already exists", 409);
    }

    const id = uuidv4();
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    createUser(id, parsed.data.email, passwordHash, parsed.data.role);
    return jsonOk({ users: listUsers() }, { status: 201 });
  });
}
