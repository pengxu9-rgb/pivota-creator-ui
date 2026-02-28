# pivota-creator-ui

Creator Agent UI (Next.js App Router).

## Standard PDP (contract-first)

The creator product detail page renders the **standardized PDP** by calling the Agent Gateway contract:

1) `resolve_product_candidates` (only when `merchant_id` is missing)  
2) `get_pdp` (renders `pdp_payload` directly; no per-app adapter)

### Local dev

1) Start gateway (mock is fine):

```bash
cd ../_prod_repos/PIVOTA-Agent
npm ci --no-audit --no-fund
USE_MOCK=true PORT=3000 npm run dev
```

2) Start creator UI:

```bash
cd ../pivota-creator-ui
npm ci --no-audit --no-fund
PIVOTA_AGENT_URL=http://localhost:3000/agent/creator/v1/invoke \
CREATOR_AGENT_API_KEY=dev_creator_key \
CREATOR_CHECKOUT_AGENT_URL=http://localhost:3000/agent/shop/v1/invoke \
npm run dev -- -p 3004
```

Default production path is also `.../agent/shop/v1/invoke` (creator invoke remains backend alias only).

3) Open a creator PDP:

- With explicit seller:  
  `http://localhost:3004/creator/nina-studio/product/BOTTLE_001?merchant_id=merch_demo_fast_premium`
- Without seller (multi-offer) → shows “Choose a seller” gate:  
  `http://localhost:3004/creator/nina-studio/product/BOTTLE_001`

Optional:
- Force template: `?pdp=beauty` or `?pdp=generic`
- Debug (adds gateway debug flags): `?pdp_debug=1`

## Environment variables

See `.env.example`.

Recommended minimum:
- `PIVOTA_AGENT_URL` set to `/agent/shop/v1/invoke` endpoint.
- `CREATOR_AGENT_API_KEY` set once; checkout automatically reuses it when `CREATOR_CHECKOUT_AGENT_API_KEY` is unset.
- `NEXT_PUBLIC_REVIEWS_UPSTREAM_BASE` set to the public host that serves `/agent/shop/v1/review-media/*` when needed.
- `CREATOR_STANDARD_PDP_BASE_URL=https://agent.pivota.cc` so `/creator/:slug/product/:id` acts as alias to standard PDP.

Checkout note:
- Creator chat/PDP APIs use creator route + `CREATOR_AGENT_API_KEY`.
- Creator checkout APIs use shopping route + `X-Checkout-Token` (if present), otherwise default reuse `CREATOR_AGENT_API_KEY`.
- If needed, checkout can be overridden with `CREATOR_CHECKOUT_AGENT_API_KEY` (or legacy fallbacks `SHOP_GATEWAY_AGENT_API_KEY`/`AGENT_API_KEY`/`PIVOTA_API_KEY`).

Direct checkout invoke flags:
- `NEXT_PUBLIC_ENABLE_DIRECT_CHECKOUT_INVOKE`  
  `true` = browser checkout ops try direct invoke first with `X-Checkout-Token`, then auto-fallback to creator checkout proxy.
- `NEXT_PUBLIC_DIRECT_CHECKOUT_INVOKE_URL`  
  Direct invoke URL (default: `https://pivota-agent-production.up.railway.app/agent/shop/v1/invoke`).
