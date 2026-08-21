import assert from "node:assert/strict";
import {
  assertPaddleCheckoutEnabled,
  buildPaddlePriceCatalog,
  buildPaddleRuntimePriceCatalog,
  mapPaddleSubscriptionStatus,
  paddleApiBase,
  paddleCancelAtPeriodEnd,
  paddleCatalogPlans,
  PADDLE_LIVE_PRICE_IDS,
  priceMetadata,
  requirePaddlePrice,
  resolvePaddleEnvironment,
  validatePaddleApiKey,
} from "../supabase/functions/_shared/paddle-billing-core.ts";

const ids = {
  PADDLE_PRICE_INDIE_MONTHLY: "pri_01aaaaaaaaaaaaaaaaaaaaaaaa",
  PADDLE_PRICE_INDIE_YEARLY: "pri_01bbbbbbbbbbbbbbbbbbbbbbbb",
  PADDLE_PRICE_STUDIO_MONTHLY: "pri_01cccccccccccccccccccccccc",
  PADDLE_PRICE_STUDIO_YEARLY: "pri_01dddddddddddddddddddddddd",
  PADDLE_PRICE_PUBLISHER_MONTHLY: "pri_01eeeeeeeeeeeeeeeeeeeeeeee",
  PADDLE_PRICE_PUBLISHER_YEARLY: "pri_01ffffffffffffffffffffffff",
  PADDLE_PRICE_CRAZY_MONTHLY: "pri_01gggggggggggggggggggggggg",
  PADDLE_PRICE_CRAZY_YEARLY: "pri_01hhhhhhhhhhhhhhhhhhhhhhhh",
};
const catalog = buildPaddlePriceCatalog((key) => ids[key as keyof typeof ids]);
assert.equal(catalog.length, 8);
assert.equal(requirePaddlePrice(catalog, "studio", "yearly").priceId, ids.PADDLE_PRICE_STUDIO_YEARLY);
assert.equal(requirePaddlePrice(catalog, "crazy", "monthly").priceId, ids.PADDLE_PRICE_CRAZY_MONTHLY);
assert.deepEqual(paddleCatalogPlans(catalog), ["indie", "studio", "publisher", "crazy"]);
assert.deepEqual(priceMetadata(catalog, ids.PADDLE_PRICE_PUBLISHER_MONTHLY), {
  priceId: ids.PADDLE_PRICE_PUBLISHER_MONTHLY,
  plan: "publisher",
  period: "monthly",
});

const liveCatalog = buildPaddleRuntimePriceCatalog("live", () => undefined);
assert.equal(liveCatalog.length, 8);
assert.equal(requirePaddlePrice(liveCatalog, "crazy", "monthly").priceId, PADDLE_LIVE_PRICE_IDS.crazy.monthly);
assert.equal(requirePaddlePrice(liveCatalog, "crazy", "yearly").priceId, PADDLE_LIVE_PRICE_IDS.crazy.yearly);
assert.deepEqual(paddleCatalogPlans(liveCatalog), ["indie", "studio", "publisher", "crazy"]);

const sandboxCatalog = buildPaddleRuntimePriceCatalog("sandbox", () => undefined);
assert.equal(sandboxCatalog.length, 6);
assert.deepEqual(paddleCatalogPlans(sandboxCatalog), ["indie", "studio", "publisher"]);

assert.equal(mapPaddleSubscriptionStatus("active"), "active");
assert.equal(mapPaddleSubscriptionStatus("paused"), "past_due");
assert.equal(mapPaddleSubscriptionStatus("unexpected"), "incomplete");
assert.equal(paddleCancelAtPeriodEnd({ action: "cancel" }), true);
assert.equal(paddleCancelAtPeriodEnd({ action: "pause" }), false);
assert.equal(resolvePaddleEnvironment(undefined), "sandbox");
assert.equal(resolvePaddleEnvironment("live"), "live");
assert.equal(paddleApiBase("sandbox"), "https://sandbox-api.paddle.com");
assert.equal(paddleApiBase("live"), "https://api.paddle.com");
assert.equal(validatePaddleApiKey("sandbox", "pdl_sdbx_apikey_example"), "pdl_sdbx_apikey_example");
assert.equal(validatePaddleApiKey("live", "pdl_live_apikey_example"), "pdl_live_apikey_example");
assert.throws(() => validatePaddleApiKey("live", "pdl_sdbx_apikey_example"));
assert.doesNotThrow(() => assertPaddleCheckoutEnabled({ environment: "sandbox", billingEnabled: "true", liveBillingEnabled: undefined }));
assert.throws(() => assertPaddleCheckoutEnabled({ environment: "live", billingEnabled: "true", liveBillingEnabled: undefined }));
assert.doesNotThrow(() => assertPaddleCheckoutEnabled({ environment: "live", billingEnabled: "true", liveBillingEnabled: "true" }));

console.log("Paddle Merchant-of-Record billing core checks passed.");
