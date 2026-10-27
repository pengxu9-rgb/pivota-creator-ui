export type MarketUnit = {
  card_id: string;
  unit_id: string;
  grade_company: string;
  grade_value: string;
  condition_bucket: string;
};
export type Merchant = { id: string; display_name: string };
export type MarketQuote = {
  schema: string;
  quote_id: string;
  connector_id: string;
  provider_name: string;
  merchant_of_record: Merchant;
  purchase_quantity: number;
  total_minor: number;
  currency: string;
  components: Record<string, number>;
  destination: string;
  quoted_at: string;
  expires_at: string;
  evidence_ref: string;
  checkout_enabled: false;
};
export type MarketOffer = {
  listing_key: string;
  source: string;
  connector_id: string;
  connector_name: string | null;
  platform: { id: string; display_name: string | null };
  native_id: string;
  card_id: string;
  unit_id: string;
  title: string;
  url: string;
  seller: {
    id: string;
    display_name: string | null;
    url: string | null;
  } | null;
  availability: "available" | "sold_out" | "withdrawn" | "unknown";
  listing_quantity: number | null;
  stock_quantity: number | null;
  ask_minor: number | null;
  currency: string | null;
  ask_basis: "listing_total";
  observed_at: string;
  valid_until: string | null;
  grade_company: string;
  grade_value: string;
  condition_bucket: string;
  quotes: MarketQuote[];
};
export type PlatformConnector = {
  schema: "pokemon.platform-connector.v1";
  id: string;
  display_name: string;
  enabled: boolean;
  platforms: { id: string; display_name: string }[];
  capabilities: {
    listings: boolean;
    locked_quotes: boolean;
    checkout: boolean;
    orders: boolean;
  };
  permissions: {
    listing_display: boolean;
    quote_display: boolean;
    cross_source_comparison: boolean;
    quote_store: boolean;
    order_write: boolean;
  };
  destinations: string[];
  merchant_of_record: Merchant | null;
};
export type Market = {
  schema: "pokemon.live-market.v2";
  card_id: string;
  destination: string | null;
  units: MarketUnit[];
  offers: MarketOffer[];
  connectors: PlatformConnector[];
  coverage: {
    connector_id: string;
    state:
      "available" | "empty" | "unavailable" | "not_connected" | "not_requested";
    checked_at: string;
    error_code: string | null;
  }[];
  coverage_scope: "registered_connectors" | "reported_sources_only";
  checked_at: string;
  checkout_available: false;
  sold_sales_available: false;
};
// Future server adapters translate actual provider DTOs and retain credentials.
// No browser API keys or test implementation belongs in the connected route.
export type PlatformAdapter = {
  readListings?: (request: {
    card_id: string;
    destination: string | null;
    signal: AbortSignal;
  }) => Promise<unknown>;
  readQuote?: (request: {
    listing: unknown;
    destination: string;
    purchase_quantity: number;
    signal: AbortSignal;
  }) => Promise<unknown>;
  createOrder?: (
    preparedIntent: unknown,
    signal: AbortSignal,
  ) => Promise<unknown>;
  readOrder?: (request: unknown, signal: AbortSignal) => Promise<unknown>;
};
