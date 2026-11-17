import { NextRequest, NextResponse } from "next/server";
import { getLink, recordClick } from "@/lib/links";
import { after } from "next/server";

// GET /go/[linkId]
// Dub.co-style redirect: look up the destination, fire click logging
// asynchronously so the visitor is redirected immediately, then 302.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ linkId: string }> }
) {
  const { linkId } = await params;
  const link = getLink(linkId);

  if (!link) {
    return NextResponse.json({ error: "Link not found" }, { status: 404 });
  }

  // Record the click off the critical path (Dub.co uses ev.waitUntil).
  // If `after` is unavailable in this environment we fall back to awaiting.
  try {
    after(recordClick(linkId));
  } catch {
    await recordClick(linkId);
  }

  return NextResponse.redirect(link.destination, { status: 302 });
}
