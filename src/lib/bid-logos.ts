export type LogoPlacement = {
  dataUrl: string;
  aspect: number;
  scale: number;
  offsets: {
    shirt: { x: number; y: number };
    laptop: { x: number; y: number };
  };
};

function storageKey(auction: string, bidder: string): string {
  return `pitchlink-logo:${auction}:${bidder}`;
}

export function saveBidLogo(auction: string, bidder: string, logo: LogoPlacement): void {
  try {
    localStorage.setItem(storageKey(auction, bidder), JSON.stringify(logo));
  } catch {
    // This browser refused the save. The logo still shows until refresh.
  }
}

export function loadBidLogo(auction: string, bidder: string): LogoPlacement | null {
  try {
    const raw = localStorage.getItem(storageKey(auction, bidder));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LogoPlacement;
    if (!parsed?.dataUrl || !parsed.offsets?.shirt || !parsed.offsets?.laptop) return null;
    return parsed;
  } catch {
    return null;
  }
}
