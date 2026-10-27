"use strict";
function staticAssetAllowed(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return false;
  }
  return (
    /^\/_next\/static\/[a-zA-Z0-9/_.\[\]-]+$/.test(decoded) &&
    !decoded.split("/").some((segment) => segment === "." || segment === "..")
  );
}
module.exports = { staticAssetAllowed };
