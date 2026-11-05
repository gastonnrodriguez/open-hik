"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";

interface Probe {
  model: string;
  channels: { id: number; name: string }[];
}

interface ChannelCodecs {
  id: number;
  main: string | null;
  sub: string | null;
}

const isH265 = (c: string | null) => !!c && /265|hevc/i.test(c);

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

  // stream encoding
  const [codecs, setCodecs] = useState<ChannelCodecs[] | null>(null);
  const [codecMsg, setCodecMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [codecBusy, setCodecBusy] = useState(false);

  const loadCodecs = () =>
    fetch("/api/settings/codecs")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        setCodecs(d.channels);
      })
      .catch((err) => setCodecMsg({ kind: "err", text: (err as Error).message }));

  useEffect(() => {
    loadCodecs();
  }, []);

  const switchSubToH264 = async () => {
    setCodecBusy(true);
    setCodecMsg(null);
    try {
      const res = await fetch("/api/settings/codecs", { method: "PUT" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setCodecs(data.channels);
      setCodecMsg({ kind: "ok", text: "Sub streams switched to H.264 — the grid now plays without transcoding." });
    } catch (err) {
      setCodecMsg({ kind: "err", text: (err as Error).message });
    } finally {
      setCodecBusy(false);
    }
  };

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
      loadCodecs();
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

        <div className="auth-card wide">
          <h2 className="settings-title">Stream encoding</h2>
          <p className="auth-note">
            Browsers can&apos;t play H.265, so H.265 streams are transcoded to H.264 on this
            server, which costs CPU. Recommended: keep the <b>main</b> stream on H.265 (it&apos;s
            what the DVR records — roughly half the disk space of H.264) and switch the{" "}
            <b>sub</b> stream (the live grid) to H.264, so the grid plays with no transcoding.
            The sub stream isn&apos;t recorded, so this costs no disk space.
          </p>
          {codecs && (
            <div className="probe-result">
              <ul>
                {codecs.map((c) => (
                  <li key={c.id}>
                    CH {String(c.id).padStart(2, "0")} · main {c.main ?? "?"} · sub {c.sub ?? "?"}
                    {isH265(c.sub) ? " (transcoded)" : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {codecMsg && (
            <p className={codecMsg.kind === "ok" ? "settings-ok" : "auth-error"}>{codecMsg.text}</p>
          )}
          {codecs && codecs.some((c) => isH265(c.sub)) ? (
            <button type="button" onClick={switchSubToH264} disabled={codecBusy}>
              {codecBusy ? "Switching…" : "Switch sub streams to H.264"}
            </button>
          ) : (
            codecs && <p className="settings-ok">All sub streams are H.264 — no transcoding for the grid.</p>
          )}
        </div>

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
