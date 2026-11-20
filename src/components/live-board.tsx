"use client";

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
import { ProofList } from "@/components/chain-status";
import { SiteHeader } from "@/components/site-header";
import { subscribeFeed, type BidEntry } from "@/lib/bid-feed";
import { PROGRAM_ID } from "@/lib/config";
import { useAllClicks } from "@/lib/use-all-clicks";
import { useHeroAuction } from "@/lib/use-hero-auction";
import { observeInView, observeNear } from "@/lib/visibility";

type SortKey = "hot" | "bid";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "hot", label: "Hot" },
  { key: "bid", label: "Top bid" },
];

type Props = {
  creators?: Creator[];
  /** Real on-chain values per creator slug. Overrides defaults. */
  live?: Record<string, Partial<TileLive>>;
};

const EMPTY_LIVE: TileLive = {
  currentBidSol: null,
  auctionEndsAt: null,
  lastBid: null,
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

const BoardTile = memo(function BoardTile({
  creator,
  override,
  reducedMotion,
}: {
  creator: Creator;
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
    () => (override ? { ...EMPTY_LIVE, ...override } : EMPTY_LIVE),
    [override],
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
          className="block rounded-[12px] outline-offset-4"
        >
          {tile}
        </Link>
      )}
    </div>
  );
});

export function LiveBoard({ creators = CREATORS, live }: Props) {
  const [sort, setSort] = useState<SortKey>("hot");
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
  const clicksByCreator = useAllClicks();
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

  const sorted = useMemo(() => {
    const bid = (c: Creator) => liveAll?.[c.slug]?.currentBidSol ?? -1;
    const list = creators.slice();
    const liveRank = (c: Creator) => (c.status === "live" ? 0 : 1);
    if (sort === "hot") {
      list.sort((a, b) => liveRank(a) - liveRank(b));
    } else {
      list.sort((a, b) => bid(b) - bid(a) || liveRank(a) - liveRank(b));
    }
    return list;
  }, [creators, liveAll, sort]);

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

  const liveCount = creators.filter((c) => c.status === "live").length;

  return (
    <div className="min-h-screen bg-paper text-ink">
      <SiteHeader>
        <BidTicker />
      </SiteHeader>

      <main className="mx-auto max-w-[1320px] px-5 pb-20 sm:px-8">
        <section className="grid gap-10 pb-12 pt-12 sm:pt-16 md:grid-cols-[minmax(0,1fr)_300px] md:items-end md:gap-12 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-20 lg:pb-14">
          <div className="min-w-0">
            <h1 className="max-w-[18ch] text-[40px] font-semibold leading-[1.02] tracking-[-0.03em] text-balance sm:text-[58px]">
              Your audience is worth more than your follower count.
            </h1>
            <p className="mt-6 max-w-[58ch] text-[16px] leading-[1.6] text-graphite sm:text-[17px]">
              Small crypto creators can auction sponsorship slots in their
              videos. Brands bid SOL, the auction runs through
              program-controlled escrow, and the results are publicly
              inspectable on Solana.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <a
                href="#up-for-auction"
                className="inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-[14px] font-medium text-paper shadow-[0_10px_28px_-14px_rgb(0_0_0/0.45)] transition-colors hover:bg-[#262626]"
              >
                Explore sponsorships
                <span aria-hidden>→</span>
              </a>
              <Link
                href="/auction"
                className="inline-flex h-12 items-center gap-2 rounded-full border border-hairline-strong px-5 text-[14px] text-ink transition-colors hover:border-ink"
              >
                Create an ad slot
                <span aria-hidden>→</span>
              </Link>
            </div>
            <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.25em] text-ash">
              Built on Solana · Devnet
            </p>
          </div>
          <ProofList programId={PROGRAM_ID} auctionAddress={heroChain?.address ?? null} />
        </section>

        <HowItWorks />
        <ScopeSection />

        <div
          id="up-for-auction"
          className="mt-16 flex scroll-mt-24 flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-hairline pb-4 sm:mt-20"
        >
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-baseline gap-3">
              <h2 className="text-[24px] font-semibold leading-none tracking-[-0.025em] sm:text-[28px]">
                Up for auction
              </h2>
              <span className="text-[13.5px] text-ash">
                {creators.length} {creators.length === 1 ? "creator" : "creators"},{" "}
                {liveCount} live now
              </span>
            </div>
            <p className="text-[13px] text-ash">
              Click a tile to open the live auction and place a bid.
            </p>
          </div>
          <div className="flex items-center gap-5" role="group" aria-label="Sort creators">
            {SORTS.map((option) => (
              <button
                key={option.key}
                type="button"
                aria-pressed={sort === option.key}
                onClick={() => changeSort(option.key)}
                className={`relative py-1 text-[14px] transition-colors after:absolute after:inset-x-0 after:-bottom-[17px] after:h-px ${
                  sort === option.key
                    ? "text-ink after:bg-ink"
                    : "text-ash after:bg-transparent hover:text-ink"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div
          ref={gridRef}
          className={
            sorted.length === 1
              ? "mt-8 mx-auto grid max-w-[460px] gap-y-12 sm:max-w-[520px]"
              : "mt-8 grid grid-cols-2 gap-x-4 gap-y-12 sm:gap-x-6 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-8 lg:gap-y-14"
          }
        >
          {sorted.map((creator) => {
            const real = latestReal[creator.slug];
            const pubkey = creator.creatorPubkey ?? creator.auctionCreatorPubkey;
            const onchainClicks =
              pubkey && pubkey in clicksByCreator ? clicksByCreator[pubkey] : null;
            const needsMerge =
              real || liveAll?.[creator.slug] || onchainClicks !== null;
            const merged: Partial<TileLive> | undefined = needsMerge
              ? {
                  ...(real
                    ? {
                        currentBidSol: real.amountSol,
                        bidSignature: real.signature,
                        lastBid: { id: 0, amountSol: real.amountSol },
                      }
                    : null),
                  ...liveAll?.[creator.slug],
                  ...(onchainClicks !== null ? { onchainClicks } : null),
                }
              : undefined;
            return (
              <BoardTile
                key={creator.slug}
                creator={creator}
                override={merged}
                reducedMotion={reducedMotion}
              />
            );
          })}
        </div>

        <p className="mt-20 max-w-[72ch] border-t border-hairline pt-5 text-[12.5px] leading-relaxed text-ash">
          Every number in this app is on-chain and checkable on Solana devnet:
          bid amounts, settle amounts, redirect-event counts. Anything else is
          left out. Markers open the transaction on Solana Explorer.
        </p>
      </main>
    </div>
  );
}

const STEPS = [
  {
    title: "Bid SOL",
    body: "Bids sit in on-chain escrow. If you're outbid, you're refunded in the same transaction.",
  },
  {
    title: "Win the slot",
    body: "The top bid pays the creator when the auction closes, and your logo goes in the video.",
  },
  {
    title: "Track redirect activity",
    body: "Every tracked-link visit submits a Solana transaction that updates a public counter.",
  },
];

const SCOPE_LIVE = [
  "Creator auctions",
  "SOL bidding",
  "Program-controlled escrow",
  "Atomic outbid refunds",
  "Settlement",
  "Tracked-link counter updates",
];

const SCOPE_PLANNED = [
  "Advertiser conversion integrations",
  "Qualifying on-chain action verification",
  "Creator performance history",
  "Better attribution and anti-abuse controls",
];

function ScopeSection() {
  return (
    <section
      aria-label="What is live versus planned"
      className="mt-16 grid gap-10 sm:mt-20 sm:grid-cols-2 sm:gap-12"
    >
      <div>
        <h3 className="text-[15px] font-semibold tracking-[-0.01em]">
          Live on devnet
        </h3>
        <ul className="mt-4 divide-y divide-hairline border-y border-hairline">
          {SCOPE_LIVE.map((item) => (
            <li
              key={item}
              className="flex items-center gap-2.5 py-2.5 text-[14px] text-graphite"
            >
              <span className="size-[5px] shrink-0 rounded-full bg-accent" aria-hidden />
              {item}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-ash">
          Planned
        </h3>
        <ul className="mt-4 divide-y divide-hairline border-y border-hairline">
          {SCOPE_PLANNED.map((item) => (
            <li
              key={item}
              className="flex items-center gap-2.5 py-2.5 text-[14px] text-ash"
            >
              <span
                className="size-[5px] shrink-0 rounded-full border border-hairline-strong"
                aria-hidden
              />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <ol
      id="how-it-works"
      className="scroll-mt-24 grid gap-px border-y border-hairline sm:grid-cols-3"
      aria-label="How it works"
    >
      {STEPS.map((step, i) => (
        <li
          key={step.title}
          className="flex gap-4 py-5 sm:block sm:py-6 sm:pr-10 [&+li]:border-t [&+li]:border-hairline sm:[&+li]:border-l sm:[&+li]:border-t-0 sm:[&+li]:pl-8"
        >
          <span className="text-[14px] font-medium leading-none text-ash tabular-nums sm:text-[15px]">
            {i + 1}
          </span>
          <div className="sm:mt-4">
            <p className="text-[15px] font-medium">{step.title}</p>
            <p className="mt-1.5 max-w-[36ch] text-[14px] leading-[1.55] text-graphite">
              {step.body}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
