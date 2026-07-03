import { mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

/**
 * Persistent app config, written by the setup wizard into the data volume.
 * Falls back to .env (DVR_*) so pre-wizard installs keep working.
 */

export const DATA_DIR = process.env.OPENHIK_DATA_DIR || path.join(process.cwd(), ".data");
const CONFIG_FILE = path.join(DATA_DIR, "openhik.json");

export interface DvrConfig {
  host: string;
  user: string; // stored raw (not URL-encoded)
  pass: string;
}

export interface AppConfig {
  dvr?: DvrConfig;
  adminHash?: string; // scrypt "salt:hash" hex
  secret?: string; // HMAC key for session cookies
}

export function loadConfig(): AppConfig {
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf8"));
  } catch {
    return {};
  }
}

export function saveConfig(patch: Partial<AppConfig>): AppConfig {
  const next = { ...loadConfig(), ...patch };
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2), { mode: 0o600 });
  return next;
}

/** Active DVR credentials: wizard config first, then .env (which stores them URL-encoded). */
export function getDvr(): DvrConfig | null {
  const cfg = loadConfig();
  if (cfg.dvr?.host) return cfg.dvr;
  if (process.env.DVR_HOST && process.env.DVR_USER && process.env.DVR_PASS) {
    return {
      host: process.env.DVR_HOST,
      user: decodeURIComponent(process.env.DVR_USER),
      pass: decodeURIComponent(process.env.DVR_PASS),
    };
  }
  return null;
}

/** RTSP URL for a live channel or recording track, credentials embedded. */
export function rtspUrl(dvr: DvrConfig, pathAndQuery: string): string {
  return `rtsp://${encodeURIComponent(dvr.user)}:${encodeURIComponent(dvr.pass)}@${dvr.host}:554${pathAndQuery}`;
}
