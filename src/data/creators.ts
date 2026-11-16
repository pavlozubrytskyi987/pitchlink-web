// Seeded creator data for the live board.
// REAL on-chain pieces come from the Anchor program; social numbers are
// seeded-from-real baselines, momentum animates forward from them.

// TODO: set this to the devnet pubkey of the hero creator whose auction is
// live on-chain. Until set, the hero tile falls back to "Opens soon" UI.
// (Auction PDA seeds = [b"auction", creator_pubkey].)
export const HERO_CREATOR_PUBKEY: string | null = null;

export type Creator = {
  slug: string;
  name: string;
  handle: string;
  niche: string;
  avatarUrl: string;
  clipUrl: string;
  posterUrl: string;
  followers: number;
  totalImpressions: number;
  momentum: number[]; // ~30 daily points
  trendPct: number;
  auctionCreatorPubkey: string | null;
  nextVideoAt: number; // unix seconds
};

// --- seeded momentum generator (deterministic) ---
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededMomentum(seed: number, start: number, endMult: number, points = 30): number[] {
  const rnd = mulberry32(seed);
  const end = start * endMult;
  const out: number[] = [];
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1);
    const base = start + (end - start) * t;
    const jitter = (rnd() - 0.4) * (end - start) * 0.08;
    out.push(Math.max(1, Math.round(base + jitter)));
  }
  return out;
}

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

const DAY = 86_400;
// Start of the current UTC day: same on server and client, and the seeded
// countdowns never go stale.
const NOW = Math.floor(Date.now() / 1000 / DAY) * DAY;

type Seed = {
  slug: string;
  name: string;
  handle: string;
  niche: string;
  g: [string, string];
  avatarColor: string;
  initials: string;
  followers: number;
  totalImpressions: number;
  momentumSeed: number;
  startViews: number;
  endMult: number;
  trendPct: number;
  daysUntilVideo: number;
  hero?: boolean;
  hasPoster?: boolean; // public/creators/<slug>/poster.jpg exists
};

const SEEDS: Seed[] = [
  {
    // REAL-BUT-ENTERED, read by hand from instagram.com/jayanth.mov on
    // 2026-11-16: followers 7,369; totalImpressions = sum of views on his 12
    // latest reels (top reel 2.8M). momentum + trendPct are seeded.
    // Clip = first 8s of his top reel (/reel/DaeeojNCCaX/), muted.
    slug: "jayanth",
    name: "Jayanth",
    handle: "@jayanth.mov",
    niche: "Edtech",
    g: ["#b91c1c", "#431407"],
    avatarColor: "#b91c1c",
    initials: "J",
    followers: 7_369,
    totalImpressions: 3_191_227,
    momentumSeed: 909,
    startViews: 9_000,
    endMult: 2.6,
    trendPct: 38,
    daysUntilVideo: 1,
    hasPoster: true,
  },
  {
    slug: "chef-dima",
    name: "Chef Dima",
    handle: "@chefdima",
    niche: "Chef",
    g: ["#f97316", "#dc2626"],
    avatarColor: "#ea580c",
    initials: "CD",
    followers: 184_000,
    totalImpressions: 12_480_000,
    momentumSeed: 101,
    startViews: 18_000,
    endMult: 3.1,
    trendPct: 41,
    daysUntilVideo: 2,
    hero: true,
  },
  {
    slug: "forge-nora",
    name: "Nora Forge",
    handle: "@noraforges",
    niche: "Knife maker",
    g: ["#64748b", "#0f172a"],
    avatarColor: "#475569",
    initials: "NF",
    followers: 92_300,
    totalImpressions: 6_210_000,
    momentumSeed: 202,
    startViews: 9_500,
    endMult: 2.4,
    trendPct: 28,
    daysUntilVideo: 4,
  },
  {
    slug: "lift-mika",
    name: "Mika Lift",
    handle: "@mikalift",
    niche: "Fitness",
    g: ["#22d3ee", "#1e3a8a"],
    avatarColor: "#0ea5e9",
    initials: "ML",
    followers: 311_500,
    totalImpressions: 24_900_000,
    momentumSeed: 303,
    startViews: 32_000,
    endMult: 1.9,
    trendPct: 17,
    daysUntilVideo: 1,
  },
  {
    slug: "lab-oskar",
    name: "Oskar Lab",
    handle: "@oskarlab",
    niche: "Chemistry",
    g: ["#a855f7", "#4c1d95"],
    avatarColor: "#7c3aed",
    initials: "OL",
    followers: 57_800,
    totalImpressions: 3_140_000,
    momentumSeed: 404,
    startViews: 6_200,
    endMult: 3.8,
    trendPct: 63,
    daysUntilVideo: 3,
  },
  {
    slug: "trail-rue",
    name: "Rue Trail",
    handle: "@ruetrail",
    niche: "Ultrarunner",
    g: ["#84cc16", "#14532d"],
    avatarColor: "#65a30d",
    initials: "RT",
    followers: 128_000,
    totalImpressions: 8_720_000,
    momentumSeed: 505,
    startViews: 11_400,
    endMult: 2.2,
    trendPct: 22,
    daysUntilVideo: 5,
  },
  {
    slug: "synth-kai",
    name: "Kai Synth",
    handle: "@kaisynth",
    niche: "Music producer",
    g: ["#ec4899", "#4a044e"],
    avatarColor: "#db2777",
    initials: "KS",
    followers: 76_500,
    totalImpressions: 4_830_000,
    momentumSeed: 606,
    startViews: 8_100,
    endMult: 2.7,
    trendPct: 35,
    daysUntilVideo: 2,
  },
  {
    slug: "wrench-tom",
    name: "Tom Wrench",
    handle: "@tomwrench",
    niche: "Mechanic",
    g: ["#f59e0b", "#78350f"],
    avatarColor: "#d97706",
    initials: "TW",
    followers: 44_200,
    totalImpressions: 2_410_000,
    momentumSeed: 707,
    startViews: 4_700,
    endMult: 3.3,
    trendPct: 51,
    daysUntilVideo: 6,
  },
];

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
  followers: s.followers,
  totalImpressions: s.totalImpressions,
  momentum: seededMomentum(s.momentumSeed, s.startViews, s.endMult),
  trendPct: s.trendPct,
  auctionCreatorPubkey: s.hero ? HERO_CREATOR_PUBKEY : null,
  nextVideoAt: NOW + s.daysUntilVideo * DAY + (s.momentumSeed % 19) * 1800,
}));
