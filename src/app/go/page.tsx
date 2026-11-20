"use client";

import { useEffect, useState } from "react";

interface LinkRow {
  id: string;
  destination: string;
  clicks: number;
  shortUrl: string;
}

export default function GoDashboardPage() {
  const [links, setLinks] = useState<LinkRow[]>([]);

  async function refresh() {
    const res = await fetch("/api/links");
    const data = (await res.json()) as LinkRow[];
    setLinks(
      data.map((l) => ({
        ...l,
        shortUrl: `/go/${l.id}`,
      }))
    );
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <main className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Cloaked Links</h1>

      <p className="mb-8 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
        Open minting is disabled. Tracked links are created by verified
        auction winners through the signed campaign setup on the settled
        auction page.
      </p>

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">Short URL</th>
            <th className="py-2">Destination</th>
            <th className="py-2 text-right">Redirect events</th>
          </tr>
        </thead>
        <tbody>
          {links.map((link) => (
            <tr key={link.id} className="border-b">
              <td className="py-2 font-mono">
                <a href={link.shortUrl} className="text-blue-600 hover:underline">
                  {link.shortUrl}
                </a>
              </td>
              <td className="py-2 max-w-xs truncate" title={link.destination}>
                {link.destination}
              </td>
              <td className="py-2 text-right">{link.clicks}</td>
            </tr>
          ))}
          {links.length === 0 && (
            <tr>
              <td colSpan={3} className="py-4 text-gray-500">
                No links minted yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
