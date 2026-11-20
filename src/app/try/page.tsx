import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { TryDemo } from "@/components/try-demo";
import { listCampaigns } from "@/lib/campaigns";
import { clickCounterPda, getClickCounter } from "@/lib/program";
import { serverConnection } from "@/lib/relayer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public judge demo: the most recent legitimately-claimed campaign. No
// wallet required. If no winner has completed the signed campaign setup,
// this page says so instead of fabricating a demo.
export default async function TryPage() {
  const campaigns = await listCampaigns();
  const campaign = campaigns[0] ?? null;

  let initialClicks = 0;
  let counterPda: string | null = null;
  if (campaign) {
    counterPda = clickCounterPda(campaign.linkId).toBase58();
    const counter = await getClickCounter(serverConnection(), campaign.linkId).catch(() => null);
    initialClicks = counter ? Number(counter.count) : 0;
  }

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <SiteHeader crumb="Try live tracking" />
      <main className="mx-auto w-full max-w-[860px] px-5 pb-20 pt-10 sm:px-8 sm:pt-14">
        {campaign && counterPda ? (
          <TryDemo
            campaign={{
              linkId: campaign.linkId,
              brandName: campaign.brandName,
              destination: campaign.destination,
              logoUrl: campaign.logoUrl,
              wallet: campaign.wallet,
            }}
            counterPda={counterPda}
            initialClicks={initialClicks}
          />
        ) : (
          <div>
            <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.025em]">
              No campaign has been claimed yet
            </h1>
            <p className="mt-3 max-w-[56ch] text-[15px] leading-snug text-graphite">
              This page demonstrates a real, winner-claimed tracked campaign.
              The dependency is honest: an auction winner must connect their
              wallet and complete the signed campaign setup first. We
              don&rsquo;t fabricate a demo campaign.
            </p>
            <Link
              href="/auction"
              className="mt-6 inline-flex h-12 items-center rounded-full bg-ink px-6 text-[14px] font-medium text-paper transition-colors hover:bg-[#262626]"
            >
              Open the auction
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
