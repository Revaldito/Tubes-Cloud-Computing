import "./env";
import { SignJWT, jwtVerify } from "jose";
import type { IncomingMessage } from "node:http";
import type { SessionUser } from "./types";
import { dbQuery } from "./db";

export const SESSION_COOKIE_NAME = "banatier_session";

function getJwtSecretKey(): Uint8Array {
  const secret = process.env.JWT_SECRET || "banatier-default-stateless-jwt-secret-2026";
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({
    sub: String(user.id),
    name: user.name,
    email: user.email,
    whatsapp: user.whatsapp,
    role: user.role,
    isMember: user.isMember,
    memberTierSlug: user.memberTierSlug,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getJwtSecretKey());
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecretKey());
    if (!payload.sub) return null;
    return {
      id: Number(payload.sub),
      name: String(payload.name ?? ""),
      email: String(payload.email ?? ""),
      whatsapp: String(payload.whatsapp ?? ""),
      role: payload.role === "admin" ? "admin" : "buyer",
      isMember: Boolean(payload.isMember),
      memberTierSlug: String(payload.memberTierSlug ?? "non-member"),
    };
  } catch {
    return null;
  }
}

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    out[k] = decodeURIComponent(v);
  }
  return out;
}

export async function getRequestUser(req: IncomingMessage): Promise<SessionUser | null> {
  const authHeader = req.headers.authorization;
  let token = "";
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim();
  } else {
    const cookies = parseCookies(req.headers.cookie);
    token = cookies[SESSION_COOKIE_NAME] || "";
  }

  if (!token) return null;
  const decoded = await verifySessionToken(token);
  if (!decoded) return null;

  const res = await dbQuery<{
    id: number;
    name: string;
    email: string;
    whatsapp: string;
    role: "buyer" | "admin";
    is_member: boolean;
    member_tier_slug: string;
  }>(
    `SELECT id, name, email, whatsapp, role, is_member, member_tier_slug
     FROM users WHERE id = $1`,
    [decoded.id]
  );

  const row = res.rows[0];
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    whatsapp: row.whatsapp,
    role: row.role,
    isMember: row.is_member,
    memberTierSlug: row.member_tier_slug,
  };
}

export function buildSessionSetCookieHeader(token: string, maxAgeSeconds = 60 * 60 * 24 * 7): string {
  const securePart =
    process.env.NODE_ENV === "production" && process.env.USE_HTTPS === "true" ? "; Secure" : "";
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(
    token
  )}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${securePart}`;
}
