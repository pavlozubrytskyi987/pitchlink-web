"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useLogoDraft } from "@/components/logo-draft";
import type { ProductId } from "@/components/logo-stage";
import { SlotClaimed } from "@/components/slot-claimed";

const LogoStage = dynamic(
  () => import("@/components/logo-stage").then((mod) => mod.LogoStage),
  { ssr: false },
);

type Mode = "3d" | "photo";

export function ProductViewer() {
  const frameRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [product, setProduct] = useState<ProductId>("shirt");
  const [mode, setMode] = useState<Mode>("3d");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoName, setLogoName] = useState<string | null>(null);
  const [logoAspect, setLogoAspect] = useState(1);
  const [logoScale, setLogoScale] = useState(1);
  const [offsets, setOffsets] = useState<Record<ProductId, { x: number; y: number }>>({
    shirt: { x: 0, y: 0 },
    laptop: { x: 0, y: 0 },
  });
  const [dragging, setDragging] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  const { setDraft, winner, settled, claim } = useLogoDraft();
  const locked = settled;
  // During the SLOT CLAIMED reveal the 3D decal waits until the flying logo
  // lands on the placement, so the logo visibly locks on.
  const [revealHold, setRevealHold] = useState(false);
  const claimKey = claim ? `${claim.auction}:${claim.winner}` : null;
  useEffect(() => {
    if (!claimKey) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setRevealHold(true);
    const id = window.setTimeout(() => setRevealHold(false), 1250);
    return () => window.clearTimeout(id);
  }, [claimKey]);
  const shownUrl = settled
    ? revealHold
      ? null
      : (winner?.dataUrl ?? null)
    : logoUrl;
  const shownAspect = settled ? (winner?.aspect ?? 1) : logoAspect;
  const shownScale = settled ? (winner?.scale ?? 1) : logoScale;
  const shownOffset = settled ? (winner?.offsets[product] ?? { x: 0, y: 0 }) : offsets[product];

  useEffect(() => {
    if (!logoUrl) {
      setDraft(null);
      return;
    }
    setDraft({ dataUrl: logoUrl, aspect: logoAspect, scale: logoScale, offsets });
  }, [logoAspect, logoScale, logoUrl, offsets, setDraft]);

  async function applyFile(file: File) {
    if (locked || !file.type.startsWith("image/")) return;
    try {
      const next = await readLogo(file);
      setLogoAspect(next.aspect);
      setLogoUrl(next.dataUrl);
      setLogoName(file.name);
    } catch (error) {
      console.error(error);
    }
  }

  function clearLogo() {
    setLogoUrl(null);
    setLogoName(null);
    setLogoScale(1);
    setOffsets({ shirt: { x: 0, y: 0 }, laptop: { x: 0, y: 0 } });
  }

  async function toggleFullscreen() {
    const node = frameRef.current;
    if (!node) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await node.requestFullscreen();
  }

  return (
    <section
      ref={frameRef}
      className={`relative flex h-full min-h-[480px] flex-col overflow-hidden rounded-[14px] border bg-[#efefed] transition-colors duration-700 sm:min-h-[560px] ${
        claim ? "border-accent/40" : "border-hairline"
      }`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const file = event.dataTransfer.files?.[0];
        if (file) void applyFile(file);
      }}
    >
      <div className="flex items-center justify-between gap-3 px-3 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={mode}
            options={[
              { id: "3d", label: "3D" },
              { id: "photo", label: "Photo" },
            ]}
            onChange={setMode}
          />
          <Segmented
            value={product}
            options={[
              { id: "shirt", label: "Shirt" },
              { id: "laptop", label: "Laptop" },
            ]}
            onChange={setProduct}
          />
        </div>
        <div className="flex items-center gap-2">
          <IconButton label="Full screen" onClick={() => void toggleFullscreen()}>
            <ExpandIcon />
          </IconButton>
          <IconButton
            label="Reset view"
            onClick={() => {
              setOffsets((prev) => ({ ...prev, [product]: { x: 0, y: 0 } }));
              setLogoScale(1);
              setResetToken((n) => n + 1);
            }}
          >
            <ResetIcon />
          </IconButton>
        </div>
      </div>

      {claim ? (
        <SlotClaimed key={claimKey} claim={claim} logoUrl={winner?.dataUrl ?? null} />
      ) : null}

      <div className={`relative min-h-0 flex-1 ${dragging ? "cursor-grabbing" : ""}`}>
        <LogoStage
          product={product}
          mode={mode}
          logoUrl={shownUrl}
          logoAspect={shownAspect}
          logoScale={shownScale}
          offset={shownOffset}
          dragging={dragging}
          locked={locked}
          onOffset={(next) => setOffsets((prev) => ({ ...prev, [product]: next }))}
          onDragChange={setDragging}
          resetToken={resetToken}
        />
      </div>

      <div className="px-3 pb-3">
        <div className="flex h-12 items-center gap-3 rounded-[10px] border border-hairline bg-paper px-3.5">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void applyFile(file);
              event.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => {
              if (!locked) fileRef.current?.click();
            }}
            className={`min-w-0 flex-1 truncate text-left text-[13px] ${
              settled ? "text-accent" : logoName ? "text-ink" : "text-ash hover:text-graphite"
            }`}
          >
            {settled
              ? winner
                ? "✓ Winner’s logo, locked to the placement"
                : "Settled. The winning logo was saved in the winner’s browser."
              : (logoName ?? "Upload your logo. It goes on the shirt or the laptop.")}
          </button>
          {!locked && logoUrl ? (
            <>
              <label className="hidden items-center gap-2 text-xs text-ash sm:flex">
                Size
                <input
                  type="range"
                  min={0.6}
                  max={1.8}
                  step={0.02}
                  value={logoScale}
                  onChange={(event) => setLogoScale(Number(event.target.value))}
                  aria-label="Logo size"
                  className="w-24 accent-[var(--color-ink)]"
                />
              </label>
              <button type="button" onClick={clearLogo} className="text-[13px] text-graphite hover:text-ink">
                Remove
              </button>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function readLogo(file: File): Promise<{ dataUrl: string; aspect: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file"));
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const image = new Image();
      image.onload = () => {
        const aspect = image.width / Math.max(image.height, 1);
        // SVGs are rasterized too: one without width/height never renders
        // as a WebGL decal. They scale up to the cap so they stay crisp.
        const isSvg = file.type === "image/svg+xml";
        const max = 1024;
        const fit = max / Math.max(image.width, image.height);
        const scale = isSvg ? fit : Math.min(1, fit);
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve({ dataUrl, aspect });
          return;
        }
        ctx.drawImage(image, 0, 0, width, height);
        resolve({ dataUrl: canvas.toDataURL("image/png"), aspect: width / height });
      };
      image.onerror = () => reject(new Error("Could not read that image"));
      image.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex items-center rounded-full border border-hairline bg-paper p-0.5">
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={`rounded-full px-3 py-1 text-[12.5px] transition-colors ${
              active ? "bg-ink text-paper" : "text-graphite hover:text-ink"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid size-8 place-items-center rounded-full border border-hairline bg-paper text-graphite transition-colors hover:border-hairline-strong hover:text-ink"
    >
      {children}
    </button>
  );
}

function ExpandIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden>
      <path d="M6 2H2v4M9 2h4v4M6 13H2V9M9 13h4V9" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden>
      <path
        d="M12.2 7.5a4.7 4.7 0 1 1-1.3-3.2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path d="M11 2.2v3.2H7.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
