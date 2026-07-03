"use client";

import { useEffect, useState } from "react";

export default function Clock() {
  const [now, setNow] = useState<string>("");

  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleTimeString([], { hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="clock" suppressHydrationWarning>
      {now}
    </span>
  );
}
