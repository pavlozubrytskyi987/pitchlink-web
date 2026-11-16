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
import { CreatorTile, type TileLive } from "@/components/creator-tile";
import { CREATORS, type Creator } from "@/data/creators";
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
    out[c.slug] = {
      currentBidSol: null,
      auctionEndsAt: null,
      watchers: 2 + ((i * 3) % 7),
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

  const live = useMemo(() => (override ? { ...base, ...override } : base), [base, override]);

  return (
    <div ref={ref} data-slug={creator.slug}>
      <Link
        href={`/creator/${creator.slug}`}
        className="block rounded-[20px] outline-offset-2 focus-visible:outline-2 focus-visible:outline-[#1c1c1c]"
      >
        <CreatorTile
          creator={creator}
          live={live}
          mountVideo={near && !reducedMotion}
          active={inView}
          animate={!reducedMotion}
        />
      </Link>
    </div>
  );
});

function WalletSlot() {
  const { connected, disconnect } = useWallet();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  if (!ready) return <div className="h-[38px] w-[132px] rounded-full bg-[#161616]" aria-hidden />;
  return (
    <>
      <WalletMultiButton />
      {connected ? (
        <button
          type="button"
          onClick={() => void disconnect()}
          className="hidden h-[38px] rounded-full border border-[#e6e4df] bg-white px-3 text-sm sm:block"
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
  const reducedMotion = useReducedMotion();
  const gridRef = useRef<HTMLDivElement>(null);
  const flipFrom = useRef<Map<string, DOMRect> | null>(null);

  // Simulated watcher drift: one tile every few seconds, so one tile re-renders.
  useEffect(() => {
    const id = window.setInterval(() => {
      const creator = creators[Math.floor(Math.random() * creators.length)];
      setSeeded((prev) => {
        const current = prev[creator.slug];
        const watchers = Math.min(12, Math.max(1, current.watchers + (Math.random() < 0.55 ? 1 : -1)));
        return { ...prev, [creator.slug]: { ...current, watchers } };
      });
    }, 3500);
    return () => window.clearInterval(id);
  }, [creators]);

  const sorted = useMemo(() => {
    const bid = (c: Creator) => live?.[c.slug]?.currentBidSol ?? -1;
    const ends = (c: Creator) => live?.[c.slug]?.auctionEndsAt ?? c.nextVideoAt;
    const list = creators.slice();
    if (sort === "hot") list.sort((a, b) => b.trendPct - a.trendPct);
    else if (sort === "ending") list.sort((a, b) => ends(a) - ends(b));
    else list.sort((a, b) => bid(b) - bid(a) || b.totalImpressions - a.totalImpressions);
    return list;
  }, [creators, live, sort]);

  function changeSort(next: SortKey) {
    if (next === sort) return;
    if (!reducedMotion && gridRef.current) {
      const rects = new Map<string, DOMRect>();
      for (const el of gridRef.current.children) {
        rects.set((el as HTMLElement).dataset.slug!, el.getBoundingClientRect());
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
      el.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: "none" }], {
        duration: 480,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      });
    }
  }, [sorted]);

  return (
    <div className="min-h-screen bg-white text-[#1c1c1c]">
      <header className="sticky top-0 z-20 border-b border-[#f0efec] bg-white">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" className="flex shrink-0 items-center gap-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="" width={26} height={26} className="size-[26px]" />
              <span className="text-[16px] font-semibold tracking-tight">Pitchlink</span>
            </Link>
            <p className="flex items-center gap-1.5 truncate rounded-full bg-[#f5f4f2] px-2.5 py-1 text-xs text-[#5f5d58]">
              <span className="live-dot size-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
              <span className="truncate">
                <span className="font-semibold tabular-nums text-[#1c1c1c]">{creators.length}</span> creators live
              </span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <WalletSlot />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-4 pb-10 pt-4 sm:px-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Bid on a creator&rsquo;s next video</h1>
            <p className="mt-0.5 text-[13px] text-[#8d8d8d]">
              Bids settle on Solana devnet. Audience numbers are seeded, momentum is simulated.
            </p>
          </div>
          <div className="flex rounded-full border border-[#e9e7e2] bg-[#f5f4f2] p-1" role="group" aria-label="Sort creators">
            {SORTS.map((option) => (
              <button
                key={option.key}
                type="button"
                aria-pressed={sort === option.key}
                onClick={() => changeSort(option.key)}
                className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${
                  sort === option.key ? "bg-white text-[#1c1c1c] shadow-sm" : "text-[#8d8d8d] hover:text-[#1c1c1c]"
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
          {sorted.map((creator) => (
            <BoardTile
              key={creator.slug}
              creator={creator}
              base={seeded[creator.slug]}
              override={live?.[creator.slug]}
              reducedMotion={reducedMotion}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
