# Pitchlink

**On-chain market for crypto creator attention.** Brands bid SOL for an ad slot in a crypto creator's next video. The winner gets a tracked link, and every click through it is recorded on Solana — so creators earn on **verified conversion**, not follower count.

**Every number in the app is on-chain.** Bid amounts, settle amounts, click counts, and the live slot are the only numbers shown anywhere; anything not provable on-chain has been removed.

## Stack

- **On-chain:** Anchor program on Solana devnet (`EvJeVAfsJQ5tKR2RH4to2jgePPftg175H2re4Tw9V9AD`)
- **Frontend:** Next.js (App Router), `@solana/wallet-adapter` (Phantom, Solflare)
- **Server-only pieces:**
  - `src/lib/relayer.ts` loads a funded devnet keypair from `RELAYER_KEYPAIR`.
    It signs `init_click_counter` on link mint and `increment_click` on each
    redirect so visitors never need a wallet to generate a click.
  - `src/app/api/links` mints a tracked link + initializes its `ClickCounter` PDA.
  - `src/app/go/[linkId]` is the public redirect. It calls `increment_click`
    via `after()` so the 302 is immediate; the write lands off the critical path.

## Setup

```bash
npm install
cp .env.example .env.local
# Generate + fund a devnet relayer:
solana-keygen new -o ~/.config/solana/pitchlink-relayer.json
solana airdrop 1 $(solana address -k ~/.config/solana/pitchlink-relayer.json) --url devnet
# Then put its path in .env (not .env.local — server-only):
echo "RELAYER_KEYPAIR=$HOME/.config/solana/pitchlink-relayer.json" >> .env
npm run dev
```

Open http://localhost:3000. Connect a devnet wallet with devnet SOL to place a bid on the live auction. `NEXT_PUBLIC_QUICKNODE_DEVNET_URL` is optional; blank uses the public devnet RPC.

## Proving a click

```bash
# Mint a tracked link for the hero creator:
curl -X POST http://localhost:3000/api/links \
  -H 'content-type: application/json' \
  -d '{"destination":"https://example.com","creator":"HijGXNG2mLfq62rQrbWmJco3Sser37ad8xDdCbChFoPD"}'
# -> { id: "abc12345", shortUrl: "/go/abc12345", ... }

# Click it a few times:
for i in 1 2 3; do curl -s http://localhost:3000/go/abc12345 >/dev/null; done

# Read the real count (also visible as the tile's "Clicks on-chain" number):
curl -s http://localhost:3000/api/links/abc12345
```

Each click is a real transaction on devnet. The tile and `/creator/<slug>` pages subscribe to the on-chain `clickRecorded` event and update live — no polling.
