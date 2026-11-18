// Hand-off from the SLOT CLAIMED reveal to the tracked-link service.
//
// The service itself (src/app/api/links, src/app/go/[linkId], src/lib/links.ts)
// belongs to the click-tracking work. This file only calls its HTTP contract:
//   POST /api/links { destination, creator } -> { id, shortUrl, clicks? }
//   GET  /api/links/:id                      -> 200 | 404
// One link per (auction + creator) per browser: id cached in localStorage.

export type TrackedLink = { id: string; url: string };

function cacheKey(auction: string): string {
  return `pitchlink-tracked-link:${auction}`;
}

function readCache(auction: string): string | null {
  try {
    return localStorage.getItem(cacheKey(auction));
  } catch {
    return null;
  }
}

function writeCache(auction: string, id: string) {
  try {
    localStorage.setItem(cacheKey(auction), id);
  } catch {
    // Storage refused; the link still shows for this visit.
  }
}

function toLink(id: string, shortUrl?: string): TrackedLink {
  const path = shortUrl ?? `/go/${id}`;
  return { id, url: new URL(path, window.location.origin).toString() };
}

/** Returns null when the tracked-link service is not reachable. */
export async function getOrMintTrackedLink(
  auction: string,
  destination: string,
  creator: string,
): Promise<TrackedLink | null> {
  const cached = readCache(auction);
  if (cached) {
    try {
      const res = await fetch(`/api/links/${encodeURIComponent(cached)}`);
      if (res.ok) return toLink(cached);
    } catch {
      // fall through and mint
    }
  }
  try {
    const res = await fetch("/api/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destination, creator }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { id?: string; shortUrl?: string };
    if (!body.id) return null;
    writeCache(auction, body.id);
    return toLink(body.id, body.shortUrl);
  } catch {
    return null;
  }
}
