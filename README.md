# Pitchlink

Pitchlink is the on-chain market for crypto creator attention. Brands bid SOL to win an ad placement on a crypto creator's next video. Every placement will generate a tracked link whose clicks and on-chain actions are recorded on Solana, so creators are priced by real conversion instead of follower count.

Conversion and attribution tracking is the next milestone. It is not live yet. What runs today is the devnet auction: brands bid SOL into escrow, and the highest bidder wins the placement.

## Stack

- **On-chain:** Anchor program on Solana devnet
- **Frontend:** Next.js (App Router) and `@solana/wallet-adapter` (Phantom, Solflare)

## Program

Deployed program id (devnet):

```
EvJeVAfsJQ5tKR2RH4to2jgePPftg175H2re4Tw9V9AD
```

The app uses this id from `src/lib/config.ts`. Set `NEXT_PUBLIC_PROGRAM_ID` only if you are pointing at a different deployment.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000.

`NEXT_PUBLIC_QUICKNODE_DEVNET_URL` is optional. Leave it blank to use the public Solana devnet RPC. Connect a devnet wallet to place a bid; the wallet needs devnet SOL.
