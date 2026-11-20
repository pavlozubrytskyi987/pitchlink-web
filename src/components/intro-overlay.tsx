"use client";

import { useEffect, useMemo, useState } from "react";

// Six UGC clips, pre-rendered to ASCII frames by scripts/make-ascii.ts.
const CLIPS = [
  "1-sabg-bedroom",
  "2-sabg-kitchen",
  "3-polymarket",
  "4-kalshi-car",
  "5-sabg-chair",
  "6-kalshi-chair",
] as const;

// Bump the version suffix any time the intro copy changes so returning
// visitors see the new framing instead of their old dismissed flag.
const STORAGE_KEY = "pitchlink-intro-dismissed-v3";

type AsciiClip = {
  cols: number;
  rows: number;
  fps: number;
  frames: string[];
};

function AsciiTile({ src, index }: { src: string; index: number }) {
  const [clip, setClip] = useState<AsciiClip | null>(null);
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    let alive = true;
    fetch(src)
      .then((r) => r.json() as Promise<AsciiClip>)
      .then((data) => {
        if (alive) setClip(data);
      })
      .catch(() => {
        /* tile just stays blank; intro still works */
      });
    return () => {
      alive = false;
    };
  }, [src]);

  useEffect(() => {
    if (!clip) return;
    const interval = 1000 / clip.fps;
    const id = window.setInterval(() => {
      setFrame((f) => (f + 1) % clip.frames.length);
    }, interval);
    return () => window.clearInterval(id);
  }, [clip]);

  const body = clip?.frames[frame] ?? "";

  return (
    <div className="intro-tile" data-index={index}>
      <pre
        aria-hidden
        className="font-mono text-ink whitespace-pre"
        style={{
          // Braille glyphs: 2 dots wide, 4 dots tall. Tight leading keeps
          // the frame visually square at any width.
          fontSize: "clamp(9px, 1.25vw, 14px)",
          lineHeight: 0.9,
          letterSpacing: "0px",
          fontVariantLigatures: "none",
        }}
      >
        {body}
      </pre>
    </div>
  );
}

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

  const tiles = useMemo(() => CLIPS.map((slug) => `/intro/${slug}.json`), []);

  if (dismissed !== false) return null;

  return (
    <div
      role="dialog"
      aria-label="Pitchlink intro"
      className={`intro-root fixed inset-0 z-[80] flex items-center justify-center overflow-hidden bg-paper ${leaving ? "intro-leaving" : ""}`}
      onClick={dismiss}
    >
      {/* Six ASCII tiles arranged around the center. CSS handles position. */}
      <div className="intro-ring pointer-events-none absolute inset-0">
        {tiles.map((src, i) => (
          <div key={src} className={`intro-slot intro-slot-${i + 1}`}>
            <AsciiTile src={src} index={i} />
          </div>
        ))}
      </div>

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
          conversion — not reach. Every bid, every click, every payout
          on Solana. No agencies. No rate cards. No DMs. The auction
          sets the price, the chain proves the value.
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
          Click anywhere to continue
        </p>
      </div>
    </div>
  );
}
