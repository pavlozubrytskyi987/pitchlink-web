import Link from "next/link";
import { notFound } from "next/navigation";
import { Countdown } from "@/components/countdown";
import { ChainIcon } from "@/components/icons";
import { SiteHeader } from "@/components/site-header";
import { CREATORS } from "@/data/creators";

export function generateStaticParams() {
  return CREATORS.map((creator) => ({ slug: creator.slug }));
}

const LABEL = "text-[10px] font-medium uppercase tracking-[0.14em] text-fg-3";

// Creator profile. The live creator links into the real auction at /auction.
export default async function CreatorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const creator = CREATORS.find((c) => c.slug === slug);
  if (!creator) notFound();

  const hasAuction = creator.auctionCreatorPubkey !== null;

  return (
    <div className="min-h-screen bg-canvas text-fg">
      <SiteHeader crumb={creator.name} detail={creator.niche} />
      <main className="mx-auto flex max-w-[880px] flex-col gap-4 px-4 py-6 sm:px-6 sm:py-8">
        <Link href="/" className="w-fit text-[13px] text-fg-3 transition-colors hover:text-fg">
          ← All creators
        </Link>

        <section className="grid gap-4 rounded-[20px] border border-line bg-raised p-3 sm:grid-cols-[240px_minmax(0,1fr)] sm:gap-6 sm:p-4">
          <div className="relative aspect-[4/3] overflow-hidden rounded-[14px] bg-panel sm:aspect-[4/5]">
            <video
              src={creator.clipUrl}
              poster={creator.posterUrl}
              muted
              playsInline
              autoPlay
              loop
              preload="metadata"
              aria-hidden
              className="absolute inset-0 size-full object-cover object-[50%_22%]"
            />
            <span
              className={`absolute left-2 top-2 flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-bold tracking-[0.12em] ${
                hasAuction
                  ? "bg-live text-canvas"
                  : "bg-black/55 text-white/85 ring-1 ring-white/10 backdrop-blur-md"
              }`}
            >
              {hasAuction ? <span className="live-dot size-1.5 rounded-full bg-canvas" /> : null}
              {hasAuction ? "LIVE AUCTION" : "SOON"}
            </span>
          </div>

          <div className="flex min-w-0 flex-col gap-4 sm:py-1">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={creator.avatarUrl} alt="" className="size-11 rounded-full ring-1 ring-white/10" />
              <div className="min-w-0">
                <h1 className="truncate text-[22px] font-semibold leading-tight tracking-[-0.02em]">
                  {creator.name}
                </h1>
                <p className="truncate text-[13px] text-fg-3">
                  {creator.handle} · {creator.niche} ·{" "}
                  {creator.followers.toLocaleString("en-US")} followers
                </p>
              </div>
            </div>

            <div>
              <div className="rounded-t-[14px] border border-b-0 border-live/20 bg-gradient-to-b from-live/[0.08] to-live/[0.02] px-3.5 pb-3 pt-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold tracking-[0.14em] text-live-ink">
                    CONVERSION
                  </p>
                  {creator.conversionPct === null ? (
                    <p className="rounded-full border border-line-strong px-1.5 py-[2px] text-[8.5px] uppercase tracking-[0.14em] text-fg-3">
                      no data yet
                    </p>
                  ) : null}
                </div>
                <p
                  className={`mt-1.5 text-[40px] font-semibold leading-none tracking-[-0.03em] tabular-nums ${
                    creator.conversionPct === null ? "text-fg/30" : "text-fg"
                  }`}
                >
                  {creator.conversionPct !== null ? `${creator.conversionPct.toFixed(1)}%` : "—"}
                </p>
              </div>
              <p className="flex items-center gap-1.5 rounded-b-[14px] border border-t-0 border-live/20 bg-live/[0.03] px-3.5 pb-2 pt-1 text-[11.5px] text-fg-3">
                <ChainIcon className="size-3.5 shrink-0 text-live/70" />
                Clicks through the winner&rsquo;s tracked link, counted on Solana. Not
                follower count.
              </p>
            </div>

            <div className="mt-auto flex flex-wrap items-end justify-between gap-3 border-t border-line pt-4">
              {hasAuction ? (
                <>
                  <div>
                    <p className={LABEL}>Ad slot</p>
                    <p className="mt-1 text-[14px] text-fg-2">Next video, live auction on devnet</p>
                  </div>
                  <Link
                    href="/auction"
                    className="inline-flex h-10 items-center rounded-full bg-live px-5 text-[13.5px] font-semibold text-canvas transition-colors hover:bg-live-ink"
                  >
                    Open live auction
                  </Link>
                </>
              ) : (
                <>
                  <div>
                    <p className={LABEL}>Auction</p>
                    <p className="mt-1 text-[14px] text-fg-2">Opens with the next video</p>
                  </div>
                  <div className="text-right">
                    <p className={LABEL}>Next video</p>
                    <p className="mt-1 font-mono text-[14px] tabular-nums text-fg">
                      <Countdown to={creator.nextVideoAt} ended="Dropping" />
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
