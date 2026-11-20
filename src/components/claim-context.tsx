"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

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

type ClaimValue = {
  claim: SlotClaim | null;
  setClaim: (value: SlotClaim | null) => void;
};

const ClaimContext = createContext<ClaimValue | null>(null);

export function ClaimProvider({ children }: { children: React.ReactNode }) {
  const [claim, setClaimState] = useState<SlotClaim | null>(null);

  const setClaim = useCallback((value: SlotClaim | null) => {
    setClaimState((prev) => (sameClaim(prev, value) ? prev : value));
  }, []);

  const value = useMemo(() => ({ claim, setClaim }), [claim, setClaim]);

  return <ClaimContext.Provider value={value}>{children}</ClaimContext.Provider>;
}

export function useClaim(): ClaimValue {
  const value = useContext(ClaimContext);
  if (!value) throw new Error("ClaimProvider missing");
  return value;
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
