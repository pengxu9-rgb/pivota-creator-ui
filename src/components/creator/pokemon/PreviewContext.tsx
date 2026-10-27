"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import type { Card, Journey } from "@/lib/pokemon/types";
import type {
  CollectionItem,
  WatchRulePreview,
} from "@/lib/pokemon/visual/view-models";
const PreviewContext = createContext<{
  environment: "local" | "google-cloud-test";
  pins: Card[];
  setPins: (v: Card[]) => void;
  added: CollectionItem[];
  setAdded: (v: CollectionItem[]) => void;
  watches: WatchRulePreview[];
  setWatches: (v: WatchRulePreview[]) => void;
  turns: Record<string, Journey>;
  setTurns: React.Dispatch<React.SetStateAction<Record<string, Journey>>>;
} | null>(null);
export function PreviewProvider({
  children,
  environment = "local",
}: {
  children: ReactNode;
  environment?: "local" | "google-cloud-test";
}) {
  const [pins, setPins] = useState<Card[]>([]),
    [added, setAdded] = useState<CollectionItem[]>([]),
    [watches, setWatches] = useState<WatchRulePreview[]>([]),
    [turns, setTurns] = useState<Record<string, Journey>>({});
  return (
    <PreviewContext.Provider
      value={{
        environment,
        pins,
        setPins,
        added,
        setAdded,
        watches,
        setWatches,
        turns,
        setTurns,
      }}
    >
      {children}
    </PreviewContext.Provider>
  );
}
export function usePreview() {
  const value = useContext(PreviewContext);
  if (!value) throw new Error("PreviewProvider required");
  return value;
}
