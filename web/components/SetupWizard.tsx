"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface Probe {
  model: string;
  channels: { id: number; name: string }[];
}

export default function SetupWizard() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [adminPassword, setAdminPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [host, setHost] = useState("");
  const [user, setUser] = useState("admin");
  const [pass, setPass] = useState("");
  const [probe, setProbe] = useState<Probe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"test" | "finish" | null>(null);

  useEffect(() => {
    // pre-wizard .env installs: prefill what we already know
    fetch("/api/setup")
      .then((r) => r.json())
      .then((d) => {
        if (d.envDvr?.host) setHost(d.envDvr.host);
        if (d.envDvr?.user) setUser(d.envDvr.user);
      })
      .catch(() => {});
  }, []);

  const next = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (adminPassword.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (adminPassword !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setStep(2);
  };

  const test = async () => {
    setBusy("test");
    setError(null);
    setProbe(null);
    try {
      const res = await fetch("/api/setup/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dvr: { host, user, pass } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Connection failed");
      setProbe(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const finish = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("finish");
    setError(null);
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminPassword, dvr: { host, user, pass } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Setup failed");
      router.push("/");
      router.refresh();
    } catch (e2) {
      setError((e2 as Error).message);
      setBusy(null);
    }
  };

  return (
    <div className="auth-screen">
      {step === 1 ? (
        <form className="auth-card wide" onSubmit={next}>
          <span className="wordmark">
            <span className="tick">▮</span>open-hik setup
          </span>
          <p className="auth-note">
            Welcome. First, create the password you&apos;ll use to open this app.
          </p>
          <label htmlFor="admin-pass">App password (min. 8 characters)</label>
          <input
            id="admin-pass"
            type="password"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            autoFocus
            required
          />
          <label htmlFor="admin-confirm">Repeat password</label>
          <input
            id="admin-confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
          {error && <p className="auth-error">{error}</p>}
          <button type="submit">Continue</button>
        </form>
      ) : (
        <form className="auth-card wide" onSubmit={finish}>
          <span className="wordmark">
            <span className="tick">▮</span>open-hik setup
          </span>
          <p className="auth-note">
            Now connect your Hikvision DVR/NVR. A read-only &quot;operator&quot; user is safer
            than admin, but both work.
          </p>
          <label htmlFor="dvr-host">DVR address</label>
          <input
            id="dvr-host"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="192.168.1.2"
            required
          />
          <label htmlFor="dvr-user">DVR user</label>
          <input id="dvr-user" value={user} onChange={(e) => setUser(e.target.value)} required />
          <label htmlFor="dvr-pass">DVR password</label>
          <input
            id="dvr-pass"
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            required
          />

          <button type="button" onClick={test} disabled={busy !== null || !host || !user || !pass}>
            {busy === "test" ? "Testing…" : "Test connection"}
          </button>

          {probe && (
            <div className="probe-result">
              <p>
                Found <b>{probe.model}</b> with {probe.channels.length} camera
                {probe.channels.length === 1 ? "" : "s"}:
              </p>
              <ul>
                {probe.channels.map((c) => (
                  <li key={c.id}>
                    CH {String(c.id).padStart(2, "0")} · {c.name}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {error && <p className="auth-error">{error}</p>}

          <div className="auth-row">
            <button type="button" className="secondary" onClick={() => setStep(1)}>
              Back
            </button>
            <button type="submit" disabled={busy !== null || !probe}>
              {busy === "finish" ? "Configuring…" : "Finish setup"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
