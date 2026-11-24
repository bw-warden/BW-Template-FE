import { getIronSession, SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { requireAppSecret } from "@/lib/crypto";
import { findUserById, UserRole } from "@/lib/db";

export type SessionData = {
  userId?: string;
  email?: string;
  isLoggedIn: boolean;
};

export type AppUser = {
  id: string;
  email: string;
  role: UserRole;
};

/** 8 hours — short-lived admin sessions for a credentialed ops tool. */
const SESSION_TTL_SECONDS = 60 * 60 * 8;

function sessionOptions(): SessionOptions {
  return {
    password: requireAppSecret(),
    cookieName: "bw_template_fe_session",
    ttl: SESSION_TTL_SECONDS,
    cookieOptions: {
      httpOnly: true,
      // Set COOKIE_SECURE=true when serving over HTTPS (reverse proxy / TLS)
      secure: process.env.COOKIE_SECURE === "true",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    },
  };
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions());
}

/** Role comes from the DB on every call so deletes and role changes apply immediately. */
export async function getCurrentUser(): Promise<AppUser | null> {
  const session = await getSession();
  if (!session.isLoggedIn || !session.userId) return null;
  const user = await findUserById(session.userId);
  if (!user) return null;
  return { id: user.id, email: user.email, role: user.role };
}

export async function requireSession() {
  return getCurrentUser();
}
