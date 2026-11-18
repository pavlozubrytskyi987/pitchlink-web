import { AuctionPanel } from "@/components/auction-panel";
import { ProductViewer } from "@/components/product-viewer";
import { SiteHeader } from "@/components/site-header";
import { CREATORS } from "@/data/creators";

const HERO = CREATORS.find((c) => c.status === "live");

export default function AuctionPage() {
  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <SiteHeader crumb={`${HERO?.name ?? "Live"} auction`} />
      <div className="mx-auto grid w-full max-w-[1320px] min-h-0 flex-1 gap-4 px-5 pb-5 pt-5 sm:gap-5 sm:px-8 sm:pb-8 md:h-[calc(100vh-4rem)] md:grid-cols-[minmax(0,1fr)_320px] lg:grid-cols-[minmax(0,1fr)_360px]">
        <ProductViewer />
        <AuctionPanel />
      </div>
    </div>
  );
}
