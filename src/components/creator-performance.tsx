"use client";

// Creator performance, kept deliberately small: one card for recorded
// redirects (per campaign, read from the on-chain ClickCounter PDAs — never
// summed across unrelated counters), one honest placeholder card for
// verified conversions (Conversion SDK, not built), plus a compact campaign
// activity list with Explorer links.

import { useConnection } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import { ExternalIcon } from "@/components/icons";
import { fetchCampaigns, type CampaignDto } from "@/lib/campaign-client";
import { explorerAddress } from "@/lib/explorer";

type LinkStat = { id: string; counter: string; clicks: number };

function shortKey(key: string): string {
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

export function CreatorPerformance({
  creators,
}: {
  /** Creator wallets whose tracked links should appear on this profile. */
  creators: string[];
}) {
  const { connection } = useConnection();
  const [links, setLinks] = useState<LinkStat[] | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignDto[]>([]);
  const creatorKey = creators.join(",");

  useEffect(() => {
    if (creators.length === 0) return;
    let alive = true;
    let unwatch: (() => void) | undefined;

    async function load() {
      try {
        const [clicksBodies, campaignRows] = await Promise.all([
          Promise.all(
            creators.map(async (key) => {
              const res = await fetch(`/api/clicks/${encodeURIComponent(key)}`);
              if (!res.ok) return [] as LinkStat[];
              const body = (await res.json()) as { links?: LinkStat[] };
              return Array.isArray(body.links) ? body.links : [];
            }),
          ),
          fetchCampaigns(),
        ]);
        if (!alive) return;
        // Per-link rows only — never invent a cross-campaign total for
        // unrelated PDAs. Deduplicate by link id if a key appears twice.
        const merged = new Map<string, LinkStat>();
        for (const row of clicksBodies.flat()) merged.set(row.id, row);
        setLinks([...merged.values()]);
        setCampaigns(campaignRows.filter((c) => creators.includes(c.creator)));
      } catch {
        if (alive) setLinks([]);
      }
      const program = await import("@/lib/program");
      if (!alive) return;
      unwatch = program.watchClickEvents(connection, (event) => {
        setLinks((prev) => {
          if (!prev) return prev;
          let touched = false;
          const next = prev.map((row) => {
            if (row.id !== event.linkId) return row;
            touched = true;
            return { ...row, clicks: Math.max(row.clicks, Number(event.count)) };
          });
          return touched ? next : prev;
        });
      });
    }
    void load().catch(() => {});
    return () => {
      alive = false;
      unwatch?.();
    };
    // creators is compared via creatorKey (stable join) to avoid re-fetch loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, creatorKey]);

  const campaignFor = (linkId: string) => campaigns.find((c) => c.linkId === linkId);
  // Sum only the rows on this profile (each is its own ClickCounter PDA).
  const total = (links ?? []).reduce((sum, l) => sum + l.clicks, 0);
  const loading = links === null;

  return (
    <div className="mt-10 border-t border-ink pt-4">
      <p className="text-[13px] font-medium">Sponsorship performance</p>
      <p className="mt-1 text-[12px] text-ash">
        Read from Solana. Redirect records are not verified customers.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-[12px] border border-hairline p-4">
          <p className="text-[12px] text-graphite">Recorded redirects</p>
          <p
            className={`mt-1.5 text-[34px] font-semibold leading-none tracking-[-0.03em] ${
              loading || total === 0 ? "text-[#c9c9c6]" : "text-ink"
            }`}
          >
            {loading ? "—" : total.toLocaleString("en-US")}
          </p>
          <p className="mt-1.5 text-[11.5px] leading-snug text-ash">
            Confirmed on-chain counter updates, this creator&rsquo;s campaigns.
          </p>
        </div>
        <div className="rounded-[12px] border border-dashed border-hairline-strong p-4">
          <p className="text-[12px] text-graphite">Verified conversions</p>
          <p className="mt-1.5 text-[15px] font-medium leading-snug text-ash">
            Coming soon — Conversion SDK
          </p>
          <p className="mt-1.5 text-[11.5px] leading-snug text-ash">
            Qualifying on-chain actions (deposits, swaps) attributed to a
            redirect. Not claimed today.
          </p>
        </div>
      </div>

      {loading ? null : links!.length === 0 ? (
        <p className="mt-4 text-[12.5px] text-ash">No tracked campaigns yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-hairline border-t border-hairline">
          {links!.map((row) => {
            const campaign = campaignFor(row.id);
            return (
              <li key={row.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium">
                    {campaign ? campaign.brandName : "Tracked link"}{" "}
                    <span className="font-mono text-[11.5px] font-normal text-ash">
                      /go/{row.id}
                    </span>
                  </p>
                  <a
                    href={explorerAddress(row.counter)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group mt-0.5 inline-flex items-center gap-1 font-mono text-[11.5px] text-graphite hover:text-accent"
                  >
                    ClickCounter {shortKey(row.counter)}
                    <ExternalIcon className="size-2.5 text-ash group-hover:text-accent" />
                  </a>
                </div>
                <p className="shrink-0 text-[15px] tabular-nums">
                  {row.clicks.toLocaleString("en-US")}
                  <span className="ml-1 text-[11px] text-ash">
                    {row.clicks === 1 ? "redirect" : "redirects"}
                  </span>
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
