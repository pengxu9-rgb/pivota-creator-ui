"use strict";
// A cold catalog read must finish before owner-state work and its cleanup.
// The route and the two private proxies retain additional response margins.
module.exports = Object.freeze({
  CATALOG_CALL_MS: 30000,
  PRIVATE_WORK_MS: 35000,
  PRIVATE_HARD_MS: 38000,
  PRIVATE_ROUTE_MS: 40000,
  PRIVATE_LEASE_MS: 45000,
});
