"use client";

import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useCallback, useEffect, useState } from "react";
import { CheckIcon, ExternalIcon } from "@/components/icons";
import { useLogoDraft } from "@/components/logo-draft";
import { pushRealBid } from "@/lib/bid-feed";
import { loadBidLogo, saveBidLogo } from "@/lib/bid-logos";
import { CREATORS, HERO_CREATOR_PUBKEY } from "@/data/creators";
import { explorerAddress, explorerTx } from "@/lib/explorer";
import {
  findAuction,
  getBids,
  initializeAuction,
  placeBid,
  settleAuction,
  watchAuctionAccount,
  type AuctionAccount,
  type BidRecord,
} from "@/lib/program";

const LAMPORTS = BigInt("1000000000");

export function AuctionPanel() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { draft, setWinner, setSettled, setClaim } = useLogoDraft();
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
    const next = await findAuction(connection);
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

  const remaining = auction && now !== null ? auction.endTs - now : null;
  const ended = Boolean(
    auction && (auction.settled || (remaining !== null && remaining <= 0)),
  );
  const isCreator = Boolean(
    wallet && auction && wallet.publicKey.equals(auction.creator),
  );
  const winnerKey =
    auction && auction.highestBid > BigInt(0)
      ? auction.highestBidder.toBase58()
      : null;

  useEffect(() => {
    setSettled(Boolean(auction?.settled));
    if (!auction || !winnerKey) {
      setWinner(null);
      return;
    }
    const mine = wallet?.publicKey.equals(auction.highestBidder) ?? false;
    if (mine && draft)
      saveBidLogo(auction.publicKey.toBase58(), winnerKey, draft);
    const stored = loadBidLogo(auction.publicKey.toBase58(), winnerKey);
    setWinner(auction.settled ? (stored ?? (mine ? draft : null)) : null);
  }, [auction, draft, setSettled, setWinner, wallet, winnerKey]);

  // Hand the settled result to the SLOT CLAIMED reveal on the stage.
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
      if (!draft) {
        setNotice("Upload a logo on the shirt first. It stays if you win.");
        setBusy(null);
        return;
      }
      const lamports = solToLamports(amount);
      const signature = await placeBid(
        connection,
        wallet,
        auction.creator,
        lamports,
      );
      saveBidLogo(
        auction.publicKey.toBase58(),
        wallet.publicKey.toBase58(),
        draft,
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

  const status = !auction
    ? null
    : auction.settled
      ? "settled"
      : ended
        ? "ended"
        : "live";
  const urgent = remaining !== null && remaining > 0 && remaining < 3600;

  return (
    <aside className="flex h-full min-h-[480px] flex-col rounded-[20px] border border-line bg-raised p-4 sm:min-h-[560px]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[14px] font-semibold tracking-[-0.01em]">Auction</h2>
          {status ? <StatusPill status={status} /> : null}
        </div>
        {auction ? (
          <a
            href={explorerAddress(auction.publicKey.toBase58())}
            target="_blank"
            rel="noopener noreferrer"
            title="Auction account on Solana Explorer (devnet)"
            className="group inline-flex h-7 items-center gap-1.5 rounded-full border border-line px-2.5 text-[11.5px] text-fg-3 transition-colors hover:border-line-strong hover:text-fg-2"
          >
            <span className="font-mono text-fg-2 group-hover:text-fg">
              {shortKey(auction.publicKey.toBase58())}
            </span>
            <ExternalIcon className="size-3 group-hover:text-live-ink" />
          </a>
        ) : (
          <span className="text-[12px] text-fg-3">Devnet</span>
        )}
      </div>

      {loading ? (
        <div className="mt-5 space-y-2" aria-label="Loading the auction">
          <div className="h-[104px] animate-pulse rounded-[14px] bg-panel" />
          <div className="h-11 animate-pulse rounded-[12px] bg-panel" />
        </div>
      ) : auction ? (
        <>
          <div className="mt-4 rounded-[14px] border border-line bg-panel p-3.5">
            <div className="flex items-baseline justify-between gap-2">
              <p className={LABEL}>Highest bid</p>
              <p className={LABEL}>{auction.settled ? "Status" : "Ends in"}</p>
            </div>
            <div className="mt-1.5 flex items-baseline justify-between gap-3">
              <p className="text-[30px] font-semibold leading-none tracking-[-0.03em] tabular-nums">
                {auction.highestBid > BigInt(0) ? (
                  <>
                    {formatSol(auction.highestBid)}{" "}
                    <span className="text-[14px] font-medium text-fg-3">SOL</span>
                  </>
                ) : (
                  <span className="text-fg-3">No bids</span>
                )}
              </p>
              <p
                className={`font-mono text-[14px] tabular-nums ${urgent ? "text-alert" : auction.settled ? "text-live-ink" : "text-fg-2"}`}
              >
                {auction.settled
                  ? "Settled"
                  : remaining === null
                    ? "…"
                    : formatRemaining(remaining)}
              </p>
            </div>
            <dl className="mt-3 space-y-1.5 border-t border-line pt-2.5 text-[12px]">
              {winnerKey ? (
                <Row label={auction.settled ? "Winner" : "Leading"}>
                  <AddressLink address={winnerKey} />
                </Row>
              ) : null}
              <Row label="Pays out to">
                <AddressLink address={auction.creator.toBase58()} />
              </Row>
            </dl>
          </div>

          {ended && !auction.settled ? (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => void submitSettle()}
                disabled={!wallet || busy !== null}
                className="h-11 w-full rounded-[12px] bg-live text-[14px] font-semibold text-canvas transition-colors hover:bg-live-ink disabled:bg-panel-2 disabled:text-fg-3"
              >
                {busy === "settle" ? "Settling…" : "Settle & claim the slot"}
              </button>
              <p className="mt-2 text-[12px] leading-snug text-fg-3">
                Phantom pops up. Click Confirm.
                {auction.highestBid > BigInt(0)
                  ? ` ${formatSol(auction.highestBid)} SOL goes to ${shortKey(auction.creator.toBase58())}.`
                  : " This closes the auction."}
              </p>
              {!wallet ? (
                <p className="mt-1 text-[12px] text-fg-3">
                  Connect a wallet to settle.
                </p>
              ) : null}
            </div>
          ) : null}

          <form
            className="mt-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submitBid();
            }}
          >
            <label htmlFor="bid-amount" className={LABEL}>
              Your bid
            </label>
            <div className="mt-1.5 flex gap-2">
              <div className="relative min-w-0 flex-1">
                <input
                  id="bid-amount"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  inputMode="decimal"
                  placeholder="0.10"
                  aria-label="Bid in SOL"
                  disabled={ended || !wallet || isCreator}
                  className="h-11 w-full rounded-[12px] border border-line bg-panel pl-3 pr-12 font-mono text-[15px] tabular-nums text-fg outline-none transition-colors placeholder:text-fg-3 focus:border-live/50 disabled:opacity-50"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-fg-3">
                  SOL
                </span>
              </div>
              <button
                type="submit"
                disabled={
                  ended ||
                  !wallet ||
                  isCreator ||
                  busy !== null ||
                  amount.trim() === "" ||
                  !draft
                }
                className="h-11 shrink-0 rounded-[12px] bg-live px-4 text-[13.5px] font-semibold text-canvas transition-colors hover:bg-live-ink disabled:bg-panel-2 disabled:text-fg-3"
              >
                {busy === "bid" ? "Sending…" : "Place bid"}
              </button>
            </div>
          </form>
          <div className="mt-2 space-y-1 text-[12px] leading-snug text-fg-3">
            {!wallet ? <p>Connect a wallet to bid.</p> : null}
            {isCreator ? (
              <p>The creator can’t bid on their own auction.</p>
            ) : null}
            {wallet && !isCreator && !ended && !draft ? (
              <p className="text-fg-2">
                Upload a logo on the shirt first. It stays if you win.
              </p>
            ) : null}
            {!ended ? (
              <p>
                Bids are escrowed on-chain. If you&rsquo;re outbid, you&rsquo;re
                refunded in the same transaction.
              </p>
            ) : null}
          </div>

          <div className="mt-5 min-h-0 flex-1 overflow-y-auto">
            <div className="flex items-baseline justify-between">
              <p className={LABEL}>Bids · on-chain</p>
              {bids.length ? (
                <p className="text-[11px] tabular-nums text-fg-3">{bids.length}</p>
              ) : null}
            </div>
            {bids.length === 0 ? (
              <p className="mt-2 text-[13px] text-fg-3">No bids yet.</p>
            ) : (
              <ul className="mt-1.5 divide-y divide-line">
                {bids.map((bid, i) => (
                  <li key={bid.signature}>
                    <a
                      href={explorerTx(bid.signature)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Open this bid on Solana Explorer"
                      className="group -mx-2 flex items-center justify-between gap-3 rounded-[10px] px-2 py-2 transition-colors hover:bg-panel"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className={`size-1.5 shrink-0 rounded-full ${i === 0 ? "bg-live" : "bg-fg-3/50"}`} />
                        <span className="truncate font-mono text-[12.5px] text-fg-2">
                          {shortKey(bid.bidder.toBase58())}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="text-[13px] font-medium tabular-nums">
                          {formatSol(bid.amount)} SOL
                        </span>
                        <ExternalIcon className="size-3 text-fg-3 group-hover:text-live-ink" />
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : (
        <div className="mt-5">
          <p className="text-[14px] text-fg">No auction is open.</p>
          <p className="mt-1 text-[12px] text-fg-3">
            Click Open auction. Phantom pops up. Click Confirm.
          </p>
          <label className={`mt-4 block ${LABEL}`}>
            Minutes
            <input
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
              inputMode="numeric"
              className="mt-1.5 h-11 w-full rounded-[12px] border border-line bg-panel px-3 font-mono text-[15px] normal-case tracking-normal text-fg outline-none focus:border-live/50"
            />
          </label>
          <button
            type="button"
            onClick={() => void openAuction()}
            disabled={!wallet || busy !== null}
            className="mt-3 h-11 w-full rounded-[12px] bg-live text-[14px] font-semibold text-canvas transition-colors hover:bg-live-ink disabled:bg-panel-2 disabled:text-fg-3"
          >
            {busy === "open" ? "Opening…" : "Open auction"}
          </button>
          {!wallet ? (
            <p className="mt-2 text-[12px] text-fg-3">
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
          className="group mt-3 flex items-center gap-2 rounded-[12px] border border-live/30 bg-live/[0.06] px-3 py-2 text-[12px] transition-colors hover:border-live/60"
        >
          <CheckIcon className="size-3.5 shrink-0 text-live-ink" />
          <span className="font-medium text-fg">{lastTx.label}</span>
          <span className="truncate font-mono text-fg-3 group-hover:text-fg-2">
            {shortSig(lastTx.signature)}
          </span>
          <ExternalIcon className="ml-auto size-3 shrink-0 text-fg-3 group-hover:text-live-ink" />
        </a>
      ) : null}
      {notice ? (
        <p className="mt-3 break-words rounded-[12px] border border-line bg-panel px-3 py-2 text-[12px] text-fg-2">
          {notice}
        </p>
      ) : null}
    </aside>
  );
}

const LABEL = "text-[10px] font-medium uppercase tracking-[0.14em] text-fg-3";

function StatusPill({ status }: { status: "live" | "ended" | "settled" }) {
  const look =
    status === "live"
      ? "bg-live text-canvas"
      : status === "settled"
        ? "border border-live/40 text-live-ink"
        : "border border-line-strong text-fg-2";
  return (
    <span
      className={`flex items-center gap-1 rounded-full px-2 py-[3px] text-[9.5px] font-bold tracking-[0.12em] ${look}`}
    >
      {status === "live" ? (
        <span className="live-dot size-1.5 rounded-full bg-canvas" />
      ) : null}
      {status.toUpperCase()}
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-fg-3">{label}</dt>
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
      className="group inline-flex items-center gap-1 font-mono text-fg-2 hover:text-fg"
    >
      {shortKey(address)}
      <ExternalIcon className="size-3 text-fg-3 group-hover:text-live-ink" />
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
  const line = message.split("\n")[0]?.trim() || "Something went wrong";
  return line.length > 160 ? `${line.slice(0, 157)}…` : line;
}
