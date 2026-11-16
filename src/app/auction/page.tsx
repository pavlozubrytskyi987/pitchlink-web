import { AuctionPanel } from "@/components/auction-panel";
import { ProductViewer } from "@/components/product-viewer";
import { SiteHeader } from "@/components/site-header";

export default function AuctionPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteHeader />
      <div className="grid min-h-0 flex-1 gap-4 px-4 pb-4 sm:px-6 sm:pb-6 lg:h-[calc(100vh-5.5rem)] lg:grid-cols-[minmax(0,1fr)_320px]">
        <ProductViewer />
        <AuctionPanel />
      </div>
    </div>
  );
}
