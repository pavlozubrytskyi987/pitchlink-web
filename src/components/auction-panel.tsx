"use client";

import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useCallback, useEffect, useState } from "react";
import { CheckIcon, ExternalIcon } from "@/components/icons";
import { useClaim } from "@/components/claim-context";
import { pushRealBid } from "@/lib/bid-feed";
import { brandDisplayFor, useDynamicBrands } from "@/lib/use-brands";
import { CREATORS, HERO_CREATOR_PUBKEY, MIN_BID_SOL } from "@/data/creators";
import { auctionOverride } from "@/lib/demo-auction";
import { explorerAddress, explorerTx } from "@/lib/explorer";
import {
  fetchAuctionByAddress,
  findAuction,
  getBids,
  initializeAuction,
  placeBid,
  settleAuction,
  treasuryPda,
  watchAuctionAccount,
  type AuctionAccount,
  type BidRecord,
} from "@/lib/program";

const LAMPORTS = BigInt("1000000000");

/**
 * Right column of /auction. A financial instrument panel: bid, escrow,
 * settlement - every action backed by the on-chain program, every state
 * labeled so no impossible action is offered.
 */
export function AuctionPanel() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { setClaim } = useClaim();
  const dynamicBrands = useDynamicBrands();
  const [auction, setAuction] = useState<AuctionAccount | null>(null);
  const [bids, setBids] = useState<BidRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [minutes, setMinutes] = useState("30");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<"open" | "bid" | "settle" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [lastTx, setLastTx] = useState<{ label: string; signature: string } | null>(null);
  const [settleSig, setSettleSig] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const override = auctionOverride();
    const next = override
      ? await fetchAuctionByAddress(connection, new PublicKey(override))
      : await findAuction(connection);
    setAuction(next);
    setBids(next ? await getBids(connection, next.publicKey) : []);
    return next;
  }, [connection]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    refresh()
      .catch((error: unknown) => {
        if (alive) setNotice(errorText(error));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [refresh]);

  useEffect(() => {
    const tick = () => setNow(Math.floor(Date.now() / 1000));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  const auctionKey = auction?.publicKey.toBase58() ?? null;

  useEffect(() => {
    if (!auctionKey) return;
    return watchAuctionAccount(connection, new PublicKey(auctionKey), () => {
      void refresh().catch((error: unknown) => setNotice(errorText(error)));
    });
  }, [auctionKey, connection, refresh]);

  const hasBids = Boolean(auction && auction.highestBid > BigInt(0));
  const remaining = auction && now !== null ? auction.endTs - now : null;
  const timeUp = remaining !== null && remaining <= 0;
  const isCreator = Boolean(
    wallet && auction && wallet.publicKey.equals(auction.creator),
  );
  const winnerKey = hasBids ? auction!.highestBidder.toBase58() : null;

  // Panel state machine. Never offer an action the program would reject:
  //   open    - auction exists, time remains         -> bidding UI
  //   no bids + time up                              -> "Ended: No winning bidder"
  //   bids + time up, unsettled                      -> settle CTA (permissionless)
  //   settled                                        -> receipt
  const status: "open" | "ended-no-bids" | "awaiting-settle" | "settled" | null =
    !auction
      ? null
      : auction.settled
        ? "settled"
        : timeUp
          ? hasBids
            ? "awaiting-settle"
            : "ended-no-bids"
          : "open";
  const urgent = remaining !== null && remaining > 0 && remaining < 3600;

  // Hand the settled result to the claim reveal (tracked-link handoff).
  useEffect(() => {
    if (!auction || !auction.settled || !winnerKey) {
      setClaim(null);
      return;
    }
    setClaim({
      auction: auction.publicKey.toBase58(),
      creator: auction.creator.toBase58(),
      winner: winnerKey,
      amountSol: Number(formatSol(auction.highestBid)),
      settleSignature: settleSig,
    });
  }, [auction, setClaim, settleSig, winnerKey]);
  useEffect(() => () => setClaim(null), [setClaim]);

  async function openAuction() {
    if (!wallet) return;
    const duration = Number(minutes);
    if (!Number.isFinite(duration) || duration < 1) {
      setNotice("Enter how many minutes the auction stays open");
      return;
    }
    setBusy("open");
    setNotice(null);
    setLastTx(null);
    try {
      const endTs = Math.floor(Date.now() / 1000) + Math.floor(duration * 60);
      const signature = await initializeAuction(connection, wallet, endTs);
      setLastTx({ label: "Auction opened", signature });
      await refresh();
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setBusy(null);
    }
  }

  async function submitBid() {
    if (!wallet || !auction) return;
    setBusy("bid");
    setNotice(null);
    setLastTx(null);
    try {
      const parsed = Number(amount);
      if (!Number.isFinite(parsed) || parsed < MIN_BID_SOL) {
        setNotice(`Minimum bid is ${MIN_BID_SOL} SOL.`);
        setBusy(null);
        return;
      }
      const lamports = solToLamports(amount);
      if (lamports <= auction.highestBid) {
        setNotice(
          `Bid must exceed the current highest bid of ${formatSol(auction.highestBid)} SOL.`,
        );
        setBusy(null);
        return;
      }
      // Confirmed on-chain before we show success: placeBid resolves after
      // the program has escrowed the lamports.
      const signature = await placeBid(
        connection,
        wallet,
        auction.creator,
        lamports,
      );
      const creatorKey = auction.creator.toBase58();
      const matched =
        CREATORS.find((c) => c.auctionCreatorPubkey === creatorKey) ??
        (HERO_CREATOR_PUBKEY === creatorKey
          ? CREATORS.find((c) => c.status === "live")
          : null);
      if (matched) {
        pushRealBid({
          id: `onchain-${signature}`,
          bidder: shortKey(wallet.publicKey.toBase58()),
          amountSol: Number(formatSol(lamports)),
          creatorSlug: matched.slug,
          creatorName: matched.name,
          ts: Math.floor(Date.now() / 1000),
          signature,
        });
      }
      setAmount("");
      setLastTx({ label: "Bid confirmed", signature });
      await refresh();
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setBusy(null);
    }
  }

  async function submitSettle() {
    if (!wallet || !auction) return;
    setBusy("settle");
    setNotice(null);
    setLastTx(null);
    try {
      const signature = await settleAuction(
        connection,
        wallet,
        auction.creator,
      );
      setSettleSig(signature);
      setLastTx({ label: "Settled", signature });
      await refresh();
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setBusy(null);
    }
  }

  const treasury = auction ? treasuryPda(auction.publicKey) : null;
  const minNextBid =
    auction && hasBids
      ? auction.highestBid + BigInt(1)
      : BigInt(Math.round(MIN_BID_SOL * 1e9));

  return (
    <aside className="flex flex-col self-start rounded-[14px] border border-hairline bg-paper p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h2 className="text-[18px] font-semibold leading-none tracking-[-0.02em]">Auction</h2>
          {status ? <StatusPill status={status} /> : null}
        </div>
        {auction ? (
          <a
            href={explorerAddress(auction.publicKey.toBase58())}
            target="_blank"
            rel="noopener noreferrer"
            title="Auction account on Solana Explorer (devnet)"
            className="group inline-flex items-center gap-1.5 text-[12px] text-ash transition-colors hover:text-accent"
          >
            <span className="font-mono text-graphite underline decoration-hairline-strong underline-offset-4 group-hover:text-accent group-hover:decoration-accent">
              {shortKey(auction.publicKey.toBase58())}
            </span>
            <ExternalIcon className="size-3 group-hover:text-accent" />
          </a>
        ) : (
          <span className="text-[12px] text-ash">Devnet</span>
        )}
      </div>

      {loading ? (
        <div className="mt-5 space-y-2" aria-label="Loading the auction">
          <div className="h-[104px] animate-pulse rounded-[14px] bg-wash" />
          <div className="h-11 animate-pulse rounded-[12px] bg-wash" />
        </div>
      ) : auction ? (
        <>
          <div className="mt-6 border-t border-ink pt-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className={LABEL}>Highest bid</p>
              <p className={LABEL}>
                {status === "settled" ? "Status" : status === "open" ? "Ends in" : "Status"}
              </p>
            </div>
            <div className="mt-1.5 flex items-baseline justify-between gap-3">
              <p className="text-[36px] font-semibold leading-none tracking-[-0.03em]">
                {hasBids ? (
                  <>
                    {formatSol(auction.highestBid)}{" "}
                    <span className="font-sans text-[14px] tracking-normal text-graphite">SOL</span>
                  </>
                ) : (
                  <span className="text-ash">No bids yet</span>
                )}
              </p>
              <p
                className={`text-[16px] tabular-nums ${
                  status === "open"
                    ? urgent
                      ? "text-alert"
                      : "text-ink"
                    : "text-accent"
                }`}
              >
                {status === "open"
                  ? remaining === null
                    ? "…"
                    : formatRemaining(remaining)
                  : status === "settled"
                    ? "Settled"
                    : "Ended"}
              </p>
            </div>
            <details className="group mt-4 rounded-[12px] border border-hairline bg-wash">
              <summary className="cursor-pointer list-none px-3.5 py-2.5 text-[13px] font-medium text-ink transition-colors hover:text-accent [&::-webkit-details-marker]:hidden">
                On-chain details
                <span className="float-right text-ash transition-transform group-open:rotate-45">+</span>
              </summary>
              <dl className="divide-y divide-hairline border-t border-hairline px-3.5 text-[13px]">
                {winnerKey ? (
                  <Row label={auction.settled ? "Winner" : "Leading"}>
                    <AddressLink address={winnerKey} />
                  </Row>
                ) : null}
                <Row label="Pays out to">
                  <AddressLink address={auction.creator.toBase58()} />
                </Row>
                {treasury ? (
                  <Row label="Escrow">
                    <AddressLink address={treasury.toBase58()} />
                  </Row>
                ) : null}
              </dl>
            </details>
          </div>

          {status === "ended-no-bids" ? (
            <div className="mt-4 rounded-[12px] border border-hairline bg-wash p-4">
              <p className="text-[14px] font-medium text-ink">
                Ended: No winning bidder
              </p>
              <p className="mt-1 text-[12.5px] leading-snug text-ash">
                No bids were placed before the deadline, so there is nothing
                to settle.
              </p>
            </div>
          ) : null}

          {status === "awaiting-settle" ? (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => void submitSettle()}
                disabled={!wallet || busy !== null}
                className="h-12 w-full rounded-full bg-ink text-[14px] font-medium text-paper transition-colors hover:bg-[#262626] disabled:bg-hairline disabled:text-ash"
              >
                {busy === "settle" ? "Settling…" : "Settle auction"}
              </button>
              <p className="mt-2 text-[12px] leading-snug text-ash">
                Settlement is permissionless: the program pays{" "}
                {formatSol(auction.highestBid)} SOL from escrow to{" "}
                {shortKey(auction.creator.toBase58())}.
                {!wallet ? " Connect a wallet to settle." : ""}
              </p>
            </div>
          ) : null}

          {status === "settled" ? (
            <div className="mt-4 rounded-[12px] border border-hairline bg-wash p-4">
              <p className="flex items-center gap-2 text-[14px] font-medium text-ink">
                <CheckIcon className="size-3.5 text-accent" />
                Settlement receipt
              </p>
              <p className="mt-1.5 text-[12.5px] leading-snug text-graphite">
                {formatSol(auction.highestBid)} SOL paid from escrow to the
                creator. Recorded on the auction account.
              </p>
              <a
                href={explorerAddress(auction.publicKey.toBase58())}
                target="_blank"
                rel="noopener noreferrer"
                className="group mt-2 inline-flex items-center gap-1.5 text-[12.5px] text-accent"
              >
                View on Solana Explorer
                <ExternalIcon className="size-3" />
              </a>
            </div>
          ) : null}

          {status === "open" ? (
            <>
              <form
                className="mt-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitBid();
                }}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <label htmlFor="bid-amount" className={LABEL}>
                    Your bid
                  </label>
                  <p className="text-[12px] tabular-nums text-ash">
                    Min next bid {formatSol(minNextBid)} SOL
                  </p>
                </div>
                <div className="mt-1.5 flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <input
                      id="bid-amount"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      inputMode="decimal"
                      placeholder={formatSol(minNextBid)}
                      aria-label="Bid in SOL"
                      disabled={!wallet || isCreator}
                      className="h-12 w-full rounded-[10px] border border-hairline-strong bg-paper pl-3.5 pr-12 text-[16px] text-ink outline-none transition-colors placeholder:text-ash focus:border-ink disabled:bg-wash disabled:opacity-60"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-ash">
                      SOL
                    </span>
                  </div>
                  <button
                    type="submit"
                    disabled={!wallet || isCreator || busy !== null || amount.trim() === ""}
                    className="h-12 shrink-0 rounded-full bg-ink px-5 text-[14px] font-medium text-paper transition-colors hover:bg-[#262626] disabled:bg-hairline disabled:text-ash"
                  >
                    {busy === "bid" ? "Sending…" : "Place bid"}
                  </button>
                </div>
              </form>
              <div className="mt-2 space-y-1 text-[12px] leading-snug text-ash">
                {!wallet ? <p>Connect a wallet to bid.</p> : null}
                {isCreator ? (
                  <p>The creator can’t bid on their own auction.</p>
                ) : null}
                <p>
                  Bids sit in program-controlled escrow. Outbid? You&rsquo;re
                  refunded in the same transaction.
                </p>
              </div>
            </>
          ) : null}

          <div className="mt-5 max-h-[220px] overflow-y-auto">
            <div className="flex items-baseline justify-between">
              <p className={LABEL}>Bids, verified on Solana</p>
              {bids.length ? (
                <p className="text-[11px] tabular-nums text-ash">{bids.length}</p>
              ) : null}
            </div>
            {bids.length === 0 ? (
              <p className="mt-2 text-[13px] text-ash">No bids yet.</p>
            ) : (
              <ul className="mt-1.5 divide-y divide-hairline">
                {bids.map((bid, i) => {
                  const bidder = bid.bidder.toBase58();
                  const brand = brandDisplayFor(bidder, dynamicBrands);
                  return (
                    <li key={bid.signature}>
                      <a
                        href={explorerTx(bid.signature)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open this bid on Solana Explorer"
                        className="group -mx-2 flex items-center justify-between gap-3 rounded-[8px] px-2 py-2.5 transition-colors hover:bg-wash"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className={`size-[5px] shrink-0 rounded-full ${i === 0 ? "bg-accent" : "bg-hairline-strong"}`} />
                          {brand ? (
                            <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={brand.logo}
                                alt=""
                                className="size-4 shrink-0 rounded-[3px] bg-ink object-contain p-[2px]"
                              />
                              <span className="truncate text-[12.5px] font-medium text-ink">
                                {brand.name}
                              </span>
                              <span className="truncate font-mono text-[11.5px] text-ash">
                                {shortKey(bidder)}
                              </span>
                            </>
                          ) : (
                            <span className="truncate font-mono text-[12.5px] text-graphite">
                              {shortKey(bidder)}
                            </span>
                          )}
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="text-[13.5px]">
                            {formatSol(bid.amount)} SOL
                          </span>
                          <ExternalIcon className="size-3 text-ash group-hover:text-accent" />
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      ) : (
        <div className="mt-5">
          <p className="text-[14px] text-ink">No auction is open.</p>
          <p className="mt-1 text-[12px] leading-snug text-ash">
            Open one to list this sponsorship. The connected wallet becomes
            the creator and receives the settlement.
          </p>
          <label className={`mt-4 block ${LABEL}`}>
            Minutes
            <input
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
              inputMode="numeric"
              className="mt-1.5 h-11 w-full rounded-[12px] border border-hairline bg-wash px-3 font-mono text-[15px] normal-case tracking-normal text-ink outline-none focus:border-accent/50"
            />
          </label>
          <button
            type="button"
            onClick={() => void openAuction()}
            disabled={!wallet || busy !== null}
            className="mt-3 h-12 w-full rounded-full bg-ink text-[14px] font-medium text-paper transition-colors hover:bg-[#262626] disabled:bg-hairline disabled:text-ash"
          >
            {busy === "open" ? "Opening…" : "Open auction"}
          </button>
          {!wallet ? (
            <p className="mt-2 text-[12px] text-ash">
              Connect a wallet to open it.
            </p>
          ) : null}
        </div>
      )}

      {lastTx ? (
        <a
          href={explorerTx(lastTx.signature)}
          target="_blank"
          rel="noopener noreferrer"
          className="group mt-3 flex items-center gap-2 border-t border-hairline pt-3 text-[13px] text-accent"
        >
          <CheckIcon className="size-3.5 shrink-0 text-accent" />
          <span>{lastTx.label}</span>
          <span className="truncate font-mono text-[12px] underline decoration-accent/30 underline-offset-4 group-hover:decoration-accent">
            {shortSig(lastTx.signature)}
          </span>
          <ExternalIcon className="ml-auto size-3 shrink-0 text-ash group-hover:text-accent" />
        </a>
      ) : null}
      {notice ? (
        <p className="mt-3 break-words border-t border-hairline pt-3 text-[13px] text-graphite">
          {notice}
        </p>
      ) : null}

      <p className="mt-4 border-t border-hairline pt-3 text-[12px] leading-snug text-ash">
        The deployed Solana program enforces the current auction, escrow,
        refund, and settlement rules. Recorded redirect events are not
        verified customers.
      </p>
    </aside>
  );
}

const LABEL = "text-[12.5px] text-graphite";

function StatusPill({ status }: { status: "open" | "ended-no-bids" | "awaiting-settle" | "settled" }) {
  const label =
    status === "open"
      ? "Live"
      : status === "settled"
        ? "Settled"
        : status === "awaiting-settle"
          ? "Ended"
          : "Ended";
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[13px] ${status === "open" || status === "settled" ? "text-accent" : "text-graphite"}`}
    >
      {status === "open" ? (
        <span className="live-dot size-[5px] rounded-full bg-accent" />
      ) : null}
      {label}
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 py-2.5">
      <dt className="text-graphite">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function AddressLink({ address }: { address: string }) {
  return (
    <a
      href={explorerAddress(address)}
      target="_blank"
      rel="noopener noreferrer"
      className="group inline-flex items-center gap-1.5 font-mono text-[12.5px] text-ink underline decoration-hairline-strong underline-offset-4 hover:text-accent hover:decoration-accent"
    >
      {shortKey(address)}
      <ExternalIcon className="size-3 text-ash group-hover:text-accent" />
    </a>
  );
}

function formatSol(lamports: bigint): string {
  const negative = lamports < BigInt(0);
  const value = negative ? -lamports : lamports;
  const whole = value / LAMPORTS;
  const frac = value % LAMPORTS;
  const fracText = frac.toString().padStart(9, "0").replace(/0+$/, "");
  const text = fracText.length > 0 ? `${whole}.${fracText}` : `${whole}`;
  return negative ? `-${text}` : text;
}

function solToLamports(value: string): bigint {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,9})?$/.test(trimmed)) {
    throw new Error("Enter a SOL amount with up to 9 decimals");
  }
  const [whole, frac = ""] = trimmed.split(".");
  const fracPadded = `${frac}000000000`.slice(0, 9);
  return BigInt(whole) * LAMPORTS + BigInt(fracPadded);
}

function formatRemaining(seconds: number): string {
  if (seconds <= 0) return "Ended";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(secs).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

function shortKey(value: string): string {
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function shortSig(value: string): string {
  return `${value.slice(0, 8)}…`;
}

function errorText(error: unknown): string {
  const message =
    error instanceof Error ? error.message : "Something went wrong";
  // Devnet public RPC loves to 429. Surface a friendly line, not raw JSON.
  if (/429|Too many requests|rate[- ]?limit/i.test(message)) {
    return "Devnet RPC rate-limited. Reload in a moment.";
  }
  const line = message.split("\n")[0]?.trim() || "Something went wrong";
  return line.length > 160 ? `${line.slice(0, 157)}…` : line;
}
