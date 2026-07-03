import crypto from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { loadConfig, saveConfig } from "@/lib/config";

export const SESSION_COOKIE = "openhik_session";
const SESSION_DAYS = 30;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 32);
  return crypto.timingSafeEqual(candidate, Buffer.from(hash, "hex"));
}

function getSecret(): string {
  const cfg = loadConfig();
  if (cfg.secret) return cfg.secret;
  const secret = crypto.randomBytes(32).toString("hex");
  saveConfig({ secret });
  return secret;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("hex");
}

export function createSessionToken(): string {
  const expires = Date.now() + SESSION_DAYS * 86400000;
  return `${expires}.${sign(String(expires))}`;
}

export function verifySessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const [expires, mac] = token.split(".");
  if (!expires || !mac || Date.now() > Number(expires)) return false;
  const expected = sign(expires);
  return (
    mac.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))
  );
}

export function sessionCookieHeader(token: string): string {
  const maxAge = SESSION_DAYS * 86400;
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/** True when the setup wizard hasn't been completed yet. */
export function needsSetup(): boolean {
  return !loadConfig().adminHash;
}

export async function isAuthenticated(): Promise<boolean> {
  if (needsSetup()) return false;
  const jar = await cookies();
  return verifySessionToken(jar.get(SESSION_COOKIE)?.value);
}

/**
 * Guard for API routes. Returns a Response to send when access is denied,
 * null when the request may proceed.
 */
export async function requireAuth(): Promise<Response | null> {
  if (needsSetup()) {
    return Response.json({ error: "Setup required" }, { status: 403 });
  }
  if (!(await isAuthenticated())) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

/** Guard for pages: redirects to the wizard or the login form when needed. */
export async function guardPage(): Promise<void> {
  if (needsSetup()) redirect("/setup");
  if (!(await isAuthenticated())) redirect("/login");
}

/** Simple in-memory rate limit for login attempts. */
const attempts = new Map<string, { count: number; resetAt: number }>();

export function loginAllowed(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now > entry.resetAt) return true;
  return entry.count < 5;
}

export function recordLoginFailure(ip: string): void {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + 15 * 60000 });
  } else {
    entry.count++;
  }
}
