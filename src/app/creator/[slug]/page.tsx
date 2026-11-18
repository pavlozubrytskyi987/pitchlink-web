import Link from "next/link";
import { notFound } from "next/navigation";
import { Countdown } from "@/components/countdown";
import { SiteHeader } from "@/components/site-header";
import { CREATORS } from "@/data/creators";

export function generateStaticParams() {
  return CREATORS.map((creator) => ({ slug: creator.slug }));
}

// Creator profile. The live creator links into the real auction at /auction.
export default async function CreatorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const creator = CREATORS.find((c) => c.slug === slug);
  if (!creator) notFound();

  const hasAuction = creator.auctionCreatorPubkey !== null;
  const realMedia = !creator.posterUrl.startsWith("data:");

  return (
    <div className="min-h-screen bg-paper text-ink">
      <SiteHeader crumb={creator.name} />
      <main className="mx-auto max-w-[1080px] px-5 pb-20 pt-8 sm:px-8 sm:pt-12">
        <Link href="/" className="text-[14px] text-graphite transition-colors hover:text-ink">
          All creators
        </Link>

        <section className="mt-6 grid gap-8 md:grid-cols-[minmax(0,420px)_minmax(0,1fr)] md:gap-14">
          <div className="relative aspect-[4/3] overflow-hidden rounded-[12px] bg-wash md:aspect-[4/5]">
            {realMedia ? (
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
            ) : (
              <p className="absolute bottom-6 left-6 font-serif text-[44px] italic leading-none tracking-[-0.01em]">
                {creator.niche}
              </p>
            )}
            {hasAuction ? (
              <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-paper px-2.5 py-1 text-[12px] font-medium text-accent shadow-[0_1px_3px_rgb(0_0_0/0.08)]">
                <span className="live-dot size-[5px] rounded-full bg-accent" />
                Live auction
              </span>
            ) : null}
          </div>

          <div className="flex min-w-0 flex-col">
            <h1 className="font-serif text-[44px] leading-[1.02] tracking-[-0.025em] sm:text-[56px]">
              {creator.name}
            </h1>
            <p className="mt-2 text-[15px] text-graphite">
              {creator.niche}, {creator.handle}. {creator.followers.toLocaleString("en-US")} followers.
            </p>

            <div className="mt-10 border-t border-ink pt-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[13px] font-medium">Conversion</p>
                {creator.conversionPct === null ? (
                  <p className="text-[12px] text-ash">no data yet</p>
                ) : null}
              </div>
              <p
                className={`mt-1 font-serif text-[56px] leading-none tracking-[-0.02em] ${
                  creator.conversionPct === null ? "text-[#c9c9c6]" : "text-ink"
                }`}
              >
                {creator.conversionPct !== null ? `${creator.conversionPct.toFixed(1)}%` : "—"}
              </p>
              <p className="mt-2 max-w-[48ch] text-[14px] leading-snug text-graphite">
                Clicks through the winning brand&rsquo;s tracked link, counted on
                Solana. This is what the slot is priced on, not follower count.
              </p>
            </div>

            <div className="mt-10 border-t border-hairline pt-4">
              {hasAuction ? (
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-[13px] text-graphite">Ad slot</p>
                    <p className="mt-1 text-[16px]">Next video, auction live on devnet</p>
                  </div>
                  <Link
                    href="/auction"
                    className="inline-flex h-12 items-center rounded-full bg-ink px-6 text-[14px] font-medium text-paper transition-colors hover:bg-[#262626]"
                  >
                    Open the auction
                  </Link>
                </div>
              ) : (
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="text-[13px] text-graphite">Auction</p>
                    <p className="mt-1 text-[16px]">Opens with the next video</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[13px] text-graphite">Next video in</p>
                    <p className="mt-1 text-[16px] tabular-nums">
                      <Countdown to={creator.nextVideoAt} ended="Dropping" />
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
