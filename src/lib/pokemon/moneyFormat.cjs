"use strict";
function formatMinor(minor, currency) {
  if (
    !Number.isSafeInteger(minor) ||
    minor < 0 ||
    !["JPY", "USD", "HKD"].includes(currency)
  )
    throw Error("Invalid recorded amount.");
  const value = BigInt(minor),
    scale = currency === "JPY" ? 1n : 100n;
  return (
    currency +
    " " +
    (value / scale).toLocaleString("en") +
    (scale === 1n ? "" : "." + String(value % scale).padStart(2, "0"))
  );
}
module.exports = { formatMinor };
