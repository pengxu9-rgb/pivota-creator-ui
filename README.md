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
PIVOTA_AGENT_URL=http://localhost:3000/agent/shop/v1/invoke npm run dev -- -p 3004
```

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
