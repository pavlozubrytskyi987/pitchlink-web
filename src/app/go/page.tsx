"use client";

import { useEffect, useState } from "react";

interface LinkRow {
  id: string;
  destination: string;
  clicks: number;
  shortUrl: string;
}

export default function GoDashboardPage() {
  const [destination, setDestination] = useState("");
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [loading, setLoading] = useState(false);

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

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!destination.trim()) return;
    setLoading(true);
    await fetch("/api/links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destination: destination.trim() }),
    });
    setDestination("");
    await refresh();
    setLoading(false);
  }

  return (
    <main className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Cloaked Links</h1>

      <form onSubmit={create} className="flex gap-2 mb-8">
        <input
          type="url"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder="https://example.com"
          className="flex-1 border rounded px-3 py-2"
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
        >
          {loading ? "Minting…" : "Mint Link"}
        </button>
      </form>

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
