"use client";

import { useEffect, useState } from "react";

// Bump the version suffix any time the intro copy changes so returning
// visitors see the new framing instead of their old dismissed flag.
const STORAGE_KEY = "pitchlink-intro-dismissed-v4";

export function IntroOverlay() {
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    // ?intro=1 forces the overlay open; ?intro=0 forces it closed.
    try {
      const params = new URLSearchParams(window.location.search);
      const force = params.get("intro");
      if (force === "1") {
        setDismissed(false);
        return;
      }
      if (force === "0") {
        setDismissed(true);
        return;
      }
      setDismissed(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  function dismiss() {
    if (leaving) return;
    setLeaving(true);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    window.setTimeout(() => setDismissed(true), 620);
  }

  useEffect(() => {
    if (dismissed !== false) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Enter") {
        e.preventDefault();
        dismiss();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // dismiss closes over latest leaving/dismissed; rebind when those change
  }, [dismissed, leaving]);

  if (dismissed !== false) return null;

  return (
    <div
      role="dialog"
      aria-label="Pitchlink intro"
      className={`intro-root fixed inset-0 z-[80] flex items-center justify-center overflow-hidden bg-paper ${leaving ? "intro-leaving" : ""}`}
    >
      <div className="intro-center relative z-10 max-w-[760px] px-6 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.35em] text-accent">
          Pitchlink · on-chain creator ads · Solana
        </p>
        <h1 className="mt-5 text-[40px] font-semibold leading-[1.02] tracking-[-0.03em] text-balance sm:text-[64px]">
          If your audience converts,
          <br />
          brands fight for you.
        </h1>
        <p className="mx-auto mt-6 max-w-[54ch] text-[15px] leading-[1.6] text-graphite sm:text-[17px]">
          Small creators with real action get bid up by brands who want
          that action, not reach. Every bid, every redirect, every
          payout recorded on Solana. No agencies. No rate cards. No DMs.
          The auction sets the price, the chain proves the value.
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="intro-cta mt-10 inline-flex h-12 items-center gap-2 rounded-full bg-ink px-7 text-[14px] font-medium text-paper transition-colors hover:bg-[#262626]"
        >
          Enter the marketplace
          <span aria-hidden>→</span>
        </button>
        <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.25em] text-ash">
          Press Enter to continue
        </p>
      </div>
    </div>
  );
}
