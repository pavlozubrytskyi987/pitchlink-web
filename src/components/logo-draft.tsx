"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { LogoPlacement } from "@/lib/bid-logos";

/** A settled auction with a winner: drives the SLOT CLAIMED reveal. */
export type SlotClaim = {
  /** Auction account (PDA), base58. */
  auction: string;
  /** Creator pubkey the auction pays out to. */
  creator: string;
  winner: string;
  amountSol: number;
  /** Settle tx, when it happened in this session. */
  settleSignature: string | null;
};

type LogoDraftValue = {
  draft: LogoPlacement | null;
  setDraft: (value: LogoPlacement | null) => void;
  winner: LogoPlacement | null;
  setWinner: (value: LogoPlacement | null) => void;
  settled: boolean;
  setSettled: (value: boolean) => void;
  claim: SlotClaim | null;
  setClaim: (value: SlotClaim | null) => void;
};

const LogoDraftContext = createContext<LogoDraftValue | null>(null);

export function LogoDraftProvider({ children }: { children: React.ReactNode }) {
  const [draft, setDraftState] = useState<LogoPlacement | null>(null);
  const [winner, setWinner] = useState<LogoPlacement | null>(null);
  const [settled, setSettled] = useState(false);
  const [claim, setClaimState] = useState<SlotClaim | null>(null);

  const setDraft = useCallback((value: LogoPlacement | null) => {
    setDraftState((prev) => (sameLogo(prev, value) ? prev : value));
  }, []);

  const setClaim = useCallback((value: SlotClaim | null) => {
    setClaimState((prev) => (sameClaim(prev, value) ? prev : value));
  }, []);

  // Dev-only rehearsal hook for the reveal: run
  // `__pitchlinkPreviewClaim()` in the console on /auction. It only fakes the
  // client-side reveal; nothing touches the chain. No-op in production.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const w = window as unknown as {
      __pitchlinkPreviewClaim?: (logoUrl?: string) => void;
    };
    w.__pitchlinkPreviewClaim = (logoUrl) => {
      const dataUrl = logoUrl ?? PREVIEW_LOGO;
      const image = new Image();
      image.onload = () => {
        setSettled(true);
        setWinner({
          dataUrl,
          aspect: image.naturalWidth / Math.max(image.naturalHeight, 1),
          scale: 1,
          offsets: { shirt: { x: 0, y: 0 }, laptop: { x: 0, y: 0 } },
        });
        setClaimState({
          auction: "PREVIEW",
          creator: "PREVIEW",
          winner: "PREVIEW",
          amountSol: 0,
          settleSignature: null,
        });
      };
      image.src = dataUrl;
    };
    return () => {
      delete w.__pitchlinkPreviewClaim;
    };
  }, []);

  const value = useMemo(
    () => ({ draft, setDraft, winner, setWinner, settled, setSettled, claim, setClaim }),
    [claim, draft, setClaim, setDraft, settled, winner],
  );

  return <LogoDraftContext.Provider value={value}>{children}</LogoDraftContext.Provider>;
}

export function useLogoDraft(): LogoDraftValue {
  const value = useContext(LogoDraftContext);
  if (!value) throw new Error("LogoDraftProvider missing");
  return value;
}

function sameLogo(a: LogoPlacement | null, b: LogoPlacement | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.dataUrl === b.dataUrl &&
    a.aspect === b.aspect &&
    a.scale === b.scale &&
    a.offsets.shirt.x === b.offsets.shirt.x &&
    a.offsets.shirt.y === b.offsets.shirt.y &&
    a.offsets.laptop.x === b.offsets.laptop.x &&
    a.offsets.laptop.y === b.offsets.laptop.y
  );
}

function sameClaim(a: SlotClaim | null, b: SlotClaim | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.auction === b.auction &&
    a.winner === b.winner &&
    a.amountSol === b.amountSol &&
    a.settleSignature === b.settleSignature
  );
}

// Neutral placeholder mark for the dev preview only.
const PREVIEW_LOGO = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'><circle cx='60' cy='60' r='54' fill='#111'/><path d='M38 64l14 14 30-36' stroke='#14f195' stroke-width='12' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>`,
)}`;
