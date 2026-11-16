"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { LogoPlacement } from "@/lib/bid-logos";

type LogoDraftValue = {
  draft: LogoPlacement | null;
  setDraft: (value: LogoPlacement | null) => void;
  winner: LogoPlacement | null;
  setWinner: (value: LogoPlacement | null) => void;
  settled: boolean;
  setSettled: (value: boolean) => void;
};

const LogoDraftContext = createContext<LogoDraftValue | null>(null);

export function LogoDraftProvider({ children }: { children: React.ReactNode }) {
  const [draft, setDraftState] = useState<LogoPlacement | null>(null);
  const [winner, setWinner] = useState<LogoPlacement | null>(null);
  const [settled, setSettled] = useState(false);

  const setDraft = useCallback((value: LogoPlacement | null) => {
    setDraftState((prev) => (sameLogo(prev, value) ? prev : value));
  }, []);

  const value = useMemo(
    () => ({ draft, setDraft, winner, setWinner, settled, setSettled }),
    [draft, setDraft, settled, winner],
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
