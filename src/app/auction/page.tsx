import { AuctionClaim } from "@/components/auction-claim";
import { AuctionPanel } from "@/components/auction-panel";
import { PastBids } from "@/components/past-bids";
import { SiteHeader } from "@/components/site-header";
import { SponsorshipDetails } from "@/components/sponsorship-details";
import { CREATORS } from "@/data/creators";

const HERO = CREATORS.find((c) => c.status === "live");

export default function AuctionPage() {
  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <SiteHeader crumb="Sponsorship auction" />
      <main className="relative mx-auto w-full max-w-[1200px] px-5 pb-16 pt-8 sm:px-8 sm:pt-12">
        {HERO ? <AuctionClaim /> : null}
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-12">
          {HERO ? (
            <SponsorshipDetails creator={HERO} />
          ) : (
            <p className="text-[15px] text-graphite">No sponsorship listed.</p>
          )}
          <AuctionPanel />
        </div>
      </main>
      <PastBids />
    </div>
  );
}
