# Pitchlink

**Your audience is worth more than your follower count.**

Pitchlink is a Solana sponsorship marketplace. Creators auction a video placement. Advertisers bid SOL. The program escrows funds, refunds losers in the same transaction, and pays the creator on settlement. The winner then publishes a tracked link whose redirects are counted on-chain.

Live app: [pitchlink-web.vercel.app](https://pitchlink-web.vercel.app)

## The problem

Sponsorships are priced by follower count. Small creators with specialized audiences (traders, gamers, protocol communities) often convert better than larger accounts, but they cannot prove it and cannot run an open market for the slot.

Off-chain deals hide the price, the escrow, and the refunds. Pitchlink puts those on Solana so anyone can inspect them.

## How Pitchlink works

1. A creator lists a sponsorship (one auction PDA per creator wallet).
2. Advertisers bid SOL from Phantom.
3. The bid sits in a program-controlled treasury PDA. No platform wallet holds it.
4. A higher bid refunds the previous bidder in the **same** `place_bid` transaction.
5. After `end_ts`, anyone can call `settle_auction`. Escrow pays the creator.
6. The winning wallet signs a challenge and sets brand name, destination URL, and optional logo.
7. Visitors open `/go/[id]`, get a 302 to that destination, and a server relayer submits `increment_click`. The UI only shows the **confirmed** ClickCounter PDA count.

Auction payment is on-chain. Publishing the sponsored video is still off-chain, and the UI says so.

## Why Solana

- Program-controlled escrow: the treasury PDA has no private key.
- Atomic refunds: outbid funds return in the same transaction as the new bid.
- Permissionless settlement: anyone can crank `settle_auction` after expiry.
- Public records: bids, payouts, and redirect counts are Explorer-inspectable.

This repo is **devnet**. SOL here has no real value.

## Architecture

```
Browser (Next.js + Phantom)
    |  place_bid / settle_auction
    v
Anchor program  EvJeVAfsJQ5tKR2RH4to2jgePPftg175H2re4Tw9V9AD
    |-- Auction PDA     seeds = ["auction", creator]
    |-- Treasury PDA    seeds = ["treasury", auction]
    |-- ClickCounter    seeds = ["clicks", link_id]

Winner (signed campaign setup)
    -> Vercel Blob store (name, destination, logo)   // off-chain config
    -> POST mints /go/[id] and init_click_counter

Visitor hits /go/[id]
    -> 302 to advertiser URL
    -> after() relayer: increment_click
```

Campaign name/logo/URL are advertiser-provided metadata, not on-chain identity. Counts never live in Blob; they live on the ClickCounter PDA.

On-chain source: [pitchlink-onchain](https://github.com/pavlozubrytskyi987/pitchlink-onchain)

## Tech stack

Rust, Anchor, Solana devnet, TypeScript, Next.js 15, React 19, Phantom (wallet-adapter), QuickNode, Vercel, Vercel Blob.

## Live demo

| | |
|---|---|
| App | https://pitchlink-web.vercel.app |
| Try live tracking (no wallet) | https://pitchlink-web.vercel.app/try |
| Auction | https://pitchlink-web.vercel.app/auction |
| Creator | https://pitchlink-web.vercel.app/creator/chef-dima |
| Tracked link | https://pitchlink-web.vercel.app/go/EEy75Zax → https://sabg.fun/?ref=EEy75Zax |
| Program | https://explorer.solana.com/address/EvJeVAfsJQ5tKR2RH4to2jgePPftg175H2re4Tw9V9AD?cluster=devnet |
| ClickCounter PDA | https://explorer.solana.com/address/9td96XuhcpwnNKEhFXe1TRDtcpFzcLdjYadybR5ecFsA?cluster=devnet |

Verified round-3 demo transactions (devnet):

| Step | Tx |
|---|---|
| Init | [`3QA9ZR7t…`](https://explorer.solana.com/tx/3QA9ZR7t9WuwjcmAjFxsGR6vK9CwVZ33FqVmVoyk36wvhsa8RBwdCCRovKYPxnGxoUjaWBzhfaUjXhqYFit9p954?cluster=devnet) |
| Bid 0.05 | [`u2pYrwXh…`](https://explorer.solana.com/tx/u2pYrwXhMfHkRhw9R2WWYNPYoo2vHcCjcKib3Bnpcud2YYncbDEk958PFYHPuWWio3w43YvwEL4XM4ot12EwMSm?cluster=devnet) |
| Bid 0.06 + atomic refund | [`3qC485tw…`](https://explorer.solana.com/tx/3qC485twCtWqqZUodeikbbQ7FvV3zuBWAk8bdqb2BK3aqabaoNrUciisDE36S7kmRs57iu6Kv79dwCiZmmXaqSn9?cluster=devnet) |
| Settle (0.06 to creator) | [`4FUvnxGX…`](https://explorer.solana.com/tx/4FUvnxGX7rJv2ocrBhfNZkS6NRmirWKd8kaHEiBX21ebJAKbDmrGV4Sv9LrG3Z6aSLjkDXoh1tGrahLGXvU8fr3k?cluster=devnet) |

The bid-0.06 tx moves −0.06008 from the new bidder, +0.05 back to the previous bidder, +0.01 into escrow, in one transaction.

## Local setup

```bash
npm install
cp .env.example .env.local

# Fund a relayer (devnet only)
solana-keygen new -o ~/.config/solana/pitchlink-relayer.json
solana airdrop 1 $(solana address -k ~/.config/solana/pitchlink-relayer.json) --url devnet

# .env.local (never commit)
# RELAYER_KEYPAIR=$HOME/.config/solana/pitchlink-relayer.json
# SOLANA_RPC_URL=https://api.devnet.solana.com
# NEXT_PUBLIC_QUICKNODE_DEVNET_URL=   # optional dedicated RPC

npm run dev
```

Open http://localhost:3000. Connect a **devnet** Phantom wallet to bid.

See `.env.example` for Vercel (`RELAYER_SECRET_KEY`, `BLOB_READ_WRITE_TOKEN`). Do not put secrets in `NEXT_PUBLIC_*`.

## Testing

No unit-test runner is wired. Repro against **devnet**:

```bash
npm run typecheck
npm run build

# Read current auction for a creator wallet
npx tsx scripts/check-auction.ts <creator-pubkey>

# Confirm an atomic-refund tx's balance rows
npx tsx scripts/demo-refund-check.ts <signature>

# Read a ClickCounter
npx tsx scripts/demo-counter.ts EEy75Zax
```

Scripts that **write** on-chain state (only run if you intend to):

```bash
# New auction (fails if that creator PDA already exists)
ANCHOR_WALLET=~/.config/solana/<creator>.json DURATION_MINUTES=5 npx tsx scripts/init-auction.ts

npx tsx scripts/demo-bid.ts <creator-pubkey>
npx tsx scripts/settle-auction.ts
```

`place_bid` refunds are verified by reading Explorer/RPC balance diffs, not by mocks.

## Limitations and roadmap

**Built**

- Timed English auction, SOL bids, program escrow, atomic outbid refunds
- Permissionless settlement to the creator
- Winner-only campaign setup (signed nonce + on-chain highest-bidder check)
- Tracked `/go` redirects and ClickCounter PDAs

**Not built (do not claim)**

- Conversion SDK, unique customers, deposits, swaps, retention, revenue
- Portable creator performance history
- Mainnet, multiple concurrent auctions per creator, auction reuse after settle

**Honest constraints**

- Devnet only
- Program is **upgradeable**; an upgrade authority is retained
- Redirect count ≠ verified customer
- Video fulfillment is off-chain
- Click txs are signed by a server relayer (rate-limited, still central)
- One auction PDA per creator; after settle, a new demo needs a new creator wallet

## Repository layout

```
src/app/            pages and API routes
src/components/     UI
src/lib/            Solana client, relayer, store, URL checks
src/idl/            deployed program IDL
src/data/           creator/brand display maps (not on-chain truth)
scripts/            devnet read/write helpers
```

## Author

Solo hackathon project for UBC 2026.

- App: https://github.com/pavlozubrytskyi987/pitchlink-web
- Program: https://github.com/pavlozubrytskyi987/pitchlink-onchain
