export type PdpTrackingEvent =
  | 'pdp_view'
  | 'pdp_module_impression'
  | 'pdp_action_click'
  | 'pdp_candidates_resolved'
  | 'pdp_choose_seller_impression'
  | 'pdp_choose_seller_select'
  | 'reviews_shell_open'
  | 'reviews_shell_close'
  | 'ugc_upload_start'
  | 'ugc_upload_success'
  | 'ugc_upload_partial_fail'
  | 'placeholder_cta_click_removed';

export type PdpTrackingPayload = Record<string, unknown>;

class PdpTracking {
  private baseContext: PdpTrackingPayload = {};

  setBaseContext(context: PdpTrackingPayload) {
    this.baseContext = { ...context };
  }

  track(eventName: PdpTrackingEvent, payload: PdpTrackingPayload = {}) {
    const merged = {
      ...this.baseContext,
      ...payload,
      ts: new Date().toISOString(),
    };
    // Minimal viable tracking: structured console output.
    // eslint-disable-next-line no-console
    console.log('[TRACK]', eventName, merged);
  }
}

export const pdpTracking = new PdpTracking();
