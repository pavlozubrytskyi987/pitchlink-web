"use client";

// Live on-chain click count for one creator. Pulls the aggregated count from
// /api/clicks/:creator (which sums every tracked link that credits the
// creator), then subscribes to the on-chain `clickRecorded` event. Each event
// whose `creator` matches bumps the local count immediately - no polling.

import { useConnection } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";

export type CreatorClicks = {
  clicks: number;
  /** True while the first fetch hasn't landed. */
  loading: boolean;
};

export function useCreatorClicks(creator: string | null): CreatorClicks {
  const { connection } = useConnection();
  const [clicks, setClicks] = useState<number | null>(null);

  useEffect(() => {
    if (!creator) {
      setClicks(null);
      return;
    }
    let alive = true;
    let unwatch: (() => void) | undefined;

    (async () => {
      try {
        const res = await fetch(`/api/clicks/${encodeURIComponent(creator)}`);
        if (!alive) return;
        if (res.ok) {
          const body = (await res.json()) as { clicks?: number };
          setClicks(body.clicks ?? 0);
        } else {
          setClicks(0);
        }
      } catch {
        setClicks(0);
      }

      // Live bumps.
      const program = await import("@/lib/program");
      if (!alive) return;
      unwatch = program.watchClickEvents(connection, (event) => {
        if (event.creator.toBase58() !== creator) return;
        setClicks((prev) => Math.max(prev ?? 0, Number(event.count)));
      });
    })().catch((error) => console.warn("[pitchlink] click feed failed", error));

    return () => {
      alive = false;
      unwatch?.();
    };
  }, [connection, creator]);

  return { clicks: clicks ?? 0, loading: clicks === null };
}
