"use client";

// Live on-chain click counts for every creator on the board. One fetch of
// /api/links (sums clicks per creator), one ClickRecorded event listener.
// Returns { [creatorPubkey]: clicks }.

import { useConnection } from "@solana/wallet-adapter-react";
import { useEffect, useRef, useState } from "react";

export type ClicksByCreator = Record<string, number>;

type LinksRow = { id: string; creator: string; clicks: number };

export function useAllClicks(): ClicksByCreator {
  const { connection } = useConnection();
  const [byCreator, setByCreator] = useState<ClicksByCreator>({});
  // Per-link last-seen count, for computing per-creator sums after live events.
  const perLink = useRef<Map<string, { creator: string; clicks: number }>>(new Map());

  useEffect(() => {
    let alive = true;
    let unwatch: (() => void) | undefined;

    const recompute = () => {
      const sums: ClicksByCreator = {};
      for (const { creator, clicks } of perLink.current.values()) {
        sums[creator] = (sums[creator] ?? 0) + clicks;
      }
      setByCreator(sums);
    };

    (async () => {
      try {
        const res = await fetch("/api/links");
        if (!alive || !res.ok) return;
        const rows = (await res.json()) as LinksRow[];
        perLink.current = new Map(
          rows.map((r) => [r.id, { creator: r.creator, clicks: r.clicks ?? 0 }]),
        );
        recompute();
      } catch (error) {
        console.warn("[pitchlink] clicks seed failed", error);
      }

      const program = await import("@/lib/program");
      if (!alive) return;
      unwatch = program.watchClickEvents(connection, (event) => {
        // Only bump a link we already know about. A freshly-minted link gets
        // its first row on the next /api/links refresh.
        const row = perLink.current.get(event.linkId);
        if (!row) return;
        const next = Math.max(row.clicks, Number(event.count));
        if (next === row.clicks) return;
        perLink.current.set(event.linkId, { ...row, clicks: next });
        recompute();
      });
    })();

    return () => {
      alive = false;
      unwatch?.();
    };
  }, [connection]);

  return byCreator;
}
