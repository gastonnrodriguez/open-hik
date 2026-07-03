"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";

interface Probe {
  model: string;
  channels: { id: number; name: string }[];
}

export default function SettingsView() {
  // DVR connection
  const [host, setHost] = useState("");
  const [httpPort, setHttpPort] = useState(80);
  const [rtspPort, setRtspPort] = useState(554);
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [dvrMsg, setDvrMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [probe, setProbe] = useState<Probe | null>(null);
  const [dvrBusy, setDvrBusy] = useState(false);

  // app password
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [passMsg, setPassMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [passBusy, setPassBusy] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d.dvr) {
          setHost(d.dvr.host);
          setUser(d.dvr.user);
          setHttpPort(d.dvr.httpPort);
          setRtspPort(d.dvr.rtspPort);
        }
      })
      .catch(() => {});
  }, []);

  const saveDvr = async (e: React.FormEvent) => {
    e.preventDefault();
    setDvrBusy(true);
    setDvrMsg(null);
    setProbe(null);
    try {
      const res = await fetch("/api/settings/dvr", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, user, pass, httpPort, rtspPort }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setProbe(data);
      setPass("");
      setDvrMsg({ kind: "ok", text: `Saved — connected to ${data.model}, streams re-synced.` });
    } catch (err) {
      setDvrMsg({ kind: "err", text: (err as Error).message });
    } finally {
      setDvrBusy(false);
    }
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassMsg(null);
    if (next !== confirm) {
      setPassMsg({ kind: "err", text: "New passwords don't match." });
      return;
    }
    setPassBusy(true);
    try {
      const res = await fetch("/api/settings/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current, next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setCurrent("");
      setNext("");
      setConfirm("");
      setPassMsg({ kind: "ok", text: "App password updated." });
    } catch (err) {
      setPassMsg({ kind: "err", text: (err as Error).message });
    } finally {
      setPassBusy(false);
    }
  };

  return (
    <>
      <Header />
      <div className="settings">
        <form className="auth-card wide" onSubmit={saveDvr}>
          <h2 className="settings-title">DVR connection</h2>
          <p className="auth-note">
            Changed the DVR&apos;s IP, ports or credentials? Update them here — the camera
            streams are re-registered automatically.
          </p>
          <label htmlFor="s-host">DVR address</label>
          <input id="s-host" value={host} onChange={(e) => setHost(e.target.value)} required />
          <div className="settings-ports">
            <div>
              <label htmlFor="s-http">HTTP port (ISAPI)</label>
              <input
                id="s-http"
                type="number"
                min={1}
                max={65535}
                value={httpPort}
                onChange={(e) => setHttpPort(Number(e.target.value))}
              />
            </div>
            <div>
              <label htmlFor="s-rtsp">RTSP port</label>
              <input
                id="s-rtsp"
                type="number"
                min={1}
                max={65535}
                value={rtspPort}
                onChange={(e) => setRtspPort(Number(e.target.value))}
              />
            </div>
          </div>
          <label htmlFor="s-user">DVR user</label>
          <input id="s-user" value={user} onChange={(e) => setUser(e.target.value)} required />
          <label htmlFor="s-pass">DVR password (leave empty to keep the current one)</label>
          <input id="s-pass" type="password" value={pass} onChange={(e) => setPass(e.target.value)} />
          {dvrMsg && (
            <p className={dvrMsg.kind === "ok" ? "settings-ok" : "auth-error"}>{dvrMsg.text}</p>
          )}
          {probe && (
            <div className="probe-result">
              <ul>
                {probe.channels.map((c) => (
                  <li key={c.id}>
                    CH {String(c.id).padStart(2, "0")} · {c.name}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button type="submit" disabled={dvrBusy}>
            {dvrBusy ? "Testing & saving…" : "Test & save"}
          </button>
        </form>

        <form className="auth-card wide" onSubmit={savePassword}>
          <h2 className="settings-title">App password</h2>
          <label htmlFor="p-current">Current password</label>
          <input
            id="p-current"
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
          />
          <label htmlFor="p-next">New password (min. 8 characters)</label>
          <input
            id="p-next"
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
          />
          <label htmlFor="p-confirm">Repeat new password</label>
          <input
            id="p-confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
          {passMsg && (
            <p className={passMsg.kind === "ok" ? "settings-ok" : "auth-error"}>{passMsg.text}</p>
          )}
          <button type="submit" disabled={passBusy}>
            {passBusy ? "Saving…" : "Change password"}
          </button>
        </form>
      </div>
    </>
  );
}
