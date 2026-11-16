"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Clock from "@/components/Clock";
import ServerAddress from "@/components/ServerAddress";
import { useEffect, useState, type ReactNode } from "react";

interface DiskSummary {
  /** Across all disks, 0-100. */
  freePercent: number;
  capacityGB: number;
  freeGB: number;
  /** Set when the DVR reports a disk fault, e.g. "hdd1: error". */
  problem: string | null;
  /** How many days back the oldest footage is. */
  keptDays: number | null;
}

export default function Header({ right }: { right?: ReactNode }) {
  const path = usePathname();
  const [disk, setDisk] = useState<DiskSummary | null>(null);

  // disk space at a glance on every page; a failing disk means nothing is being recorded
  useEffect(() => {
    const load = () =>
      fetch("/api/status")
        .then((r) => (r.ok ? r.json() : null))
        .then((s) => {
          if (!s?.disks) return;
          const disks = s.disks as { name: string; status: string; capacityMB: number; freeMB: number }[];
          const capacity = disks.reduce((sum, d) => sum + d.capacityMB, 0);
          const free = disks.reduce((sum, d) => sum + d.freeMB, 0);
          const bad = disks.find((d) => !/^(ok|idle)$/i.test(d.status));
          const now = Date.parse(`${s.deviceTime ?? new Date().toISOString().slice(0, 19)}Z`);
          setDisk({
            freePercent: capacity > 0 ? Math.round((free / capacity) * 100) : 0,
            capacityGB: Math.round(capacity / 1024),
            freeGB: Math.round(free / 1024),
            problem: s.diskProblem ? (bad ? `${bad.name}: ${bad.status}` : "no disk") : null,
            keptDays: s.oldestRecording ? Math.floor((now - Date.parse(`${s.oldestRecording}Z`)) / 86400000) : null,
          });
        })
        .catch(() => {});
    load();
    const id = setInterval(load, 5 * 60000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="header">
      <div className="header-left">
        <span className="wordmark">
          <span className="tick">▮</span>open-hik
        </span>
        <nav className="nav">
          <Link href="/" className={path === "/" ? "active" : ""}>
            live
          </Link>
          <Link href="/search" className={path === "/search" ? "active" : ""}>
            search
          </Link>
          <Link href="/playback" className={path === "/playback" ? "active" : ""}>
            playback
          </Link>
          <Link href="/settings" className={path === "/settings" ? "active" : ""}>
            settings
          </Link>
        </nav>
      </div>
      <div className="header-right">
        {right}
        {disk && (
          <Link
            href="/settings"
            className={disk.problem ? "disk-meter bad" : "disk-meter"}
            title={
              disk.problem
                ? "The DVR reports a disk problem — recording may have stopped"
                : `${disk.freeGB} GB free of ${disk.capacityGB} GB` +
                  (disk.freePercent === 0 ? " — full, the DVR records over the oldest footage" : "") +
                  (disk.keptDays !== null ? `. Recordings go back ${disk.keptDays} days.` : "")
            }
          >
            <span>disk</span>
            <span
              className="disk-meter-bar"
              role="img"
              aria-label={`${100 - disk.freePercent}% used`}
            >
              <span style={{ width: `${100 - disk.freePercent}%` }} />
            </span>
            {disk.problem ? (
              <b>⚠ {disk.problem}</b>
            ) : (
              <span>
                <b>{disk.freePercent}%</b> free
                {disk.keptDays !== null ? ` · ${disk.keptDays} d` : ""}
              </span>
            )}
          </Link>
        )}
        <ServerAddress />
        <Clock />
        <button
          className="logout-btn"
          title="Sign out"
          aria-label="Sign out"
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            window.location.href = "/login";
          }}
        >
          ⏻
        </button>
      </div>
    </header>
  );
}
