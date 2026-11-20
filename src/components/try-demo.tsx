"use client";

// Interactive judge demo. Walks a visitor through the tracking loop with
// zero wallet requirements: inspect the count, open the tracked link (real
// 302 to the advertiser's site), come back, watch the confirmed on-chain
// counter update. Counts are only ever read from confirmed chain state.

import { useConnection } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import { CheckIcon, ExternalIcon } from "@/components/icons";
import { explorerAddress, shortAddress } from "@/lib/explorer";

type Props = {
  campaign: {
    linkId: string;
    brandName: string;
    destination: string;
    logoUrl: string | null;
    wallet: string;
  };
  counterPda: string;
  initialClicks: number;
};

export function TryDemo({ campaign, counterPda, initialClicks }: Props) {
  const { connection } = useConnection();
  const [clicks, setClicks] = useState(initialClicks);
  const [copied, setCopied] = useState(false);
  const [waiting, setWaiting] = useState(false);

  const linkUrl =
    typeof window === "undefined"
      ? `/go/${campaign.linkId}`
      : new URL(`/go/${campaign.linkId}`, window.location.origin).toString();

  useEffect(() => {
    let alive = true;
    let unwatch: (() => void) | undefined;

    const poll = async () => {
      try {
        const res = await fetch(`/api/links/${encodeURIComponent(campaign.linkId)}`);
        if (!res.ok || !alive) return;
        const body = (await res.json()) as { clicks?: number };
        if (typeof body.clicks === "number") {
          setClicks((prev) => {
            if (body.clicks! > prev) setWaiting(false);
            return Math.max(prev, body.clicks!);
          });
        }
      } catch {
        // retry on next tick
      }
    };
    const interval = window.setInterval(poll, 8000);
    void poll();

    import("@/lib/program").then((program) => {
      if (!alive) return;
      unwatch = program.watchClickEvents(connection, (event) => {
        if (event.linkId !== campaign.linkId) return;
        setWaiting(false);
        setClicks((prev) => Math.max(prev, Number(event.count)));
      });
    });

    return () => {
      alive = false;
      window.clearInterval(interval);
      unwatch?.();
    };
  }, [connection, campaign.linkId]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(linkUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div>
      <p className="text-[13px] font-medium uppercase tracking-[0.08em] text-ash">
        Live demonstration campaign
      </p>

      <div className="mt-4 flex items-center gap-4">
        {campaign.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={campaign.logoUrl}
            alt={`${campaign.brandName} logo`}
            className="size-14 rounded-[10px] border border-hairline bg-ink object-contain p-1.5"
          />
        ) : null}
        <div>
          <h1 className="text-[34px] font-semibold leading-none tracking-[-0.03em]">
            {campaign.brandName}
          </h1>
          <a
            href={explorerAddress(campaign.wallet)}
            target="_blank"
            rel="noopener noreferrer"
            className="group mt-1.5 inline-flex items-center gap-1 font-mono text-[12.5px] text-graphite hover:text-accent"
          >
            Advertiser wallet {shortAddress(campaign.wallet)}
            <ExternalIcon className="size-3 text-ash group-hover:text-accent" />
          </a>
        </div>
      </div>

      <p className="mt-5 max-w-[60ch] text-[15px] leading-snug text-graphite">
        This campaign was claimed by the auction winner with a wallet-signed
        setup. Its link redirects to the advertiser&rsquo;s site (shown
        openly below), and every visit submits a real Solana transaction to a
        public counter. Try it: open the link, come back, watch the count.
      </p>

      <div className="mt-7 grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
        <div className="rounded-[12px] border border-hairline p-4">
          <p className="text-[12px] text-graphite">Tracked campaign link</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-[10px] border border-hairline-strong bg-wash px-3.5 py-2.5 font-mono text-[13px]">
              {linkUrl.replace(/^https?:\/\//, "")}
            </code>
            <button
              type="button"
              onClick={() => void copy()}
              className="h-[42px] shrink-0 rounded-full border border-hairline-strong px-4 text-[13px] font-medium transition-colors hover:border-ink"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="mt-2 text-[12px] leading-snug text-ash">
            Redirects openly to:{" "}
            <span className="font-mono text-[11.5px] text-graphite">{campaign.destination}</span>
          </p>
          <a
            href={`/go/${campaign.linkId}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setWaiting(true)}
            className="mt-3 inline-flex h-11 items-center gap-2 rounded-full bg-ink px-5 text-[14px] font-medium text-paper transition-colors hover:bg-[#262626]"
          >
            Open the tracked link
            <ExternalIcon className="size-3.5" />
          </a>
        </div>

        <div className="rounded-[12px] border border-hairline p-4">
          <p className="text-[12px] text-graphite">Recorded redirects</p>
          <p className="mt-1.5 text-[40px] font-semibold leading-none tracking-[-0.03em]">
            {clicks.toLocaleString("en-US")}
          </p>
          <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-ash">
            {waiting ? (
              <>
                <span className="live-dot size-[5px] rounded-full bg-accent" />
                waiting for confirmation…
              </>
            ) : (
              <>
                <CheckIcon className="size-3 text-accent" />
                confirmed on-chain
              </>
            )}
          </p>
          <a
            href={explorerAddress(counterPda)}
            target="_blank"
            rel="noopener noreferrer"
            className="group mt-2 inline-flex items-center gap-1 font-mono text-[11.5px] text-graphite hover:text-accent"
          >
            ClickCounter {shortAddress(counterPda)}
            <ExternalIcon className="size-2.5 text-ash group-hover:text-accent" />
          </a>
        </div>
      </div>

      <p className="mt-6 max-w-[60ch] text-[12.5px] leading-snug text-ash">
        Redirect records are counter updates on Solana devnet. They are not
        unique-customer or revenue verification. That is the Conversion SDK
        on the roadmap.
      </p>
    </div>
  );
}
