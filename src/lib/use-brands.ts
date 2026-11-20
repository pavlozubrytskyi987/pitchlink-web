"use client";

// Bidder identity lookup: static known-bidder registry (SABG fallback)
// merged with the dynamic campaign registry (/api/campaigns) — brands that
// verified winners configured themselves with a signed challenge. Unknown
// wallets render as plain addresses; we never invent branding.

import { useEffect, useState } from "react";
import { brandFor, type Brand } from "@/data/brands";

type CampaignRow = {
  wallet: string;
  brandName: string;
  logoUrl: string | null;
};

function initialsAvatar(initials: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'>
<rect width='80' height='80' rx='14' fill='#262626'/>
<text x='50%' y='54%' text-anchor='middle' dominant-baseline='middle' font-family='system-ui,sans-serif' font-size='30' font-weight='700' fill='white'>${initials}</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

let cache: Record<string, Brand> | null = null;

export function useDynamicBrands(): Record<string, Brand> {
  const [brands, setBrands] = useState<Record<string, Brand>>(cache ?? {});
  useEffect(() => {
    let alive = true;
    fetch("/api/campaigns")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: CampaignRow[]) => {
        if (!alive || !Array.isArray(rows)) return;
        const map: Record<string, Brand> = {};
        for (const c of rows) {
          if (!c?.wallet || !c?.brandName) continue;
          const initials = c.brandName.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "AD";
          map[c.wallet] = { name: c.brandName, logo: c.logoUrl ?? initialsAvatar(initials) };
        }
        cache = map;
        setBrands(map);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return brands;
}

/** Dynamic campaign brand first, static registry fallback, else null. */
export function brandDisplayFor(
  wallet: string | null | undefined,
  dynamic: Record<string, Brand>,
): Brand | null {
  if (!wallet) return null;
  return dynamic[wallet] ?? brandFor(wallet);
}
