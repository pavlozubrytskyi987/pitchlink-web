import { AuctionPanel } from "@/components/auction-panel";
import { ProductViewer } from "@/components/product-viewer";
import { SiteHeader } from "@/components/site-header";

export default function AuctionPage() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-fg">
      <SiteHeader />
      <div className="mx-auto grid w-full max-w-[1500px] min-h-0 flex-1 gap-3 px-4 pb-4 pt-3 sm:gap-4 sm:px-6 sm:pb-6 lg:h-[calc(100vh-3.6rem)] lg:grid-cols-[minmax(0,1fr)_340px]">
        <ProductViewer />
        <AuctionPanel />
      </div>
    </div>
  );
}
