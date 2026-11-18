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

  const liveCount = creators.filter((c) => c.status === "live").length;

  return (
    <div className="min-h-screen bg-paper text-ink">
      <SiteHeader>
        <BidTicker />
      </SiteHeader>

      <main className="mx-auto max-w-[1320px] px-5 pb-20 sm:px-8">
        <section className="grid gap-10 pb-12 pt-12 sm:pt-16 md:grid-cols-[minmax(0,1fr)_300px] md:items-end md:gap-12 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-20 lg:pb-14">
          <div className="min-w-0">
            <h1 className="max-w-[20ch] font-serif text-[42px] font-normal leading-[1.02] tracking-[-0.025em] text-balance sm:text-[64px]">
              Creator ad slots, priced by real conversion.
            </h1>
            <p className="mt-6 max-w-[58ch] text-[16px] leading-[1.6] text-graphite sm:text-[17px]">
              Brands bid SOL for a slot in a small creator&rsquo;s next video.
              The winner gets a tracked link, and every click through it is
              recorded on Solana, so creators earn on results instead of
              follower count.
            </p>
          </div>
          <ProofList programId={PROGRAM_ID} auctionAddress={heroChain?.address ?? null} />
        </section>

        <HowItWorks />

        <div className="mt-16 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-hairline pb-4 sm:mt-20">
          <div className="flex min-w-0 items-baseline gap-3">
            <h2 className="font-serif text-[30px] font-normal leading-none tracking-[-0.02em] sm:text-[34px]">
              Up for auction
            </h2>
            <span className="text-[13.5px] text-ash">
              {creators.length} creators, {liveCount} live now
            </span>
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
          className="mt-8 grid grid-cols-2 gap-x-4 gap-y-12 sm:gap-x-6 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-8 lg:gap-y-14"
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

        <p className="mt-20 max-w-[72ch] border-t border-hairline pt-5 text-[12.5px] leading-relaxed text-ash">
          On devnet and checkable: the program, the {hero?.name ?? "live"}{" "}
          auction, its bids and its settlement. Anything marked verified opens
          the transaction on Solana Explorer. For the demo, follower counts are
          seeded, and view trends, watcher counts and ticker entries marked
          simulated are generated. Conversion fills in from the on-chain click
          counter.
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
    title: "Count every click",
    body: "You get a tracked link. Each click through it is recorded on Solana.",
  },
];

function HowItWorks() {
  return (
    <ol className="grid gap-px border-y border-hairline sm:grid-cols-3" aria-label="How it works">
      {STEPS.map((step, i) => (
        <li
          key={step.title}
          className="flex gap-4 py-5 sm:block sm:py-6 sm:pr-10 [&+li]:border-t [&+li]:border-hairline sm:[&+li]:border-l sm:[&+li]:border-t-0 sm:[&+li]:pl-8"
        >
          <span className="font-serif text-[22px] leading-none text-ash sm:text-[26px]">
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
