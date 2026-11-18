"use client";

import { useCreatorClicks } from "@/lib/use-creator-clicks";

export function ConversionStat({ creator }: { creator: string | null }) {
  const { clicks, loading } = useCreatorClicks(creator);
  const empty = !creator || loading || clicks === 0;
  return (
    <div className="mt-10 border-t border-ink pt-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[13px] font-medium">Clicks on-chain</p>
        <p className="text-[12px] text-ash">
          {!creator ? "no link yet" : loading ? "reading…" : "live"}
        </p>
      </div>
      <p
        className={`mt-1 font-serif text-[56px] leading-none tracking-[-0.02em] ${
          empty ? "text-[#c9c9c6]" : "text-ink"
        }`}
      >
        {!creator ? "—" : clicks.toLocaleString("en-US")}
      </p>
      <p className="mt-2 max-w-[48ch] text-[14px] leading-snug text-graphite">
        Verified clicks through this creator&rsquo;s tracked link, counted on
        Solana. This is what the slot is priced on.
      </p>
    </div>
  );
}
