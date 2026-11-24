import bcrypt from "bcrypt";
import { z } from "zod";
import { jsonError, jsonOk, withAdmin } from "@/lib/api";
import {
  countAdmins,
  deleteUser,
  findUserById,
  listUsers,
  updateUserPassword,
  updateUserRole,
} from "@/lib/db";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const UpdateUserSchema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .optional(),
    role: z.enum(["admin", "member"]).optional(),
  })
  .refine((v) => v.password !== undefined || v.role !== undefined, {
    message: "Nothing to update",
  });

export async function PATCH(request: Request, { params }: Params) {
  return withAdmin(async (current) => {
    const { id } = await params;
    const target = await findUserById(id);
    if (!target) return jsonError("User not found", 404);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError("Invalid JSON");
    }

    const parsed = UpdateUserSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message || "Invalid input");
    }

    if (parsed.data.role && parsed.data.role !== target.role) {
      if (target.id === current.id) {
        return jsonError("You cannot change your own role", 400);
      }
      if (target.role === "admin" && (await countAdmins()) <= 1) {
        return jsonError("At least one admin is required", 400);
      }
      await updateUserRole(target.id, parsed.data.role);
    }

    if (parsed.data.password) {
      await updateUserPassword(
        target.id,
        await bcrypt.hash(parsed.data.password, 12),
      );
    }

    return jsonOk({ users: await listUsers() });
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  return withAdmin(async (current) => {
    const { id } = await params;
    const target = await findUserById(id);
    if (!target) return jsonError("User not found", 404);
    if (target.id === current.id) {
      return jsonError("You cannot delete your own account", 400);
    }
    if (target.role === "admin" && (await countAdmins()) <= 1) {
      return jsonError("At least one admin is required", 400);
    }
    await deleteUser(target.id);
    return jsonOk({ users: await listUsers() });
  });
}
