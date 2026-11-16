"use client";

import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useCallback, useEffect, useState } from "react";
import { useLogoDraft } from "@/components/logo-draft";
import { pushRealBid } from "@/lib/bid-feed";
import { loadBidLogo, saveBidLogo } from "@/lib/bid-logos";
import { CREATORS, HERO_CREATOR_PUBKEY } from "@/data/creators";
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
  const { draft, setWinner, setSettled } = useLogoDraft();
  const [auction, setAuction] = useState<AuctionAccount | null>(null);
  const [bids, setBids] = useState<BidRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [minutes, setMinutes] = useState("30");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<"open" | "bid" | "settle" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);

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

  async function openAuction() {
    if (!wallet) return;
    const duration = Number(minutes);
    if (!Number.isFinite(duration) || duration < 1) {
      setNotice("Enter how many minutes the auction stays open");
      return;
    }
    setBusy("open");
    setNotice(null);
    try {
      const endTs = Math.floor(Date.now() / 1000) + Math.floor(duration * 60);
      const signature = await initializeAuction(connection, wallet, endTs);
      setNotice(`Opened ${shortSig(signature)}`);
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
      setNotice(`Bid sent ${shortSig(signature)}`);
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
    try {
      const signature = await settleAuction(
        connection,
        wallet,
        auction.creator,
      );
      setNotice(`Settled ${shortSig(signature)}`);
      await refresh();
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <aside className="flex h-full min-h-[560px] flex-col rounded-2xl border border-[#e6e4df] bg-[#f6f5f3] p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-[#1c1c1c]">Auction</h2>
        <p className="text-xs text-[#8d8d8d]">
          {auction ? shortKey(auction.creator.toBase58()) : "Devnet"}
        </p>
      </div>

      {loading ? (
        <p className="mt-6 text-sm text-[#8d8d8d]">Loading the auction…</p>
      ) : auction ? (
        <>
          <p className="mt-5 text-xs text-[#8d8d8d]">Highest bid</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-[#1c1c1c]">
            {auction.highestBid > BigInt(0)
              ? `${formatSol(auction.highestBid)} SOL`
              : "No bids"}
          </p>
          <p className="mt-3 text-sm text-[#1c1c1c]">
            {auction.settled
              ? "Settled"
              : remaining === null
                ? "…"
                : formatRemaining(remaining)}
          </p>
          {auction.settled && winnerKey ? (
            <p className="mt-1 text-sm text-[#1c1c1c]">
              Winner {shortKey(winnerKey)}
            </p>
          ) : null}

          {ended && !auction.settled ? (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => void submitSettle()}
                disabled={!wallet || busy !== null}
                className="h-11 w-full rounded-xl bg-[#161616] text-sm font-semibold text-white disabled:bg-[#d9d7d3] disabled:text-[#8d8d8d]"
              >
                {busy === "settle" ? "Settling…" : "Settle"}
              </button>
              <p className="mt-2 text-xs text-[#8d8d8d]">
                Phantom pops up. Click Confirm.
                {auction.highestBid > BigInt(0)
                  ? ` ${formatSol(auction.highestBid)} SOL goes to ${shortKey(auction.creator.toBase58())}.`
                  : " This closes the auction."}
              </p>
              {!wallet ? (
                <p className="mt-2 text-xs text-[#8d8d8d]">
                  Connect a wallet to settle.
                </p>
              ) : null}
            </div>
          ) : null}

          <form
            className="mt-5 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void submitBid();
            }}
          >
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
              placeholder="0.10"
              aria-label="Bid in SOL"
              disabled={ended || !wallet || isCreator}
              className="h-11 min-w-0 flex-1 rounded-xl bg-white px-3 text-sm outline-none ring-[#e6e4df] focus:ring-2 disabled:text-[#b0aea8]"
            />
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
              className="h-11 rounded-xl bg-[#161616] px-4 text-sm font-semibold text-white disabled:bg-[#d9d7d3] disabled:text-[#8d8d8d]"
            >
              {busy === "bid" ? "Sending…" : "Place bid"}
            </button>
          </form>
          {!wallet ? (
            <p className="mt-2 text-xs text-[#8d8d8d]">
              Connect a wallet to bid.
            </p>
          ) : null}
          {isCreator ? (
            <p className="mt-2 text-xs text-[#8d8d8d]">
              The creator can’t bid on their own auction.
            </p>
          ) : null}
          {wallet && !isCreator && !ended && !draft ? (
            <p className="mt-2 text-xs text-[#8d8d8d]">
              Upload a logo on the shirt first. It stays if you win.
            </p>
          ) : null}

          <div className="mt-5 min-h-0 flex-1 overflow-y-auto">
            <p className="text-xs text-[#8d8d8d]">Bids</p>
            {bids.length === 0 ? (
              <p className="mt-2 text-sm text-[#8d8d8d]">No bids yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-[#e6e4df]">
                {bids.map((bid) => (
                  <li
                    key={bid.signature}
                    className="flex items-baseline justify-between gap-3 py-2"
                  >
                    <span className="text-sm text-[#1c1c1c]">
                      {shortKey(bid.bidder.toBase58())}
                    </span>
                    <span className="text-sm font-medium text-[#1c1c1c]">
                      {formatSol(bid.amount)} SOL
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : (
        <div className="mt-5">
          <p className="text-sm text-[#1c1c1c]">No auction is open.</p>
          <p className="mt-1 text-xs text-[#8d8d8d]">
            Click Open auction. Phantom pops up. Click Confirm.
          </p>
          <label className="mt-4 block text-xs text-[#8d8d8d]">
            Minutes
            <input
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
              inputMode="numeric"
              className="mt-1 h-11 w-full rounded-xl bg-white px-3 text-sm text-[#1c1c1c] outline-none focus:ring-2 focus:ring-[#e6e4df]"
            />
          </label>
          <button
            type="button"
            onClick={() => void openAuction()}
            disabled={!wallet || busy !== null}
            className="mt-3 h-11 w-full rounded-xl bg-[#161616] text-sm font-semibold text-white disabled:bg-[#d9d7d3] disabled:text-[#8d8d8d]"
          >
            {busy === "open" ? "Opening…" : "Open auction"}
          </button>
          {!wallet ? (
            <p className="mt-2 text-xs text-[#8d8d8d]">
              Connect a wallet to open it.
            </p>
          ) : null}
        </div>
      )}

      {notice ? (
        <p className="mt-3 break-all text-xs text-[#8d8d8d]">{notice}</p>
      ) : null}
    </aside>
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
