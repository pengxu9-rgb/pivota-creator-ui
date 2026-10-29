'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const router = path.join(root, 'scripts/release-routing.py');
const cleanEnv = {
  PATH: process.env.PATH,
  LC_ALL: 'C',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: '/dev/null',
};
const zero = '0'.repeat(40);
function git(repo, ...args) {
  const result = spawnSync('git', [
    '-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Routing tests',
    '-c', 'user.email=routing@example.invalid', '-c', 'commit.gpgsign=false', ...args,
  ], { cwd: repo, encoding: 'utf8', env: cleanEnv });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function write(repo, files) {
  for (const [name, contents] of Object.entries(files)) {
    const file = path.join(repo, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  }
}
function commit(repo, files = {}) {
  write(repo, files);
  git(repo, 'add', '--all');
  git(repo, 'commit', '--quiet', '--allow-empty', '-m', 'routing fixture');
  return git(repo, 'rev-parse', 'HEAD');
}
function fixture(t, files = { 'src/app/creator/page.tsx': 'creator baseline' }) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'creator-release-routing-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const repo = path.join(directory, 'repo');
  fs.mkdirSync(repo);
  git(repo, 'init', '--quiet', '-b', 'main');
  const before = commit(repo, files);
  return { repo, before, output: path.join(directory, 'github-output') };
}
function route(f, options = {}, expectedStatus = 0) {
  const output = f.output;
  fs.writeFileSync(output, '');
  const args = { event: 'push', ref: 'refs/heads/main', before: f.before, after: git(f.repo, 'rev-parse', 'HEAD'), confirmTarget: '', ...options };
  const result = spawnSync('python3', [
    '-I', '-B', router, `--event=${args.event}`, `--ref=${args.ref}`,
    `--before=${args.before}`, `--after=${args.after}`, `--confirm-target=${args.confirmTarget}`,
  ], { cwd: f.repo, encoding: 'utf8', env: { ...cleanEnv, GITHUB_OUTPUT: output } });
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
  const decision = JSON.parse(result.stdout);
  assert.equal(fs.readFileSync(output, 'utf8'), `deploy_creator=${decision.deploy_creator}\n`);
  return decision;
}

test('all exclusive Pot source, runtime, coverage, and release paths skip creator', t => {
  const f = fixture(t);
  commit(f.repo, Object.fromEntries([
    'src/app/creator/pokemon-collector/page.tsx',
    'src/app/api/creator-agent/pokemon-collector/state/route.ts',
    'src/components/creator/pokemon/Research.tsx',
    'src/components/creator/PokemonCards.tsx',
    'src/components/creator/PokemonCreatorAgent.module.css',
    'src/components/creator/pokemonClient.ts',
    'src/lib/pokemon/commerce.cjs',
    'cloud/pokemon/runtime/runtime.cjs',
    'cloud/pokemon/release/preflight.py',
    'private-coverage/snapshot.json',
    'scripts/prepare-private-coverage.cjs',
    '.github/workflows/pokemon-offline.yml',
    '.github/workflows/pot-release-preflight.yml',
  ].map(name => [name, 'Pot change'])));
  const result = route(f);
  assert.equal(result.deploy_creator, false);
  assert.equal(result.path_count, 13);
});

test('the separation-only workflow/script/operator-doc/test commit skips creator', t => {
  const f = fixture(t);
  commit(f.repo, Object.fromEntries([
    '.github/workflows/deploy-cloud-run.yml', '.github/workflows/pot-release-preflight.yml',
    'scripts/release-routing.py', 'docs/creator-release-routing.md',
    'tests/release-routing.test.cjs', 'tests/pot-release.test.cjs',
    'cloud/pokemon/release/README.md', 'cloud/pokemon/release/policy.json',
  ].map(name => [name, 'separation only'])));
  assert.equal(route(f).deploy_creator, false);
});

test('test-only additions and fixtures are non-runtime; nearby shared production still releases', t => {
  const f = fixture(t);
  const testsOnly = commit(f.repo, {
    'tests/new-creator-regression.test.cjs': 'test',
    'tests/fixtures/new-case.json': '{}',
    'tests/helpers/new-helper.py': 'pass',
  });
  assert.equal(route(f).deploy_creator, false);
  commit(f.repo, { 'src/components/creator/CreatorAgentLayout.tsx': 'shared production change' });
  assert.equal(route(f, { before: testsOnly }).deploy_creator, true);
});

test('creator/shared source, dependencies, infrastructure, assets, and unknown paths release', t => {
  const f = fixture(t);
  for (const name of [
    'src/app/creator/page.tsx', 'src/app/layout.tsx', 'src/lib/agent.ts',
    'src/components/creator/CreatorAgentContext.tsx', 'package.json', 'package-lock.json',
    'next.config.mjs', 'Dockerfile', '.dockerignore', 'tsconfig.json',
    'public/pokemon-card.png', 'scripts/unreviewed-release.py',
    '.github/workflows/new-workflow.yml', 'docs/new-operator-notes.md',
    'src/lib/pokemon-shared.ts', 'src/app/creator/pokemon-collector-v2/page.tsx',
  ]) {
    const before = git(f.repo, 'rev-parse', 'HEAD');
    commit(f.repo, { [name]: 'shared change' });
    const decision = route(f, { before });
    assert.equal(decision.deploy_creator, true, name);
    assert.deepEqual(decision.creator_paths_sample, [name]);
  }
});

test('mixed Pot/shared push releases even when the shared file sorts after more than 300 Pot files', t => {
  const f = fixture(t);
  const files = Object.fromEntries(Array.from({ length: 401 }, (_, i) => [`cloud/pokemon/batch/${i}.txt`, 'Pot']));
  files['src/lib/shared-last.ts'] = 'creator';
  commit(f.repo, files);
  const decision = route(f);
  assert.equal(decision.path_count, 402);
  assert.equal(decision.deploy_creator, true);
  assert.deepEqual(decision.creator_paths_sample, ['src/lib/shared-last.ts']);
  const before = git(f.repo, 'rev-parse', 'HEAD');
  commit(f.repo, Object.fromEntries(Array.from({ length: 401 }, (_, i) => [`cloud/pokemon/batch/${i}.txt`, 'updated Pot'])));
  assert.equal(route(f, { before }).deploy_creator, false);
});

test('rename across either ownership boundary releases; a Pot-to-Pot rename skips', t => {
  const f = fixture(t, {
    'src/lib/shared.ts': 'same contents',
    'src/lib/pokemon/old.ts': 'Pot contents',
  });
  git(f.repo, 'mv', 'src/lib/shared.ts', 'src/lib/pokemon/moved-in.ts');
  const movedIn = commit(f.repo);
  assert.equal(route(f).deploy_creator, true, 'shared source removed by rename');
  git(f.repo, 'mv', 'src/lib/pokemon/moved-in.ts', 'src/lib/moved-out.ts');
  const movedOut = commit(f.repo);
  assert.equal(route(f, { before: movedIn }).deploy_creator, true, 'shared destination added by rename');
  git(f.repo, 'mv', 'src/lib/pokemon/old.ts', 'src/lib/pokemon/new.ts');
  assert.equal(route(f, { before: movedOut, after: commit(f.repo) }).deploy_creator, false);
});

test('deleting shared source releases; deleting exclusive Pot source skips', t => {
  const f = fixture(t, { 'src/lib/shared.ts': 'shared', 'src/lib/pokemon/only.ts': 'Pot' });
  fs.unlinkSync(path.join(f.repo, 'src/lib/pokemon/only.ts'));
  const potDeleted = commit(f.repo);
  assert.equal(route(f).deploy_creator, false);
  fs.unlinkSync(path.join(f.repo, 'src/lib/shared.ts'));
  assert.equal(route(f, { before: potDeleted, after: commit(f.repo) }).deploy_creator, true);
});

test('NUL-delimited paths preserve spaces, tabs, newlines, and workflow-command-like names', t => {
  const f = fixture(t);
  commit(f.repo, {
    'cloud/pokemon/space tab\tnewline\n::set-output name=deploy_creator::true': 'Pot',
    'tests/weird\nfixture.json': '{}',
  });
  assert.equal(route(f).deploy_creator, false);
  const before = git(f.repo, 'rev-parse', 'HEAD');
  const name = 'src/lib/shared\n::set-output name=deploy_creator::false.ts';
  commit(f.repo, { [name]: 'shared' });
  const decision = route(f, { before });
  assert.equal(decision.deploy_creator, true);
  assert.deepEqual(decision.creator_paths_sample, [name]);
});

test('a multi-commit push uses the complete before/after range, not only its last commit', t => {
  const f = fixture(t);
  commit(f.repo, { 'src/lib/shared.ts': 'creator change in earlier commit' });
  commit(f.repo, { 'src/lib/pokemon/last.ts': 'last commit is only Pot' });
  assert.equal(route(f).deploy_creator, true);
});

test('zero initial before inspects the full tree including earlier creator commits', t => {
  const f = fixture(t);
  commit(f.repo, { 'src/lib/pokemon/last.ts': 'Pot-only last commit' });
  assert.equal(route(f, { before: zero }).deploy_creator, true);
  const potOnly = fixture(t, { 'src/lib/pokemon/only.ts': 'Pot' });
  assert.equal(route(potOnly, { before: zero }).deploy_creator, false);
});

test('empty range skips; invalid, missing, and non-ancestor boundaries fail closed', t => {
  const f = fixture(t);
  assert.equal(route(f).deploy_creator, false);
  for (const options of [
    { before: '' }, { before: 'main' }, { before: '1'.repeat(40) },
    { after: '' }, { after: zero }, { after: '1'.repeat(40) },
    { before: '--all' }, { after: 'HEAD~1' },
    { ref: 'refs/heads/other' }, { event: 'pull_request' },
  ]) {
    assert.equal(route(f, options, 1).deploy_creator, false, JSON.stringify(options));
  }
  git(f.repo, 'checkout', '--quiet', '--orphan', 'unrelated');
  git(f.repo, 'rm', '-rf', '.');
  const unrelated = commit(f.repo, { 'src/lib/pokemon/new.ts': 'unrelated history' });
  assert.equal(route(f, { before: f.before, after: unrelated }, 1).deploy_creator, false);
});

test('manual dispatch requires exact public creator confirmation and main context', t => {
  const f = fixture(t);
  for (const confirmTarget of ['', 'pot.pivota.cc', 'creator-ui', 'creator.pivota.cc ', 'https://creator.pivota.cc']) {
    assert.equal(route(f, { event: 'workflow_dispatch', confirmTarget }, 1).deploy_creator, false);
  }
  assert.equal(route(f, { event: 'workflow_dispatch', confirmTarget: 'creator.pivota.cc' }).deploy_creator, true);
  assert.equal(route(f, { event: 'workflow_dispatch', confirmTarget: 'creator.pivota.cc', ref: 'refs/heads/other' }, 1).deploy_creator, false);
});

test('workflow gates cloud auth/queue at the deploy job and preserves creator identity and validated SHA', () => {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/deploy-cloud-run.yml'), 'utf8');
  const jobs = workflow.slice(workflow.indexOf('\njobs:\n'));
  const top = workflow.slice(0, workflow.indexOf('\njobs:\n'));
  const routing = jobs.slice(jobs.indexOf('\n  route:\n'), jobs.indexOf('\n  deploy:\n'));
  const deploy = jobs.slice(jobs.indexOf('\n  deploy:\n'));
  assert.doesNotMatch(top, /^concurrency:|^  id-token:/m);
  assert.doesNotMatch(routing, /id-token:|concurrency:|google-github-actions\/auth|gcloud|docker/);
  assert.match(routing, /permissions:\n      contents: read/);
  assert.match(routing, /fetch-depth: 0/);
  assert.match(routing, /persist-credentials: false/);
  assert.match(routing, /scripts\/release-routing\.py/);
  assert.match(routing, /BEFORE: \$\{\{ github\.event\.before \}\}/);
  assert.doesNotMatch(top, /paths-ignore:|\n    paths:/);
  assert.match(deploy, /needs: route\n    if: \$\{\{ needs\.route\.outputs\.deploy_creator == 'true' \}\}/);
  assert.match(deploy, /permissions:\n      contents: read\n      id-token: write/);
  assert.match(deploy, /concurrency:\n      group: deploy-creator-ui\n      cancel-in-progress: false/);
  assert.match(top, /confirm_target:\n        description: 'Type creator\.pivota\.cc[^\n]*\n        required: true/);
  const validation = deploy.indexOf('git merge-base --is-ancestor "$sha" origin/main');
  assert.ok(validation > 0 && validation < deploy.indexOf('google-github-actions/auth@v2'));
  assert.match(deploy, /\^\[0-9a-fA-F\]\{7,40\}\$/);
  assert.match(deploy, /git rev-parse --verify --quiet --end-of-options/);
  assert.match(top, /SERVICE: creator-ui\n  REPO: us-west1-docker\.pkg\.dev\/pivota-prod\/cloud-run-source-deploy\/creator-ui/);
  assert.match(deploy, /workload_identity_provider: projects\/371394967380\/locations\/global\/workloadIdentityPools\/github-actions\/providers\/github-frontends/);
  assert.match(deploy, /service_account: sa-creator-ui-deploy@pivota-prod\.iam\.gserviceaccount\.com/);
  assert.doesNotMatch(workflow, /gcloud run deploy[^\n]*(?:pot-beta|pokemon)/);
});
