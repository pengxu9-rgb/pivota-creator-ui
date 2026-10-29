import type { FamilyContext } from "./sourceFamilyTypes";
export type MediaWarning = "finish_edition_unverified" | "not_visually_reviewed" | "source_image_name_unconfirmed" | "source_hp_conflict" | "source_hp_without_visible_header" | "stale_source_image_facts" | "source_number_coordinate_conflict" | "source_animation_frame0_preview" | "low_resolution_source";

export type Credit = { value: string; source_ref?: string; source_url?: string };
export type SourceTitleReview = {
  status: "source_title_review_pending" | "stale_source_title_warning";
  event_id: string;
  field: "name";
  original_title: string;
  corrected_title: null;
  source_ref: string;
  source_binding_state: "current_exact_identity" | "source_identity_changed_hold_retained";
  required_evidence: string[];
  explanation: string;
  physical_copy_verified: false;
  automatic_offer_join_allowed: false;
};
export type ProviderCardDetails = {
  category: "Pokemon" | "Trainer" | "Energy" | null;
  hp: number | null; types: string[] | null; stage: string | null;
  stage_source_literal: string | null;
  field_statuses: Record<"category" | "hp" | "types" | "stage", "source_declared" | "not_declared" | "not_applicable">;
};
export type ProviderCardMetadata = {
  schema: "pokemon.provider-card-metadata-context.v1" | "pokemon.provider-card-metadata-context.v2";
  status: "provider_native_metadata_supported";
  source: { provider: "tcgdex"; url: string; sha256: string; fetched_at: string };
  provider: { illustrator: string | null; rarity: string | null; card_details?: ProviderCardDetails };
};
export type PinnedPublisherMetadata = {
  schema: "pokemon.pinned-publisher-metadata.v1"; status: "pinned_publisher_metadata_supported";
  source: { provider: "ptcg-database"; declared_card_url: string; sha256: string };
  publisher: {
    card_type_raw: string | null; hp: number | null; types: string[] | null; stage_raw: string | null;
    rarity_raw: string | null; rarity_label: string | null; rarity_status: string;
    field_statuses: Record<"card_type" | "hp" | "types" | "stage", "source_supported" | "not_declared" | "source_or_current_value_hold" | "not_applicable_by_source_card_type">;
  };
};
export type OfficialAnchoredSourceDetails = {
  schema: "pokemon.official-anchored-source-details.v1";
  status: "official_anchored_source_details_supported";
  source: { provider: "ptcg-database"; revision: string; relative_path: string; provenance: string; declared_card_url: string };
  official_parent: { evidence_id: string; url: string };
  details: {
    card_type_raw: string; hp: number | null; types: string[] | null; stage_raw: string | null;
    field_statuses: Record<"card_type" | "hp" | "types" | "stage", "source_supported" | "not_declared" | "not_applicable_by_source_card_type">;
  };
};
export type Card = {
  card_id: string; name: string; language: string; set_code: string; set_name?: string;
  collector_number: string; rarity?: string; release_date?: string;
  current_illustrators?: Credit[]; provenance?: string; catalog_source_url?: string;
  release_provenance?: string; release_source_url?: string;
  source_family_advisory?: FamilyContext;
  provider_metadata?: ProviderCardMetadata;
  pinned_publisher_metadata?: PinnedPublisherMetadata;
  official_anchored_details?: OfficialAnchoredSourceDetails;
  title_review?: SourceTitleReview;
  identity_review?: { original_name: string; corrected_name: string; reason: string; official_url?: string };
};
export type ComparisonRecord = Pick<Card,"card_id"|"name"|"language"|"set_code"|"collector_number"|"provenance"> & {variant:string;match_eligible:0|1};
export type ComparisonSide = {requested?:{card_id?:string};status:string;records:ComparisonRecord[];matched_records:number;records_truncated:boolean};
export type Comparison = {
  schema:"pokemon.card-comparison.v1";status:string;left:ComparisonSide;right:ComparisonSide;
  artwork:{status:string;scope:string;difference_scope?:string};next_question:string;required_evidence:string[];
};
export type Preferences = {
  currency?: string; budget_minor?: number; grade_company?: string; grade_value?: string; destination?: string;
  collecting?: { preferred_illustrators?: string[]; subjective_notes?: string[]; preferred_dex_ids?: number[] };
};
export type Journey = {
  status: string; goal_question: string; catalog_revision: string; turn_count: number;
  candidate_cards: Card[]; card_selection_blockers: Record<string, string[]>;
  selection_allowed: boolean; selected_catalog_target: Card | null; preferences: Preferences;
  scope_filters?: { language?: string; set_code?: string };
  required_catalog_axes?: { illustrator?: string; dex_id?: number };
  next_step: { field: string; prompt: string };
  constraint_acknowledgement?: { explanation: string };
  recommendation?: { items: { card_id: string; reasons: { field: string; value: unknown; basis: string }[]; tradeoffs: string[] }[]; unapplied_preferences: { value: string }[] } | null;
  discovery?: { task?: string; comparison?: Comparison; coverage?: { offset?: number; has_more?: boolean };
    preference_match_summary?: { matched_qualified_records: number; explanation: string }[];
    recommendation_quality_manifest?: { withheld_examples: { card_id: string; reasons: string[] }[] };
  };
};
export type Workspace = {
  id: string; version: number; expiresAt: number; busy: boolean; result: Journey | null;
  collecting_feedback?: Record<string, "like" | "dismiss">;
  next_step: { field: string; prompt: string } | null; needs_reconfirmation: boolean;
  saved_decision: { card_id: string; catalog_target: Card; preferences: Preferences; transaction_ready: false } | null;
  transaction_ready: false;
};
export type CollectorAction = Record<string, unknown> & { type: string };
export type ChatMessage = {
  commerce?: import("./commerceTypes").CommerceSummary;
  id:string; role:"user"|"assistant"; status:"submitted"|"accepted"|"failed";
  text:string; createdAt:number; workspaceVersion?:number; catalogRevision?:string;
  cards?:Card[]; reasons?:Record<string,string[]>; comparison?:Comparison|null;comparisonNeedsRefresh?:boolean;
  coverage?:{offset?:number;has_more?:boolean;matched_catalog_records?:number}; blockers?:Record<string,string[]>;selectionAllowed?:boolean;
};
export type Conversation = {
  id:string;version:number;title:string;createdAt:number;updatedAt:number;expiresAt:number;
  messages:ChatMessage[];busy:boolean;workspace:Workspace|null;requiresRestart:boolean;
  target:Workspace["saved_decision"];
};
export type ConversationSummary = Pick<Conversation,"id"|"title"|"updatedAt"|"expiresAt">;
export type Bookmark = {
  id:string;kind:"catalog_bookmark";card:Card;catalogRevision:string;conversationId:string;messageId:string;
  savedAt:number;expiresAt:number;ownershipVerified:false;transactionReady:false;
};
