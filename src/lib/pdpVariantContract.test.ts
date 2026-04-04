import test from "node:test";
import assert from "node:assert/strict";

async function loadEvaluator() {
  const mod = await import(new URL("./pdpVariantContract.ts", import.meta.url).href);
  return mod.evaluateExternalSeedPdpVariantContract;
}

test("uses upstream degraded contract when get_pdp_v2 reports incomplete external-seed variants", async () => {
  const evaluateExternalSeedPdpVariantContract = await loadEvaluator();
  const result = evaluateExternalSeedPdpVariantContract({
    pdpPayload: {
      product: {
        product_id: "ext_1",
        default_variant_id: "ext_1",
        variants: [{ variant_id: "ext_1", title: "Default Title" }],
        variants_complete: false,
        variant_contract: {
          status: "degraded",
          is_complete: false,
          root_cause_category: "seed_source_missing_variants",
          anomaly_types: ["zero_variants"],
        },
      },
    },
    raw: {
      metadata: {
        variant_contract: {
          status: "degraded",
          is_complete: false,
          root_cause_category: "seed_source_missing_variants",
          anomaly_types: ["zero_variants"],
        },
      },
    },
  });

  assert.equal(result.isComplete, false);
  assert.equal(result.rootCauseCategory, "seed_source_missing_variants");
  assert.deepEqual(result.anomalyTypes, ["zero_variants"]);
});

test("accepts a real single-variant product even without option selectors", async () => {
  const evaluateExternalSeedPdpVariantContract = await loadEvaluator();
  const result = evaluateExternalSeedPdpVariantContract({
    pdpPayload: {
      product: {
        product_id: "ext_2",
        default_variant_id: "v1",
        variants: [{ variant_id: "v1", title: "50 ml" }],
      },
    },
  });

  assert.equal(result.isComplete, true);
  assert.equal(result.status, "ok");
});

test("detects proxy-side variant loss when canonical payload had more variants than the selected payload", async () => {
  const evaluateExternalSeedPdpVariantContract = await loadEvaluator();
  const result = evaluateExternalSeedPdpVariantContract({
    pdpPayload: {
      product: {
        product_id: "ext_3",
        default_variant_id: "v1",
        variants: [{ variant_id: "v1", title: "Default Title" }],
      },
    },
    raw: {
      modules: [
        {
          type: "canonical",
          data: {
            pdp_payload: {
              product: {
                product_id: "ext_3",
                default_variant_id: "v1",
                variants: [
                  { variant_id: "v1", title: "Light", options: [{ name: "Shade", value: "Light" }] },
                  { variant_id: "v2", title: "Medium", options: [{ name: "Shade", value: "Medium" }] },
                ],
              },
            },
          },
        },
      ],
    },
  });

  assert.equal(result.isComplete, false);
  assert.equal(result.rootCauseCategory, "pdp_proxy_adapter_dropped_variants");
  assert.deepEqual(result.anomalyTypes, ["canonical_variants_lost_in_proxy"]);
});
