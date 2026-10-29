// Proposed view models for the Pivota Pokémon visual frontend.
// PROPOSAL ONLY: no schema or API exists for the market/collection types yet.
// The local adapter must set `sample: true` on everything it fabricates.

export type Backing = "current" | "proposed" | "dependency";
export type SampleTag = { sample: boolean; dataset?: "CS-01" | "physical-fixture" };

export type Money = { currency: "HKD" | "JPY" | "USD"; minor: number }; // JPY has 0 decimals
export type UnitRef = {
  card_id: string;                      // e.g. "ja:SV4A:347/190:holo"
  grade_company: "RAW" | "PSA" | string;
  grade_value: string;                  // "raw" | "10"
  condition_bucket: string;             // "a" | "b" | "graded"
  unit_id: string;                      // card_id|grade_company|grade_value|condition_bucket
};

// Media (proposed Card.media[]) — never render an <img> without an authorized url
export type MediaRole = "catalog_art" | "listing_front" | "listing_back" | "slab";
export type Media = {
  ref: string; role: MediaRole; url: string | null; alt: string;
  attribution?: string; rights_scope?: string; as_of?: string; expires_at?: string;
};

// Discover-in-chat
export type FilterChip = { label: string; added: boolean; removed?: boolean };
export type ResultTile = SampleTag & {
  card_id: string; unit?: UnitRef; name: string; rarity: string; meta: string;
  reason?: string;                       // from recommendation.items[].reasons
  delivered?: { total: Money; destination: "HK"; listings: number } | null;
  soldLine?: string | null;              // "Sold around ¥4,500 · 12 sales" or null => "No sales data yet"
  availability: "listed" | "no_listings";
  media: Media[];
};
export type ResultBlock = {
  turnId: string; dotText: string; chips: FilterChip[];
  tiles: ResultTile[]; overBudget: ResultTile[]; removedNote?: string;
  collapsed: boolean; unparsed?: boolean; // unparsed => reply without new results
};

// Card page
export type PriceBlock = SampleTag & {
  lastSold?: { amount: Money; date: string; market: string } | null;
  typical90d?: { median: Money; n: number; iqr?: [Money, Money] } | { insufficient: true; n: number } | null;
  lowestDelivered?: { total: Money; destination: string; listings: number } | null;
};
export type SeriesPoint = { t: string; amount: Money; n?: number };
export type HistoryResponse = SampleTag & {
  unit_id: string; market: string; window: "30d" | "90d" | "1y"; currency: Money["currency"];
  sold: SeriesPoint[];                   // verified_paid only
  listed: SeriesPoint[];                 // weekly ask medians, n = listings
  lastListedAtTransition: SeriesPoint[]; // off by default; never a sale
  gaps: { from: string; to: string }[];
  coverage: { sources: number; sampling: string; updated_at: string };
  status: "ok" | "sparse" | "not_covered" | "stale";
};
export type MarketRow = SampleTag & {
  market: string; status: "ok" | "stale" | "not_covered";
  forSaleNow?: number | null; sold30d?: number | null; // null => unavailable, 0 => covered & none
  typical90d?: Money | "too_few" | null; updated_at?: string;
};
export type SaleRow = SampleTag & { settled_at: string; amount: Money; market: string; proof: "confirmed" | "confirmed_private" };
export type ListingEvent = SampleTag & { observed_at: string; kind: "price_change" | "left_observation" | "status_change"; last_listed?: Money };

// Listings / review (backed by physical/* today)
export type ListingVM = SampleTag & {
  native_id: string; label: string; condition: string; listed: Money;
  delivered: { items: Money; local_shipping: Money; international_shipping: Money; duties: Money; bns_service_fee: Money; total: Money };
  quote_id: string; expires_at: string; photos: Media[]; available: boolean; overBudget: boolean;
};
export type ReviewVM = SampleTag & {
  review_id: string; unit: UnitRef; listing: ListingVM; destination: { country: "HK"; type: "ordinary_delivery" };
  consent: boolean; state: "ready" | "expired" | "changed";
};
export type OrderStatus = "instruction_received" | "purchased" | "dispatched" | "delivered" | "cancelled" | "fulfillment_failed" | "refunded";
export type OrderVM = SampleTag & { order_reference: string; displayRef: string; status: OrderStatus; unit: UnitRef; total: Money; events: { seq: number; status: OrderStatus }[] };

// Watchlist (preview only)
export type WatchRulePreview = SampleTag & { unit_id: string; markets: string[]; metric: "ask_at_or_below" | "new_verified_sale"; threshold?: Money; rule_version: 1; status: "preview" };

// Collection (proposed collection item)
export type CollectionItem = SampleTag & {
  unit: UnitRef; source: "pivota_order" | "user_added"; order_reference?: string;
  paid?: { total: Money; card?: Money } | null;   // private; optional for user_added
  acquired_at?: string; ownership_verified: false; groups: string[];
  recentSales?: { range: [Money, Money]; n: number; market: string; last?: { amount: Money; date: string } } | null;
};
export type CollectionSummary = SampleTag & {
  cards: number; boughtHere: number; userAdded: number;
  paidDelivered: Money;                            // pivota_order items only
  salesRange?: { range: [Money, Money]; coveredCards: number } | null;
  // Intentionally no total value / gain / loss field.
};

// Embeds (public-safe)
export type EmbedContext = {
  kind: "collection" | "price" | "compare" | "delivered";
  refs: { card_id: string; unit_id?: string }[]; market?: string; window?: string;
  curator_ref?: string; disclosure?: string; snapshot_as_of: string; sample: boolean; continuation_version: 1;
  // Never: chat text, address, budget, credentials, consent.
};
