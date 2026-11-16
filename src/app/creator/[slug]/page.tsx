import Link from "next/link";
import { notFound } from "next/navigation";
import { CREATORS } from "@/data/creators";

export function generateStaticParams() {
  return CREATORS.map((creator) => ({ slug: creator.slug }));
}

// Placeholder route. The existing auction UI (now at /auction) gets wired in
// here, parametrized by creator.
export default async function CreatorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const creator = CREATORS.find((c) => c.slug === slug);
  if (!creator) notFound();

  const hasAuction = creator.auctionCreatorPubkey !== null;

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 px-5 py-6 text-[#1c1c1c]">
      <Link href="/" className="text-sm text-[#8d8d8d] hover:text-[#1c1c1c]">
        ← All creators
      </Link>
      <div className="rounded-[20px] border border-[#e9e7e2] bg-[#f5f4f2] p-5">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={creator.avatarUrl} alt="" className="size-12 rounded-full" />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight">{creator.name}</h1>
            <p className="truncate text-sm text-[#8d8d8d]">
              {creator.handle} · {creator.niche} · {creator.followers.toLocaleString("en-US")} followers
            </p>
          </div>
        </div>
        <div className="mt-5 border-t border-[#e6e4df] pt-4">
          {hasAuction ? (
            <Link
              href="/auction"
              className="inline-flex h-[38px] items-center rounded-full bg-[#161616] px-4 text-sm font-medium text-white hover:bg-[#2a2a2a]"
            >
              Open live auction
            </Link>
          ) : (
            <p className="text-sm text-[#5f5d58]">Auction opens soon.</p>
          )}
        </div>
      </div>
    </main>
  );
}
