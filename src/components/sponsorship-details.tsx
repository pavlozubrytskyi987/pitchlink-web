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
      {/* Preview: the creator's real poster (gradient tile when no shoot
          footage exists). No stock imagery, no invented thumbnails. */}
      <div className="relative aspect-[16/9] overflow-hidden rounded-[14px] border border-hairline bg-wash">
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

      <h1 className="mt-6 text-[28px] font-semibold leading-[1.1] tracking-[-0.025em] text-balance sm:text-[36px]">
        Sponsor {creator.name}&rsquo;s next video
      </h1>

      <div className="mt-5 flex items-center gap-3.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={creator.avatarUrl}
          alt=""
          className="size-11 shrink-0 rounded-full border border-hairline object-cover"
        />
        <div className="min-w-0">
          <p className="truncate text-[15px] font-medium">{creator.name}</p>
          <p className="truncate text-[13px] text-graphite">{creator.handle}</p>
        </div>
      </div>

      <dl className="mt-6 divide-y divide-hairline border-y border-hairline text-[14px]">
        <Row label="Category">
          <span className="text-right">{creator.niche}</span>
        </Row>
        <Row label="Placement">
          <span>Sponsor slot in one upcoming video</span>
        </Row>
        <Row label="Fulfillment">
          <span className="text-right">Delivered by the creator, off-chain</span>
        </Row>
      </dl>

      <div className="mt-8">
        <p className={LABEL}>What the winning advertiser receives</p>
        <ul className="mt-3 space-y-2.5 text-[14.5px] leading-[1.55] text-graphite">
          <Deliverable>
            Sponsor placement in {creator.name}&rsquo;s next video.
          </Deliverable>
          <Deliverable>
            A tracked advertiser link; every visit submits a Solana
            transaction that updates a public redirect counter.
          </Deliverable>
          <Deliverable>
            Public auction records — bid, escrow, refund and settlement
            transactions, inspectable on Solana Explorer.
          </Deliverable>
        </ul>
      </div>

      <div className="mt-8 rounded-[12px] border border-hairline bg-wash p-4">
        <p className={LABEL}>Terms</p>
        <p className="mt-2 text-[13.5px] leading-[1.6] text-graphite">
          The winning bid is held in program-controlled escrow and paid to the
          creator by the Solana program at settlement. The video placement
          itself is delivered by the creator off-chain — the program settles
          payment but does not enforce content delivery.
        </p>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-3">
      <dt className="shrink-0 text-graphite">{label}</dt>
      <dd className="min-w-0 font-medium text-ink">{children}</dd>
    </div>
  );
}

function Deliverable({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-[9px] size-[5px] shrink-0 rounded-full bg-accent" aria-hidden />
      <span>{children}</span>
    </li>
  );
}
