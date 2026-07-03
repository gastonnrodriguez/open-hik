import crypto from "crypto";
import { getDvr, type DvrConfig } from "@/lib/config";

/**
 * Minimal ISAPI client with HTTP digest auth (Hikvision devices don't do basic).
 * Credentials come from the wizard config or .env and never reach the browser.
 */

const md5 = (s: string) => crypto.createHash("md5").update(s).digest("hex");

export function dvrConfigured(): boolean {
  return getDvr() !== null;
}

export async function isapiFetch(
  path: string,
  init?: RequestInit,
  dvrOverride?: DvrConfig
): Promise<Response> {
  const dvr = dvrOverride ?? getDvr();
  if (!dvr) return new Response("DVR not configured", { status: 503 });
  const { host, user, pass } = dvr;
  const url = `http://${host}:${dvr.httpPort || 80}${path}`;
  const method = init?.method || "GET";

  const first = await fetch(url, { ...init, cache: "no-store" });
  if (first.status !== 401) return first;

  const challenge = first.headers.get("www-authenticate") || "";
  await first.arrayBuffer().catch(() => {});

  const params: Record<string, string> = {};
  for (const m of challenge.matchAll(/(\w+)=(?:"([^"]*)"|([^,\s]+))/g)) {
    params[m[1]] = m[2] ?? m[3];
  }
  if (!params.realm || !params.nonce) return first;

  const ha1 = md5(`${user}:${params.realm}:${pass}`);
  const ha2 = md5(`${method}:${path}`);
  let response: string;
  let extra = "";
  if (params.qop && params.qop.includes("auth")) {
    const cnonce = crypto.randomBytes(8).toString("hex");
    const nc = "00000001";
    response = md5(`${ha1}:${params.nonce}:${nc}:${cnonce}:auth:${ha2}`);
    extra = `, qop=auth, nc=${nc}, cnonce="${cnonce}"`;
  } else {
    response = md5(`${ha1}:${params.nonce}:${ha2}`);
  }
  const auth =
    `Digest username="${user}", realm="${params.realm}", nonce="${params.nonce}", ` +
    `uri="${path}", response="${response}", algorithm=MD5` +
    (params.opaque ? `, opaque="${params.opaque}"` : "") +
    extra;

  return fetch(url, {
    ...init,
    cache: "no-store",
    headers: { ...(init?.headers as Record<string, string>), Authorization: auth },
  });
}

/** Extract the text of the first <tag> in an XML fragment. */
export function xmlText(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`));
  return m ? m[1].trim() : null;
}

/** Extract every <tag>...</tag> block (including nested content). */
export function xmlBlocks(xml: string, tag: string): string[] {
  return [...xml.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "g"))].map((m) => m[1]);
}
