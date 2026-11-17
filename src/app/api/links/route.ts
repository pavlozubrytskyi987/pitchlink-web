import { NextRequest, NextResponse } from "next/server";
import { createLink, listLinks } from "@/lib/links";

// POST /api/links
// Mint a new tracked link and return /go/<linkId>.
export async function POST(req: NextRequest) {
  let body: { destination?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const destination = body.destination?.trim();
  if (!destination) {
    return NextResponse.json(
      { error: "destination is required" },
      { status: 400 }
    );
  }

  // Basic URL validation (must be http/https).
  try {
    const url = new URL(destination);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("invalid protocol");
    }
  } catch {
    return NextResponse.json(
      { error: "destination must be a valid http/https URL" },
      { status: 400 }
    );
  }

  const link = createLink(destination);

  return NextResponse.json({
    id: link.id,
    destination: link.destination,
    shortUrl: `/go/${link.id}`,
    clicks: link.clicks,
  });
}

// GET /api/links
// List all tracked links with current click counts.
export async function GET() {
  return NextResponse.json(listLinks());
}
