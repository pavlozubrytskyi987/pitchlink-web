// Creator directory for the board. Identity only: no metrics live here.
// Every number in the UI comes from the on-chain program (bid SOL, click
// counts, settle amount). Anything not provable on-chain stays out.

// Devnet pubkey of the wallet that owns the live hero auction.
// (Auction PDA seeds = [b"auction", creator_pubkey].)
export const HERO_CREATOR_PUBKEY: string | null =
  "HijGXNG2mLfq62rQrbWmJco3Sser37ad8xDdCbChFoPD";

export type Creator = {
  slug: string;
  name: string;
  handle: string;
  /** Short topic tag (e.g. "funding-rate farming"). */
  niche: string;
  avatarUrl: string;
  clipUrl: string;
  posterUrl: string;
  /** Wallet that identifies this creator on-chain. Same key signs the auction PDA. */
  creatorPubkey: string | null;
  auctionCreatorPubkey: string | null;
  /** "live" tiles render the active auction UI; "soon" tiles say so, honestly. */
  status: "live" | "soon";
};

// --- gradient poster data-URI (so it runs with no real assets yet) ---
function posterDataUri(a: string, b: string, label: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 711' preserveAspectRatio='xMidYMid slice'>
<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
<stop offset='0' stop-color='${a}'/><stop offset='1' stop-color='${b}'/>
</linearGradient></defs>
<rect width='400' height='711' fill='url(#g)'/>
<text x='50%' y='30%' text-anchor='middle' dominant-baseline='middle' font-family='system-ui,sans-serif' font-size='28' font-weight='700' fill='rgba(255,255,255,0.85)' letter-spacing='2'>${label}</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function avatarDataUri(color: string, initials: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'>
<rect width='80' height='80' rx='40' fill='${color}'/>
<text x='50%' y='54%' text-anchor='middle' dominant-baseline='middle' font-family='system-ui,sans-serif' font-size='30' font-weight='700' fill='white'>${initials}</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

type Seed = {
  slug: string;
  name: string;
  handle: string;
  niche: string;
  g: [string, string];
  avatarColor: string;
  initials: string;
  hero?: boolean;
  hasPoster?: boolean; // public/creators/<slug>/poster.jpg exists
};

// Hero slug preserved for routing/auction wiring.
const SEEDS: Seed[] = [
  {
    slug: "chef-dima",
    name: "Pavlo Zubrytskyi",
    handle: "@pavlozubrytsskyi",
    niche: "Gaming + crypto — gameplay, clips, community",
    g: ["#6d28d9", "#0ea5e9"],
    avatarColor: "#6d28d9",
    initials: "PZ",
    hero: true,
  },
];

export const CREATOR_CATEGORIES: Record<string, string[]> = {
  "chef-dima": ["gaming", "prediction markets", "esports", "crypto"],
};

export const CREATORS: Creator[] = SEEDS.map((s) => ({
  slug: s.slug,
  name: s.name,
  handle: s.handle,
  niche: s.niche,
  avatarUrl: avatarDataUri(s.avatarColor, s.initials),
  clipUrl: `/creators/${s.slug}/clip.mp4`,
  posterUrl: s.hasPoster
    ? `/creators/${s.slug}/poster.jpg`
    : posterDataUri(s.g[0], s.g[1], s.niche.toUpperCase()),
  creatorPubkey: s.hero ? HERO_CREATOR_PUBKEY : null,
  auctionCreatorPubkey: s.hero ? HERO_CREATOR_PUBKEY : null,
  status: s.hero ? "live" : "soon",
}));
