"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Clock from "@/components/Clock";
import type { ReactNode } from "react";

export default function Header({ right }: { right?: ReactNode }) {
  const path = usePathname();
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
