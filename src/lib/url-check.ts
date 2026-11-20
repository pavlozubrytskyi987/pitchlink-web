// Shared validation for advertiser-supplied URLs. http/https only, no
// credentials, no IP-literal or loopback hosts (SSRF hygiene for any
// server-side fetch, and destination transparency for visitors).

export function isSafeHttpUrl(raw: string, { allowTemplate = false } = {}): boolean {
  try {
    const probe = allowTemplate ? raw.replace("{linkId}", "placeholder") : raw;
    const url = new URL(probe);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost")) return false;
    if (host.endsWith(".local") || host.endsWith(".internal")) return false;
    // IPv4 literal
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
      const [a, b] = host.split(".").map(Number);
      if (a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || a === 0) {
        return false;
      }
    }
    // IPv6 literal
    if (host.includes(":")) return false;
    return true;
  } catch {
    return false;
  }
}

/** Logo URLs: safe http(s) and a plausible image path or known image host. */
export function isSafeLogoUrl(raw: string): boolean {
  if (!isSafeHttpUrl(raw)) return false;
  try {
    const url = new URL(raw);
    return /\.(png|jpe?g|webp|gif|svg|avif)(\?.*)?$/i.test(url.pathname + url.search);
  } catch {
    return false;
  }
}
