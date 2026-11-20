# Pitchlink

**Your audience is worth more than your follower count.**

Pitchlink is a sponsorship marketplace where crypto creators auction ad
placements in their videos. Brands bid SOL, creators get paid through
on-chain settlement, and auction activity is publicly inspectable on the
Solana blockchain.

## Problem and solution

Small creators with specialized audiences — Solana traders, DeFi
analysts, protocol communities — often produce the most valuable
attention in crypto, but sponsorship deals are sized by follower count.
Their audiences are worth more than the market pays for them.

Pitchlink lets the market price the audience directly:

1. A creator lists a video sponsorship opportunity (an "ad slot").
2. Advertisers bid SOL against each other in an open, on-chain auction.
3. The winning bid settles to the creator through the program.
4. The winner receives the sponsorship placement plus a tracked link
   whose redirect events are recorded on-chain.

Every bid, refund, settlement, and redirect-counter update is a real,
confirmed devnet transaction that anyone can inspect on Solana Explorer.

## Technical architecture

- **On-chain program** — an Anchor program on Solana devnet. It owns
  the auction state, the escrow, the refund logic, and the click
  counters. Program ID:
  [`EvJeVAfsJQ5tKR2RH4to2jgePPftg175H2re4Tw9V9AD`](https://explorer.solana.com/address/EvJeVAfsJQ5tKR2RH4to2jgePPftg175H2re4Tw9V9AD?cluster=devnet)
- **Frontend** — Next.js (App Router) with `@solana/wallet-adapter`
  (Phantom, Solflare). All auction reads and writes go straight from the
  browser wallet to the program; there is no custodial backend.
- **Tracked-link + campaign service** — a thin Next.js API layer so
  that ad viewers never need a wallet:
  - `src/lib/relayer.ts` loads a funded devnet keypair from
    `RELAYER_SECRET_KEY` (Vercel) or `RELAYER_KEYPAIR` (local file) and
    signs `init_click_counter` / `increment_click`. Never
    `NEXT_PUBLIC_*`.
  - Winner campaign setup (`POST /api/campaigns`) requires a
    Phantom-signed, single-use nonce challenge **and** an on-chain
    check that the wallet is the settled auction's highest bidder.
    Brand name / destination / logo are advertiser-provided metadata,
    not on-chain-verified identity.
  - Persistence: Vercel Blob in production (`BLOB_READ_WRITE_TOKEN`),
    local `.pitchlink/store.json` in dev. Counts are **never** stored
    off-chain — the ClickCounter PDA is the only source of truth.
  - `GET /go/[linkId]` 302s immediately and submits `increment_click`
    via Next.js `after()`. Rate-limited per IP.
  - Public judge demo: `/try` ("Try live tracking") — no wallet needed.
- **Key accounts** — one auction PDA per creator (seeded by creator
  wallet), a program-controlled escrow (treasury) PDA that holds bid
  lamports, and one `ClickCounter` PDA per tracked link.

## Solana integration — transaction lifecycle

1. **Bid** — an advertiser's wallet signs `place_bid`; lamports move
   into the program-controlled escrow PDA.
2. **Escrow** — the escrow PDA has no private key; only the program can
   move the funds, per its own rules.
3. **Atomic refund** — when a higher bid lands, the same transaction
   refunds the previous highest bidder in full. There is no separate
   claim step and no moment where two parties are owed money.
4. **Settlement** — after the auction ends, `settle_auction` pays the
   creator from escrow according to program rules. An auction that ends
   with no bids has no winner and no settlement — the UI reflects that.
5. **Redirect counter** — each click on a tracked link produces an
   `increment_click` transaction that updates the link's `ClickCounter`
   PDA and emits a `clickRecorded` event the UI subscribes to.

### Scope of claims

- **V1 (live):** programmable escrow and on-chain auction records;
  redirect events recorded on-chain.
- **V2 (planned, not implemented):** composable conversion verification
  using trusted advertiser program state (e.g., a counter-program CPI).
- **Long-term:** portable creator performance history.

On-chain payment settles at auction close; the video placement itself is
fulfilled off-chain by the creator, and the UI says so explicitly.

## Setup

```bash
npm install
cp .env.example .env.local

# Generate + fund a devnet relayer (server-only):
solana-keygen new -o ~/.config/solana/pitchlink-relayer.json
solana airdrop 1 $(solana address -k ~/.config/solana/pitchlink-relayer.json) --url devnet
echo "RELAYER_KEYPAIR=$HOME/.config/solana/pitchlink-relayer.json" >> .env

npm run dev
```

Open http://localhost:3000. Connect a devnet wallet with devnet SOL to
place a bid on the live auction.

Environment variables — see `.env.example` for the full list:

- `NEXT_PUBLIC_PROGRAM_ID` — defaults to the deployed devnet program.
- `NEXT_PUBLIC_QUICKNODE_DEVNET_URL` / `SOLANA_RPC_URL` — dedicated
  RPC. Prefer `SOLANA_RPC_URL` for server-only (never browser-bundled).
- `RELAYER_SECRET_KEY` — server-only base58/JSON secret (Vercel).
  Locally you may use `RELAYER_KEYPAIR` instead (file path).
- `BLOB_READ_WRITE_TOKEN` — required on Vercel for shared link/campaign
  persistence across serverless invocations.
- `LINKS_SEED_JSON` / `CAMPAIGNS_SEED_JSON` — optional seed so a fresh
  deploy ships a legitimately-claimed demo campaign.

## Deploy (Vercel)

```bash
npm i -g vercel
vercel link
# Create a Blob store in the Vercel dashboard, then:
vercel env add BLOB_READ_WRITE_TOKEN
vercel env add RELAYER_SECRET_KEY
vercel env add SOLANA_RPC_URL
vercel env add NEXT_PUBLIC_QUICKNODE_DEVNET_URL
# Optional: seed the claimed SABG demo campaign (LINKS_SEED_JSON /
# CAMPAIGNS_SEED_JSON). Do not invent campaigns that were never claimed.
vercel --prod
```

Do **not** put private keys in git or in `NEXT_PUBLIC_*` variables.
DNS for pitchlink.xyz is intentionally left alone until the deploy is
verified.

## Testing

Everything below runs against devnet and produces inspectable
transactions.

```bash
# Typecheck
npx tsc --noEmit

# Inspect the current auction state for the demo creator
npx tsx scripts/check-auction.ts <creator-pubkey>

# Initialize a fresh auction (demo creator keypair, duration in minutes)
ANCHOR_WALLET=~/.config/solana/pitchlink-demo2.json \
  DURATION_MINUTES=30 npx tsx scripts/init-auction.ts

# Place a bid from a second (foreign) wallet and verify escrow movement
npx tsx scripts/bid-and-verify.ts

# Settle or cancel after end time
ANCHOR_WALLET=... npx tsx scripts/settle-auction.ts
ANCHOR_WALLET=... npx tsx scripts/cancel-auction.ts
```

Tracked links end-to-end:

```bash
# Mint a tracked link for the demo creator:
curl -X POST http://localhost:3000/api/links \
  -H 'content-type: application/json' \
  -d '{"destination":"https://example.com","creator":"<creator-pubkey>"}'
# -> { id: "abc12345", shortUrl: "/go/abc12345", ... }

# Click it a few times:
for i in 1 2 3; do curl -s http://localhost:3000/go/abc12345 >/dev/null; done

# Read the real count from chain:
curl -s http://localhost:3000/api/links/abc12345
npx tsx scripts/check-clicks.ts
```

Each click is a real devnet transaction. The auction tile and
`/creator/<slug>` pages subscribe to the on-chain `clickRecorded` event
and update live — no polling.

## Current limitations

- **Devnet only.** The program is deployed to devnet; SOL has no real
  value.
- **Upgradeable program.** The deployed program enforces the auction,
  escrow, refund, and settlement rules described here, but it is a
  loader-v3 upgradeable program and an upgrade authority is retained for
  the hackathon. It is not immutable — do not claim otherwise.
- **Redirect events, not verified conversions.** The counter records
  that a redirect happened. It does not prove a purchase or signup —
  that is the V2 roadmap item, and it is not implemented.
- **Off-chain fulfillment.** The program settles payment; it does not
  enforce that the creator publishes the video or honors the placement.
- **Relayer centralization.** Click transactions are signed by a
  server-side relayer so viewers don't need wallets. Anyone could spam
  increments; a production design would rate-limit or verify redirects.
- **One auction per creator.** The program derives one auction PDA per
  creator wallet, so a creator runs one auction at a time.
- **No auction-close instruction reuse.** After settlement a creator
  must rotate wallets to run a new auction (demo flow only).

## V2 roadmap

1. **Composable conversion verification** — advertisers deploy (or
   reference) a small counter program that records real conversions
   (purchase, signup); the Pitchlink program CPIs into it, so creators
   prove customer actions rather than redirect counts.
2. **Portable creator performance history** — a creator's verified
   conversion record becomes an on-chain asset any sponsor can read
   before bidding.
3. **Mainnet deployment**, multiple concurrent slots per creator, and
   auction-close/re-init flows.
