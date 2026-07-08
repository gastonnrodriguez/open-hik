"use client";

import { useEffect, useState } from "react";

/**
 * Shows the address other devices on the network use to reach this server —
 * exactly the host:port the browser loaded the page from. Click to copy.
 * Hidden when opened on localhost, where there is nothing useful to share.
 */
export default function ServerAddress() {
  const [addr, setAddr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const port = location.port || (location.protocol === "https:" ? "443" : "80");
    const host = location.hostname;
    const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";
    // When viewing on the server itself (localhost), the page host is useless to
    // share — ask the backend for the detected LAN IP so the address is still shown.
    if (!isLocal) {
      setAddr(`${host}:${port}`);
      return;
    }
    fetch("/api/config")
      .then((r) => r.json())
      .then((cfg) => {
        if (cfg.lanIp) setAddr(`${cfg.lanIp}:${port}`);
      })
      .catch(() => {});
  }, []);

  if (!addr) return null;

  const url = `${location.protocol}//${addr}`;

  return (
    <button
      className="server-addr"
      title="Dirección de este servidor — compartila para ver desde otra PC. Click para copiar."
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          /* clipboard blocked (non-HTTPS) — the address is still visible */
        }
      }}
    >
      <span className="server-addr-dot" />
      {copied ? "copiado" : addr}
    </button>
  );
}
