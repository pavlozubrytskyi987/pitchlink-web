import { AnchorProvider, BN, Program, type Idl } from "@coral-xyz/anchor";
import {
  Connection,
  PublicKey,
  SystemProgram,
  type Transaction,
  type VersionedTransaction,
} from "@solana/web3.js";
import idl from "@/idl/pitchlink.json";
import { PROGRAM_ID } from "@/lib/config";

const PROGRAM_PUBKEY = new PublicKey(PROGRAM_ID);
const AUCTION_SEED = Buffer.from("auction");
const TREASURY_SEED = Buffer.from("treasury");

export type PitchlinkWallet = {
  publicKey: PublicKey;
  signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]>;
};

export type AuctionAccount = {
  publicKey: PublicKey;
  creator: PublicKey;
  endTs: number;
  highestBid: bigint;
  highestBidder: PublicKey;
  settled: boolean;
  bump: number;
};

type RawAuction = {
  creator: PublicKey;
  endTs: BN;
  highestBid: BN;
  highestBidder: PublicKey;
  settled: boolean;
  bump: number;
};

export function auctionPda(creator: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [AUCTION_SEED, creator.toBuffer()],
    PROGRAM_PUBKEY,
  )[0];
}

export function treasuryPda(auction: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [TREASURY_SEED, auction.toBuffer()],
    PROGRAM_PUBKEY,
  )[0];
}

export function getPitchlinkProgram(connection: Connection, wallet?: PitchlinkWallet) {
  const provider = new AnchorProvider(connection, (wallet ?? readOnlyWallet()) as never, {
    commitment: "confirmed",
  });
  return new Program(idl as Idl, provider);
}

export type BidRecord = {
  signature: string;
  bidder: PublicKey;
  amount: bigint;
  ts: number;
  /** Auction PDA this bid landed on; only set by cross-auction fetches. */
  auction?: PublicKey;
};

const BID_PLACED_DISC = [135, 53, 176, 83, 193, 69, 108, 61];

export async function findAuction(connection: Connection): Promise<AuctionAccount | null> {
  const program = getPitchlinkProgram(connection);
  const rows = await auctionClient(program).all();
  if (rows.length === 0) return null;
  const auctions = rows.map((row) => toAuction(row.publicKey, row.account));
  const open = auctions.filter((auction) => !auction.settled);
  const pool = open.length > 0 ? open : auctions;
  pool.sort((a, b) => b.endTs - a.endTs);
  return pool[0];
}

export async function getBids(connection: Connection, auction: PublicKey): Promise<BidRecord[]> {
  const signatures = await connection.getSignaturesForAddress(auction, { limit: 25 });
  const records: BidRecord[] = [];
  await Promise.all(
    signatures.map(async (entry) => {
      if (entry.err) return;
      const tx = await connection.getTransaction(entry.signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
      const logs = tx?.meta?.logMessages;
      if (!logs) return;
      for (const bid of parseBidLogs(logs)) {
        if (!bid.auction.equals(auction)) continue;
        records.push({
          signature: entry.signature,
          bidder: bid.bidder,
          amount: bid.amount,
          ts: bid.ts,
        });
      }
    }),
  );
  records.sort((a, b) => b.ts - a.ts);
  return records;
}

/**
 * Every BidPlaced event the program ever emitted, newest first. Walks
 * recent program signatures and decodes BidPlaced logs — identical parser
 * to getBids(), but keyed on the program id instead of one auction PDA.
 *
 * Fetches getTransaction in small sequential batches so the public devnet
 * RPC doesn't 429 on a cold load.
 */
export async function getAllBids(
  connection: Connection,
  limit = 50,
  batchSize = 4,
): Promise<BidRecord[]> {
  const signatures = await connection.getSignaturesForAddress(PROGRAM_PUBKEY, { limit });
  const records: BidRecord[] = [];
  for (let i = 0; i < signatures.length; i += batchSize) {
    const slice = signatures.slice(i, i + batchSize);
    await Promise.all(
      slice.map(async (entry) => {
        if (entry.err) return;
        const tx = await connection.getTransaction(entry.signature, {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0,
        });
        const logs = tx?.meta?.logMessages;
        if (!logs) return;
        for (const bid of parseBidLogs(logs)) {
          records.push({
            signature: entry.signature,
            bidder: bid.bidder,
            amount: bid.amount,
            ts: bid.ts,
            auction: bid.auction,
          });
        }
      }),
    );
  }
  records.sort((a, b) => b.ts - a.ts);
  return records;
}

export function watchAuctionAccount(
  connection: Connection,
  auction: PublicKey,
  onChange: () => void,
): () => void {
  const id = connection.onAccountChange(auction, onChange, "confirmed");
  return () => {
    void connection.removeAccountChangeListener(id);
  };
}

export async function getAuction(
  connection: Connection,
  creator: PublicKey,
): Promise<AuctionAccount | null> {
  const program = getPitchlinkProgram(connection);
  const address = auctionPda(creator);
  const account = await auctionClient(program).fetchNullable(address);
  if (!account) return null;
  return toAuction(address, account as RawAuction);
}

export async function initializeAuction(
  connection: Connection,
  wallet: PitchlinkWallet,
  endTs: number,
): Promise<string> {
  const program = getPitchlinkProgram(connection, wallet);
  const auction = auctionPda(wallet.publicKey);
  const treasury = treasuryPda(auction);
  return program.methods
    .initializeAuction(new BN(endTs))
    .accounts({
      auction,
      treasury,
      creator: wallet.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}

export async function placeBid(
  connection: Connection,
  wallet: PitchlinkWallet,
  creator: PublicKey,
  amountLamports: bigint | number | string,
): Promise<string> {
  const auctionAccount = await getAuction(connection, creator);
  if (!auctionAccount) {
    throw new Error("No auction for this creator");
  }

  const amount = new BN(amountLamports.toString());
  if (amount.lten(0)) {
    throw new Error("Bid must be greater than 0 lamports");
  }

  const previousBidder =
    auctionAccount.highestBid > BigInt(0)
      ? auctionAccount.highestBidder
      : wallet.publicKey;

  const program = getPitchlinkProgram(connection, wallet);
  return program.methods
    .placeBid(amount)
    .accounts({
      auction: auctionAccount.publicKey,
      treasury: treasuryPda(auctionAccount.publicKey),
      previousBidder,
      bidder: wallet.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}

export async function settleAuction(
  connection: Connection,
  wallet: PitchlinkWallet,
  creator: PublicKey,
): Promise<string> {
  const auction = auctionPda(creator);
  const program = getPitchlinkProgram(connection, wallet);
  return program.methods
    .settleAuction()
    .accounts({
      auction,
      treasury: treasuryPda(auction),
      creator,
      settler: wallet.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}

export async function cancelAuction(
  connection: Connection,
  wallet: PitchlinkWallet,
): Promise<string> {
  const auction = auctionPda(wallet.publicKey);
  const program = getPitchlinkProgram(connection, wallet);
  return program.methods
    .cancelAuction()
    .accounts({
      auction,
      treasury: treasuryPda(auction),
      creator: wallet.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}

function auctionClient(program: Program<Idl>) {
  return (
    program.account as unknown as {
      auction: {
        fetchNullable(address: PublicKey): Promise<RawAuction | null>;
        all(): Promise<{ publicKey: PublicKey; account: RawAuction }[]>;
      };
    }
  ).auction;
}

function parseBidLogs(logs: string[]) {
  const bids: { auction: PublicKey; bidder: PublicKey; amount: bigint; ts: number }[] = [];
  for (const line of logs) {
    const prefix = "Program data: ";
    if (!line.startsWith(prefix)) continue;
    const raw = decodeBase64(line.slice(prefix.length));
    if (raw.length < 88) continue;
    if (!BID_PLACED_DISC.every((byte, index) => raw[index] === byte)) continue;
    const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    bids.push({
      auction: new PublicKey(raw.subarray(8, 40)),
      bidder: new PublicKey(raw.subarray(40, 72)),
      amount: view.getBigUint64(72, true),
      ts: Number(view.getBigInt64(80, true)),
    });
  }
  return bids;
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const raw = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) raw[i] = binary.charCodeAt(i);
  return raw;
}

function toAuction(publicKey: PublicKey, account: RawAuction): AuctionAccount {
  return {
    publicKey,
    creator: account.creator,
    endTs: account.endTs.toNumber(),
    highestBid: BigInt(account.highestBid.toString()),
    highestBidder: account.highestBidder,
    settled: account.settled,
    bump: account.bump,
  };
}

function readOnlyWallet(): PitchlinkWallet {
  return {
    publicKey: PublicKey.default,
    signTransaction: async () => {
      throw new Error("read-only connection");
    },
    signAllTransactions: async () => {
      throw new Error("read-only connection");
    },
  };
}

// ---- click tracking --------------------------------------------------------

export const LINK_ID_LEN = 16;
const CLICKS_SEED = Buffer.from("clicks");

/** Pack a short id into the fixed 16-byte array the program expects. */
export function linkIdBytes(linkId: string): number[] {
  const buf = Buffer.alloc(LINK_ID_LEN);
  const utf8 = Buffer.from(linkId, "utf8");
  if (utf8.length > LINK_ID_LEN) {
    throw new Error(`linkId too long (${utf8.length} > ${LINK_ID_LEN})`);
  }
  utf8.copy(buf, 0);
  return Array.from(buf);
}

export function clickCounterPda(linkId: string): PublicKey {
  return PublicKey.findProgramAddressSync(
    [CLICKS_SEED, Buffer.from(linkIdBytes(linkId))],
    PROGRAM_PUBKEY,
  )[0];
}

export type ClickCounter = {
  linkId: string;
  rawLinkId: number[];
  count: bigint;
  creator: PublicKey;
};

type RawClickCounter = {
  linkId: number[];
  count: BN;
  creator: PublicKey;
  bump: number;
};

function clickCounterClient(program: Program<Idl>) {
  return (
    program.account as unknown as {
      clickCounter: {
        fetch(address: PublicKey): Promise<RawClickCounter>;
        fetchNullable(address: PublicKey): Promise<RawClickCounter | null>;
      };
    }
  ).clickCounter;
}

function unpackLinkId(raw: number[]): string {
  const bytes = Buffer.from(raw);
  // Trim trailing NULs so "abc\0\0..." reads as "abc".
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) end -= 1;
  return bytes.slice(0, end).toString("utf8");
}

export async function getClickCounter(
  connection: Connection,
  linkId: string,
): Promise<ClickCounter | null> {
  const program = getPitchlinkProgram(connection);
  const address = clickCounterPda(linkId);
  const account = await clickCounterClient(program).fetchNullable(address);
  if (!account) return null;
  return {
    linkId: unpackLinkId(account.linkId),
    rawLinkId: account.linkId,
    count: BigInt(account.count.toString()),
    creator: account.creator,
  };
}

export async function initClickCounter(
  connection: Connection,
  relayer: PitchlinkWallet,
  linkId: string,
  creator: PublicKey,
): Promise<string> {
  const program = getPitchlinkProgram(connection, relayer);
  const clickCounter = clickCounterPda(linkId);
  return program.methods
    .initClickCounter(linkIdBytes(linkId), creator)
    .accounts({
      clickCounter,
      payer: relayer.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}

export async function incrementClick(
  connection: Connection,
  relayer: PitchlinkWallet,
  linkId: string,
): Promise<string> {
  const program = getPitchlinkProgram(connection, relayer);
  const clickCounter = clickCounterPda(linkId);
  return program.methods
    .incrementClick(linkIdBytes(linkId))
    .accounts({
      clickCounter,
      clicker: relayer.publicKey,
    })
    .rpc();
}

/** Subscribe to the on-chain ClickRecorded event (returns an unsubscribe fn). */
export function watchClickEvents(
  connection: Connection,
  onClick: (ev: { linkId: string; creator: PublicKey; count: bigint; ts: number }) => void,
): () => void {
  const program = getPitchlinkProgram(connection);
  // Narrow the arg so the handler can read event fields.
  type ClickRecordedEvent = {
    linkId: number[];
    creator: PublicKey;
    count: BN;
    ts: BN;
  };
  const id = program.addEventListener("clickRecorded", (ev: ClickRecordedEvent) => {
    onClick({
      linkId: unpackLinkId(ev.linkId),
      creator: ev.creator,
      count: BigInt(ev.count.toString()),
      ts: Number(ev.ts),
    });
  });
  return () => {
    void program.removeEventListener(id);
  };
}
