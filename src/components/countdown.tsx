"use client";

import { useEffect, useState } from "react";

function format(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d ? `${d}d ` : ""}${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** Ticking countdown to a unix time; renders a stable placeholder on the server. */
export function Countdown({ to, ended = "Now" }: { to: number; ended?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Math.floor(Date.now() / 1000));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);
  if (now === null) return <>--:--:--</>;
  const left = to - now;
  return <>{left > 0 ? format(left) : ended}</>;
}
