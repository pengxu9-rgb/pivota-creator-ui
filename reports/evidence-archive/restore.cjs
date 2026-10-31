'use strict';
// Offline restore only. Run with the repository's strict-network-guard preload.
const guard = require('../../tests/helpers/strict-network-guard.cjs');
const fs = require('node:fs'), path = require('node:path');
const assert = require('node:assert/strict'), {createHash} = require('node:crypto');
const hash = (algorithm, bytes) => createHash(algorithm).update(bytes).digest('hex');
const inside = (root, candidate) => candidate === root || candidate.startsWith(root + path.sep);
function canonicalFuture(candidate) {
  const tail = []; let current = path.resolve(candidate);
  while (!fs.existsSync(current)) { tail.unshift(path.basename(current)); current = path.dirname(current); }
  return path.join(fs.realpathSync(current), ...tail);
}
function containingWorktree(candidate) {
  let current = candidate;
  while (true) {
    if (fs.existsSync(path.join(current, '.git'))) return current;
    const parent = path.dirname(current); if (parent === current) return null; current = parent;
  }
}
function checkedPath(root, relative, createParents) {
  assert.equal(typeof relative, 'string');
  assert.ok(relative.startsWith('reports/') && !relative.includes('\\') &&
    relative.split('/').every(part => part && part !== '.' && part !== '..'), 'unsafe manifest path');
  const parts = relative.split('/'); let current = root;
  for (const part of parts.slice(0, -1)) {
    current = path.join(current, part);
    if (!fs.existsSync(current) && createParents) fs.mkdirSync(current);
    const stat = fs.lstatSync(current);
    assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), 'unsafe directory: ' + relative);
  }
  const file = path.join(root, ...parts);
  // lstat also catches dangling symlinks, which existsSync deliberately follows.
  try { const stat = fs.lstatSync(file); assert.ok(stat.isFile() && !stat.isSymbolicLink(), 'unsafe file: ' + relative); }
  catch (error) { if (error.code !== 'ENOENT' || !createParents) throw error; }
  return file;
}
function verify(bytes, row) {
  const [relative, size, blob, sha256] = row;
  assert.equal(bytes.length, size, 'size mismatch: ' + relative);
  assert.equal(hash('sha256', bytes), sha256, 'SHA-256 mismatch: ' + relative);
  assert.equal(hash('sha1', Buffer.concat([Buffer.from('blob ' + size + '\0'), bytes])), blob, 'Git blob mismatch: ' + relative);
}
function main(args) {
  assert.match(process.env.NODE_OPTIONS || '', /strict-network-guard\.cjs/, 'strict guard preload required');
  const into = args.includes('--into-worktree'), positional = args.filter(arg => arg !== '--into-worktree');
  assert.ok(args.length === positional.length + Number(into) && positional.length === 2 &&
    positional.every(arg => !arg.startsWith('--')), 'usage: restore.cjs ARCHIVE_ROOT TARGET [--into-worktree]');
  const archive = fs.realpathSync(positional[0]), target = canonicalFuture(positional[1]);
  const product = fs.realpathSync(path.join(__dirname, '../..'));
  assert.ok(into || (!inside(product, target) && !containingWorktree(target)), 'target is inside a worktree; requires --into-worktree');
  assert.ok(!inside(archive, target) && !inside(target, archive), 'archive and target must not overlap');
  let manifestBytes = fs.readFileSync(path.join(__dirname, 'manifest.json'));
  const descriptor = JSON.parse(manifestBytes);
  if (descriptor.schema === 'pot.admission.compressed-manifest.v1') {
    assert.equal(descriptor.encoding, 'gzip');
    assert.equal(descriptor.file, 'manifest.json.gz');
    const packed = fs.readFileSync(path.join(__dirname, descriptor.file));
    assert.equal(hash('sha256', packed), descriptor.compressed_sha256);
    manifestBytes = require('node:zlib').gunzipSync(packed);
    assert.equal(manifestBytes.length, descriptor.uncompressed_bytes);
    assert.equal(hash('sha256', manifestBytes), descriptor.uncompressed_sha256);
  }
  const manifest = JSON.parse(manifestBytes);
  assert.equal(manifest.schema, 'pot.admission.evidence-archive.v1');
  assert.equal(manifest.source_head, 'e9eba70f423fd6e7f37528c8e8f28fa072dab9eb');
  assert.deepEqual(manifest.columns, ['basename', 'bytes', 'git_blob_id', 'sha256']);
  assert.equal(manifest.path_rule, 'repo_relative_directory + "/" + basename');
  assert.equal(manifest.object_format, 'sha1');
  const seen = new Set(); let total = 0;
  fs.mkdirSync(target, {recursive: true});
  const rows = manifest.groups.flatMap(group => {
    assert.ok(Array.isArray(group) && group.length === 2 && typeof group[0] === 'string' && Array.isArray(group[1]), 'invalid path group');
    const [directory, entries] = group;
    assert.ok(directory.startsWith('reports/') && directory.split('/').every(part => part && part !== '.' && part !== '..') && !directory.includes('\\'), 'unsafe directory prefix');
    return entries.map(entry => {
      assert.ok(Array.isArray(entry) && entry.length === 4 && typeof entry[0] === 'string' && !entry[0].includes('/') && !entry[0].includes('\\'), 'invalid path row');
      return [directory + '/' + entry[0], ...entry.slice(1)];
    });
  });
  for (const row of rows) {
    assert.ok(Array.isArray(row) && row.length === 4, 'invalid manifest row');
    const [relative, size, blob, sha256] = row;
    assert.ok(!seen.has(relative), 'duplicate manifest path'); seen.add(relative);
    assert.ok(Number.isSafeInteger(size) && size >= 0 && /^[a-f0-9]{40}$/.test(blob) && /^[a-f0-9]{64}$/.test(sha256), 'invalid manifest hashes');
    const bytes = fs.readFileSync(checkedPath(archive, relative, false)); verify(bytes, row);
    const destination = checkedPath(target, relative, true);
    if (fs.existsSync(destination)) verify(fs.readFileSync(destination), row);
    else fs.writeFileSync(destination, bytes, {flag: 'wx'});
    verify(fs.readFileSync(destination), row); total += size;
  }
  assert.equal(seen.size, manifest.file_count); assert.equal(total, manifest.total_bytes);
  assert.equal(guard.attempts.length, 0);
  console.log(JSON.stringify({restored: seen.size, bytes: total, source_head: manifest.source_head,
    manifest_sha256: hash('sha256', manifestBytes), network_attempts: 0, verified: true}));
}
if (require.main === module) { try { main(process.argv.slice(2)); } catch (error) { console.error(error); process.exitCode = 1; } }
module.exports = {main};
