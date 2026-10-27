export const POKEMON_CHAT_PATH = "/creator/pokemon-collector";
const { withReadRetry } = require("@/lib/pokemon/readRetry.cjs");
const ERRORS: Record<string, string> = {
  beta_usage_limit: "This beta has reached its usage limit. Please try again later.",
  beta_limit_unavailable: "The beta could not check its usage limit. Please try again shortly.",
  beta_sign_in_required: "Sign in with an invited Google account to continue.",
  browsing_beta_only: "This browsing beta supports catalog cards and saved preferences. Live listings, certificates and quotes are not enabled.",
  read_only_scope: "This private test only reads the approved listing. Certificate queries and quotes are disabled.",
  grade_review_required: "This listing's grading evidence needs review. It cannot be selected or quoted.",
  commerce_reservation_expired: "This check expired before it could be recorded. Refresh the conversation and check again.",
  commerce_check_already_recorded: "This check is already recorded. Refresh the conversation before starting a new check.",
  commerce_reselection_required: "Choose this listing again in the current conversation before continuing.",
  commerce_history_limit: "This conversation reached its listing-check limit. Start a new chat to continue.",
  commerce_not_configured: "Live listing research is not available in this private preview yet. Try again later.",
  commerce_unavailable: "Listing research could not reach its source. Please try again.",
  invalid_commerce_response: "The listing response failed validation. No selection or handoff was accepted.",
  invalid_commerce_request: "Check your query and up to five HTTPS product URLs.",
  commerce_mode_mismatch: "The commerce service mode does not match this live or synthetic session.",
  offer_changed: "The source listing changed. Review its current price and choose it again.",
  offer_unavailable: "This listing research is no longer current. Research it again before selecting.",
  selection_expired: "This selection expired. Research and choose the listing again.",
  selection_not_found: "This selection is unavailable in your session. Choose the listing again.",
  quote_unavailable: "A provider quote is unavailable for this listing and destination.",
  unsupported_url: "Use a supported HTTPS Mercari, eBay or SNKRDUNK product URL.",
  unsupported_forwarder: "This buying path is unavailable. Choose another reported forwarder.",
  catalog_market_display_denied:
    "The catalog source has not approved market data display for this card.",
  catalog_market_unavailable:
    "The backend could not provide market data for this exact card.",
  invalid_personal_request:
    "Check the card, quantity, condition and consent before saving.",
  personal_version_conflict:
    "This record changed. Reload your collection before editing it.",
  personal_id_conflict:
    "This save identifier was already used. Reload before continuing.",
  personal_not_found: "This personal record expired or is unavailable.",
  personal_limit: "This preview supports up to 100 personal records per type.",
  catalog_busy: "The live catalog is busy. Please try again shortly.",
  live_catalog_unavailable:
    "The live catalog is unavailable. Please try again.",
  invalid_live_catalog_response:
    "The catalog response failed validation. Please try again.",
  invalid_catalog_response:
    "The collector response failed validation. Please try again.",
  catalog_record_unavailable:
    "This exact card is unavailable in the connected catalog.",
  catalog_access_denied: "The private catalog connection is unavailable.",
  chat_reply_too_long:
    "Keep this follow-up within 200 characters, or start a new chat for a longer collection question.",
  chat_version_conflict: "This chat changed. Resume it before continuing.",
  logical_turn_in_progress: "A turn is still running. Wait or stop it first.",
  catalog_cancelled:
    "The turn was stopped. Your chat and saved cards are still here.",
  catalog_timeout: "The turn timed out. Your saved cards are unchanged.",
  collector_caller_denied:
    "This private demo session is unavailable. Reload to begin again.",
  chat_not_found:
    "This conversation expired or is unavailable. Start a new chat.",
  catalog_rejected_action:
    "This choice needs current scope or evidence. Check the latest reply.",
  bookmark_not_found: "This saved card expired or is unavailable.",
  journey_turn_limit:
    "This chat reached the catalog turn limit. Start a new chat; your saved cards remain available.",
};
export async function pokemonApi<T>(
  operation: string,
  payload: unknown,
  signal?: AbortSignal,
): Promise<T> {
  return withReadRetry(
    operation,
    async () => {
      const response = await fetch(
        "/api/creator-agent/pokemon-collector/" + operation,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "X-Collector-Intent": "decision",
            "X-Creator-Request-Id": crypto.randomUUID(),
          },
          body: JSON.stringify(payload),
          signal,
        },
      );
      const value = await response.json();
      if (!response.ok) {
        const error = new Error(
          ERRORS[value.error] ||
            "This request could not finish. Please try again.",
        );
        Object.assign(error, { code: value.code || value.error });
        throw error;
      }
      return value as T;
    },
    signal,
  );
}
