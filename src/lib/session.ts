import { getIronSession, SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export type SessionData = {
  userId?: string;
  email?: string;
  isLoggedIn: boolean;
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
    cookieName: "bw_konica_session",
    cookieOptions: {
      httpOnly: true,
      // HTTP LAN/public port 3000 for external testers — set COOKIE_SECURE=true behind TLS
      secure: process.env.COOKIE_SECURE === "true",
      sameSite: "lax",
      path: "/",
    },
  };
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions());
}

export async function requireSession() {
  const session = await getSession();
  if (!session.isLoggedIn || !session.userId) {
    return null;
  }
  return session;
}
