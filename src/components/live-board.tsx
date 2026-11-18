"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import Link from "next/link";
import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { BidTicker } from "@/components/bid-ticker";
import { CreatorTile, type TileLive } from "@/components/creator-tile";
import { CREATORS, type Creator } from "@/data/creators";
import { ChainStatus, ProofLink } from "@/components/chain-status";
import { subscribeFeed, type BidEntry } from "@/lib/bid-feed";
import { PROGRAM_ID } from "@/lib/config";
import { useHeroAuction } from "@/lib/use-hero-auction";
import { observeInView, observeNear } from "@/lib/visibility";

type SortKey = "hot" | "ending" | "bid";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "hot", label: "Hot" },
  { key: "ending", label: "Ending soon" },
  { key: "bid", label: "Top bid" },
];

type Props = {
  creators?: Creator[];
  /** Real on-chain values per creator slug. Overrides the seeded defaults. */
  live?: Record<string, Partial<TileLive>>;
};

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(REDUCED_MOTION);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
}

function seededLive(creators: Creator[]): Record<string, TileLive> {
  const out: Record<string, TileLive> = {};
  creators.forEach((c, i) => {
    const live = c.status === "live";
    out[c.slug] = {
      // The live hero's bid and end time are read from its devnet auction
      // account (useHeroAuction); nothing is invented while that loads.
      currentBidSol: null,
      auctionEndsAt: null,
      watchers: live ? 8 : 2 + ((i * 3) % 7),
      lastBid: null,
    };
  });
  return out;
}

const BoardTile = memo(function BoardTile({
  creator,
  base,
  override,
  reducedMotion,
}: {
  creator: Creator;
  base: TileLive;
  override: Partial<TileLive> | undefined;
  reducedMotion: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const stopNear = observeNear(el, (visible) => {
      if (visible) setNear(true);
    });
    const stopInView = observeInView(el, setInView);
    return () => {
      stopNear();
      stopInView();
    };
  }, []);

  const live = useMemo(
    () => (override ? { ...base, ...override } : base),
    [base, override],
  );

  const tile = (
    <CreatorTile
      creator={creator}
      live={live}
      mountVideo={near && !reducedMotion}
      active={inView}
      animate={!reducedMotion}
    />
  );
  // Live hero renders its own inner Link (the Place bid button) and may show
  // an <a> to Solana Explorer, so we don't wrap it in another <Link>.
  return (
    <div ref={ref} data-slug={creator.slug}>
      {creator.status === "live" ? (
        tile
      ) : (
        <Link
          href={`/creator/${creator.slug}`}
          className="block rounded-[18px] outline-offset-2 focus-visible:outline-2 focus-visible:outline-live"
        >
          {tile}
        </Link>
      )}
    </div>
  );
});

function WalletSlot() {
  const { connected, disconnect } = useWallet();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  if (!ready)
    return (
      <div
        className="h-9 w-[132px] rounded-full bg-fg/90"
        aria-hidden
      />
    );
  return (
    <>
      <WalletMultiButton />
      {connected ? (
        <button
          type="button"
          onClick={() => void disconnect()}
          className="hidden h-9 rounded-full border border-line-strong px-3 text-[13px] text-fg-2 transition-colors hover:border-fg-3 hover:text-fg sm:block"
        >
          Disconnect
        </button>
      ) : null}
    </>
  );
}

export function LiveBoard({ creators = CREATORS, live }: Props) {
  const [sort, setSort] = useState<SortKey>("hot");
  const [seeded, setSeeded] = useState(() => seededLive(creators));
  const [latestReal, setLatestReal] = useState<Record<string, BidEntry>>({});
  const reducedMotion = useReducedMotion();
  const gridRef = useRef<HTMLDivElement>(null);
  const flipFrom = useRef<Map<string, DOMRect> | null>(null);

  // Promote the most recent on-chain bid per creator from the shared feed so
  // the live tile can show its Explorer link.
  useEffect(() => {
    return subscribeFeed((entries) => {
      const next: Record<string, BidEntry> = {};
      for (const e of entries) {
        if (e.signature && !next[e.creatorSlug]) next[e.creatorSlug] = e;
      }
      setLatestReal((prev) => {
        const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
        for (const k of keys) {
          if (prev[k]?.id !== next[k]?.id) return next;
        }
        return prev;
      });
    });
  }, []);

  // The hero tile's bid, end time and auction address come from the real
  // devnet auction account. Explicit `live` values from the caller still win.
  const hero = creators.find((c) => c.status === "live");
  const heroChain = useHeroAuction(hero);
  const liveAll = useMemo(() => {
    if (!hero || !heroChain) return live;
    const lamports = Math.round(heroChain.currentBidSol * 1e9);
    const chain: Partial<TileLive> = {
      currentBidSol: heroChain.currentBidSol,
      auctionEndsAt: heroChain.endsAt,
      auctionAddress: heroChain.address,
      settled: heroChain.settled,
      lastBid: lamports > 0 ? { id: lamports, amountSol: heroChain.currentBidSol } : null,
    };
    return { ...live, [hero.slug]: { ...chain, ...live?.[hero.slug] } };
  }, [hero, heroChain, live]);

  // Simulated watcher drift: one tile every few seconds, so one tile re-renders.
  useEffect(() => {
    const id = window.setInterval(() => {
      const creator = creators[Math.floor(Math.random() * creators.length)];
      setSeeded((prev) => {
        const current = prev[creator.slug];
        const watchers = Math.min(
          12,
          Math.max(1, current.watchers + (Math.random() < 0.55 ? 1 : -1)),
        );
        return { ...prev, [creator.slug]: { ...current, watchers } };
      });
    }, 3500);
    return () => window.clearInterval(id);
  }, [creators]);

  const sorted = useMemo(() => {
    const bid = (c: Creator) =>
      liveAll?.[c.slug]?.currentBidSol ?? seeded[c.slug]?.currentBidSol ?? -1;
    const ends = (c: Creator) =>
      liveAll?.[c.slug]?.auctionEndsAt ??
      seeded[c.slug]?.auctionEndsAt ??
      c.nextVideoAt;
    const list = creators.slice();
    const liveRank = (c: Creator) => (c.status === "live" ? 0 : 1);
    if (sort === "hot") {
      list.sort((a, b) => liveRank(a) - liveRank(b) || b.trendPct - a.trendPct);
    } else if (sort === "ending") {
      list.sort((a, b) => ends(a) - ends(b));
    } else {
      list.sort((a, b) => bid(b) - bid(a) || b.followers - a.followers);
    }
    return list;
  }, [creators, liveAll, seeded, sort]);

  function changeSort(next: SortKey) {
    if (next === sort) return;
    if (!reducedMotion && gridRef.current) {
      const rects = new Map<string, DOMRect>();
      for (const el of gridRef.current.children) {
        rects.set(
          (el as HTMLElement).dataset.slug!,
          el.getBoundingClientRect(),
        );
      }
      flipFrom.current = rects;
    }
    setSort(next);
  }

  // FLIP: tiles glide to their new slot instead of jumping.
  useLayoutEffect(() => {
    const from = flipFrom.current;
    flipFrom.current = null;
    if (!from || !gridRef.current) return;
    for (const el of gridRef.current.children) {
      const before = from.get((el as HTMLElement).dataset.slug!);
      if (!before) continue;
      const after = el.getBoundingClientRect();
      const dx = before.left - after.left;
      const dy = before.top - after.top;
      if (!dx && !dy) continue;
      el.animate(
        [{ transform: `translate(${dx}px,${dy}px)` }, { transform: "none" }],
        {
          duration: 480,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        },
      );
    }
  }, [sorted]);

  return (
    <div className="min-h-screen bg-canvas text-fg">
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" className="flex shrink-0 items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.png"
                alt=""
                width={24}
                height={24}
                className="size-6"
              />
              <span className="text-[16px] font-semibold tracking-[-0.02em]">
                Pitchlink
              </span>
            </Link>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden sm:block">
              <ChainStatus compact />
            </span>
            <WalletSlot />
          </div>
        </div>
        <BidTicker />
      </header>

      <main className="mx-auto max-w-[1500px] px-4 pb-12 sm:px-6">
        <section className="grid gap-5 pb-6 pt-6 sm:pt-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,540px)] lg:items-end lg:gap-12 lg:pb-7">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-3">
              The on-chain market for creator attention
            </p>
            <h1 className="mt-2.5 max-w-[24ch] text-[30px] font-semibold leading-[1.06] tracking-[-0.035em] text-balance sm:text-[40px]">
              Creator ad slots, priced by{" "}
              <span className="text-live">on-chain conversion.</span>
            </h1>
            <p className="mt-3 max-w-[74ch] text-[14px] leading-relaxed text-pretty text-fg-2 sm:text-[15px]">
              Brands bid SOL for a slot in a small creator&rsquo;s next video.
              The winner gets a tracked link, and every click through it is
              recorded on Solana, so creators are priced on results, not
              follower count.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <ChainStatus />
              <ProofLink label="Program" address={PROGRAM_ID} />
              {heroChain ? (
                <ProofLink label="Live auction" address={heroChain.address} />
              ) : null}
            </div>
          </div>
          <HowItWorks />
        </section>

        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <div className="flex min-w-0 items-baseline gap-2.5">
            <h2 className="text-[15px] font-semibold tracking-[-0.01em]">
              Next videos up for auction
            </h2>
            <span className="text-[12px] tabular-nums text-fg-3">
              {creators.length} creators ·{" "}
              {creators.filter((c) => c.status === "live").length} live
            </span>
          </div>
          <div
            className="flex rounded-full border border-line bg-raised p-0.5"
            role="group"
            aria-label="Sort creators"
          >
            {SORTS.map((option) => (
              <button
                key={option.key}
                type="button"
                aria-pressed={sort === option.key}
                onClick={() => changeSort(option.key)}
                className={`rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                  sort === option.key
                    ? "bg-panel-2 text-fg shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]"
                    : "text-fg-3 hover:text-fg"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div
          ref={gridRef}
          className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
        >
          {sorted.map((creator) => {
            const real = latestReal[creator.slug];
            const merged: Partial<TileLive> | undefined =
              real || liveAll?.[creator.slug]
                ? {
                    ...(real
                      ? {
                          currentBidSol: real.amountSol,
                          bidSignature: real.signature,
                          lastBid: { id: 0, amountSol: real.amountSol },
                        }
                      : null),
                    ...liveAll?.[creator.slug],
                  }
                : undefined;
            return (
              <BoardTile
                key={creator.slug}
                creator={creator}
                base={seeded[creator.slug]}
                override={merged}
                reducedMotion={reducedMotion}
              />
            );
          })}
        </div>

        <p className="mt-10 max-w-[80ch] text-[11.5px] leading-relaxed text-fg-3">
          Live on devnet: the program, the {hero?.name ?? "hero"} auction, its
          bids and settlement. Every chip marked on-chain opens the transaction
          on Solana Explorer. Demo data: follower counts are seeded; view
          momentum, watcher counts and ticker entries marked SIM are simulated.
          Conversion fills in from the on-chain click counter.
        </p>
      </main>
    </div>
  );
}

const STEPS = [
  {
    title: "Bid SOL",
    body: "Escrowed on-chain. Outbid? Refunded in the same tx.",
  },
  {
    title: "Win the slot",
    body: "Top bid pays the creator. Your logo goes in the video.",
  },
  {
    title: "Count every click",
    body: "Your tracked link logs clicks on Solana.",
  },
];

function HowItWorks() {
  return (
    <ol className="grid grid-cols-3 gap-1.5 sm:gap-2" aria-label="How it works">
      {STEPS.map((step, i) => (
        <li
          key={step.title}
          className="relative min-w-0 rounded-[14px] border border-line bg-raised px-2.5 py-2.5 sm:px-3.5 sm:py-3"
        >
          <span
            className={`font-mono text-[10px] font-medium ${i === 2 ? "text-live-ink" : "text-fg-3"}`}
          >
            0{i + 1}
          </span>
          <p className="mt-1 text-[12.5px] font-semibold leading-tight tracking-[-0.01em] sm:text-[14px]">
            {step.title}
          </p>
          <p className="mt-1 hidden text-[12px] leading-snug text-fg-3 sm:block">
            {step.body}
          </p>
          {i < STEPS.length - 1 ? (
            <span
              aria-hidden
              className="absolute -right-[7px] top-1/2 z-[1] hidden size-3 -translate-y-1/2 rotate-45 border-r border-t border-line-strong bg-canvas sm:block"
            />
          ) : null}
        </li>
      ))}
    </ol>
  );
}
