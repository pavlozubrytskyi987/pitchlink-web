"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useLogoDraft } from "@/components/logo-draft";
import type { ProductId } from "@/components/logo-stage";

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
  const { setDraft, winner, settled } = useLogoDraft();
  const locked = settled;
  const shownUrl = settled ? (winner?.dataUrl ?? null) : logoUrl;
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
      className="relative flex h-full min-h-[560px] flex-col overflow-hidden rounded-2xl border border-[#e6e4df] bg-[#f6f5f3]"
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
        <div className="flex h-12 items-center gap-3 rounded-xl bg-white px-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
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
            className="min-w-0 flex-1 truncate text-left text-sm text-[#8a8884]"
          >
            {settled
              ? winner
                ? "Winner’s logo"
                : "No winning logo was saved in this browser"
              : (logoName ?? "Upload a logo — it sits on the shirt or the laptop")}
          </button>
          {!locked && logoUrl ? (
            <>
              <label className="flex items-center gap-2 text-xs text-[#8a8884]">
                Size
                <input
                  type="range"
                  min={0.6}
                  max={1.8}
                  step={0.02}
                  value={logoScale}
                  onChange={(event) => setLogoScale(Number(event.target.value))}
                  aria-label="Logo size"
                />
              </label>
              <button type="button" onClick={clearLogo} className="text-sm text-[#1c1c1c]">
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
        if (file.type === "image/svg+xml") {
          resolve({ dataUrl, aspect });
          return;
        }
        const max = 1024;
        const scale = Math.min(1, max / Math.max(image.width, image.height));
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
    <div className="flex items-center rounded-lg bg-white p-1">
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={`rounded-md px-3 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#e6e4df] ${
              active ? "bg-[#f3f2ef] font-medium text-[#1c1c1c]" : "text-[#9a9a9a]"
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
      className="grid h-9 w-9 place-items-center rounded-lg border border-[#e6e4df] bg-white text-[#1c1c1c]"
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
