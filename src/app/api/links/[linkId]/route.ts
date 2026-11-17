import { NextResponse } from "next/server";
import { getLink } from "@/lib/links";

// GET /api/links/[linkId]
// Read a single link's metadata + click count.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ linkId: string }> }
) {
  const { linkId } = await params;
  const link = getLink(linkId);

  if (!link) {
    return NextResponse.json({ error: "Link not found" }, { status: 404 });
  }

  return NextResponse.json(link);
}
