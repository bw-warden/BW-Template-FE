import { getIronSession, SessionOptions } from "iron-session";
import { cookies } from "next/headers";
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

function sessionOptions(): SessionOptions {
  const password = process.env.APP_SECRET || process.env.CREDENTIALS_KEY;
  if (!password || password.length < 32) {
    throw new Error(
      "APP_SECRET (or CREDENTIALS_KEY) must be at least 32 characters for sessions",
    );
  }
  return {
    password,
    cookieName: "bw_frontend_session",
    cookieOptions: {
      httpOnly: true,
      // Set COOKIE_SECURE=true when serving over HTTPS (reverse proxy / TLS)
      secure: process.env.COOKIE_SECURE === "true",
      sameSite: "lax",
      path: "/",
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
  const user = findUserById(session.userId);
  if (!user) return null;
  return { id: user.id, email: user.email, role: user.role };
}

export async function requireSession() {
  return getCurrentUser();
}
