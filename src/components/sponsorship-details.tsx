import type { Creator } from "@/data/creators";

const LABEL = "text-[12.5px] uppercase tracking-[0.12em] text-ash";

/**
 * Left column of /auction: what is actually being sponsored. Only states
 * deliverables the platform really provides — the on-chain auction, the
 * tracked link, and the public record. Fulfillment of the video placement
 * itself is off-chain and said so plainly.
 */
export function SponsorshipDetails({ creator }: { creator: Creator }) {
  return (
    <div className="flex min-w-0 flex-col">
      {/* Compact visual header: the creator's directory gradient. No stock
          imagery, no invented thumbnails. */}
      <div className="relative h-28 overflow-hidden rounded-[14px] border border-hairline sm:h-32">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={creator.posterUrl}
          alt=""
          className="absolute inset-0 size-full object-cover"
        />
        <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-paper px-2.5 py-1 text-[12px] font-medium text-accent shadow-[0_1px_3px_rgb(0_0_0/0.08)]">
          Video sponsorship
        </span>
      </div>

      <h1 className="mt-5 text-[28px] font-semibold leading-[1.1] tracking-[-0.025em] text-balance sm:text-[32px]">
        Sponsor {creator.name}&rsquo;s next video
      </h1>

      <div className="mt-4 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={creator.avatarUrl}
          alt=""
          className="size-10 shrink-0 rounded-full border border-hairline object-cover"
        />
        <div className="min-w-0">
          <p className="truncate text-[14.5px] font-medium leading-tight">{creator.name}</p>
          <p className="truncate text-[12.5px] text-graphite">{creator.handle}</p>
        </div>
      </div>

      <p className="mt-4 text-[13.5px] leading-relaxed text-graphite">
        {creator.niche}
        <span className="mx-2 text-hairline-strong" aria-hidden>·</span>
        Placement: one upcoming video
        <span className="mx-2 text-hairline-strong" aria-hidden>·</span>
        Fulfilled by the creator, off-chain
      </p>

      <div className="mt-6">
        <p className={LABEL}>What the winning advertiser receives</p>
        <ul className="mt-3 space-y-2 text-[14px] leading-[1.5] text-graphite">
          <Benefit>
            <span className="font-medium text-ink">Video sponsorship</span>
            {" — "}a sponsor placement in {creator.name}&rsquo;s next video.
          </Benefit>
          <Benefit>
            <span className="font-medium text-ink">Tracked advertiser link</span>
            {" — "}redirects can produce publicly verifiable on-chain counter updates.
          </Benefit>
          <Benefit>
            <span className="font-medium text-ink">Public auction records</span>
            {" — "}every bid, refund, and payout inspectable on Solana Explorer.
          </Benefit>
        </ul>
      </div>

      <details className="group mt-6 rounded-[12px] border border-hairline bg-wash">
        <summary className="cursor-pointer list-none px-4 py-3 text-[13.5px] font-medium text-ink transition-colors hover:text-accent [&::-webkit-details-marker]:hidden">
          Sponsorship terms
          <span className="float-right text-ash transition-transform group-open:rotate-45">+</span>
        </summary>
        <div className="border-t border-hairline px-4 py-3.5 text-[13px] leading-[1.6] text-graphite">
          <p>
            The winning bid is held in program-controlled escrow and paid to
            the creator by the deployed Solana program at settlement.
          </p>
          <p className="mt-2">
            The video placement itself is fulfilled by the creator off-chain.
            The program settles payment according to its rules; it does not
            and cannot guarantee that the creator publishes the video.
          </p>
        </div>
      </details>
    </div>
  );
}

function Benefit({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-[8px] size-[5px] shrink-0 rounded-full bg-accent" aria-hidden />
      <span>{children}</span>
    </li>
  );
}
