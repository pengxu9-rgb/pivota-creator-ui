"use strict";
// Byte/provenance preflight for one explicitly reviewed private catalog. The
// Python CLI independently validates the SQLite schema and contents before it
// opens its authenticated loopback service. This helper never opens SQLite.
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const CATALOG_DIRECTORY = "/app/commerce-catalog";
const MAX_DATABASE_BYTES = 128 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_ROWS = 1000000;
const COUNT_KEYS = ["source_rows", "exported_rows", "complete_identity_rows", "partial_identity_rows",
  "source_public_display_rows", "exported_public_display_rows", "excluded_ineligible", "excluded_held", "excluded_invalid"];
const digest = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const fail = () => { throw Error("invalid_reviewed_catalog_artifact"); };
const keys = (value, fields) => value && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).length === fields.length && Object.keys(value).sort().join(",") === [...fields].sort().join(",");
const identity = stat => [stat.dev, stat.ino, stat.mode, stat.size, stat.nlink, stat.mtimeNs, stat.ctimeNs].join(":");

function pinnedFile(filename, maximum, includeBytes = false) {
  const before = fs.lstatSync(filename, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n || before.size <= 0n ||
      before.size > BigInt(maximum) || (before.mode & 0o222n) !== 0n) fail();
  const fd = fs.openSync(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const opened = fs.fstatSync(fd, { bigint: true });
    if (identity(opened) !== identity(before)) fail();
    const hash = createHash("sha256"), chunks = [], chunk = Buffer.alloc(65536);
    let count = 0, length;
    while ((length = fs.readSync(fd, chunk, 0, chunk.length, null)) > 0) {
      count += length;
      if (count > maximum || BigInt(count) > before.size) fail();
      const data = chunk.subarray(0, length);
      hash.update(data);
      if (includeBytes) chunks.push(Buffer.from(data));
    }
    if (BigInt(count) !== before.size || identity(fs.fstatSync(fd, { bigint: true })) !== identity(before) ||
        identity(fs.lstatSync(filename, { bigint: true })) !== identity(before)) fail();
    return { bytes: count, sha256: hash.digest("hex"), ...(includeBytes ? { content: Buffer.concat(chunks) } : {}) };
  } finally {
    fs.closeSync(fd);
  }
}

function readReviewedCatalog(directory, expectedManifestSha256) {
  try {
    if (typeof directory !== "string" || !path.isAbsolute(directory) || path.resolve(directory) !== directory ||
        !digest(expectedManifestSha256)) fail();
    const stat = fs.lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync(directory) !== directory ||
        fs.readdirSync(directory).sort().join(",") !== "catalog.sqlite3,manifest.json") fail();
    const manifestFile = pinnedFile(path.join(directory, "manifest.json"), MAX_MANIFEST_BYTES, true);
    if (manifestFile.sha256 !== expectedManifestSha256) fail();
    const manifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(manifestFile.content));
    if (manifest.schema !== "pokemon.commerce-catalog-artifact.v1" || manifest.profile !== "private_catalog_identity.v1" ||
        manifest.source?.kind !== "reviewed_catalog" ||
        !keys(manifest.database, ["file", "bytes", "sha256"]) || manifest.database.file !== "catalog.sqlite3" ||
        !Number.isSafeInteger(manifest.database.bytes) || manifest.database.bytes <= 0 || manifest.database.bytes > MAX_DATABASE_BYTES ||
        !digest(manifest.database.sha256) ||
        !keys(manifest.permissions, ["private_identity_comparison", "public_display", "images", "purchase", "auto_join"]) ||
        manifest.permissions.private_identity_comparison !== true ||
        ["public_display", "images", "purchase", "auto_join"].some(key => manifest.permissions[key] !== false) ||
        !keys(manifest.counts, COUNT_KEYS) ||
        COUNT_KEYS.some(key => !Number.isSafeInteger(manifest.counts[key]) || manifest.counts[key] < 0 || manifest.counts[key] > MAX_ROWS)) fail();
    const database = pinnedFile(path.join(directory, "catalog.sqlite3"), MAX_DATABASE_BYTES);
    if (database.sha256 !== manifest.database.sha256 || database.bytes !== manifest.database.bytes) fail();
    // This is the expected receipt, not a claim that Node opened SQLite. The
    // backend must independently attest to the same verified in-memory bytes.
    const expectedReceipt = Object.freeze({ profile: manifest.profile, manifest_sha256: expectedManifestSha256,
      database_sha256: database.sha256, counts: Object.freeze({ ...manifest.counts }),
      permissions: Object.freeze({ ...manifest.permissions }), verified_memory: true });
    return Object.freeze({ directory, manifestSha256: expectedManifestSha256, expectedReceipt });
  } catch {
    fail();
  }
}
module.exports = { CATALOG_DIRECTORY, MAX_DATABASE_BYTES, MAX_MANIFEST_BYTES, readReviewedCatalog };
