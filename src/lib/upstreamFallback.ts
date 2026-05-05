// Helper to surface "we silently fell back to a hardcoded production URL"
// in deploy logs. The hardcoded URLs in the api/* proxy routes are there
// for safety so a misconfigured deploy still works against production, but
// that's also exactly when we want a loud signal — otherwise a staging or
// preview build can quietly route every request through the prod backend
// without anyone noticing.
//
// Use at module-init in a route file:
//
//   if (!process.env.MY_UPSTREAM_BASE) {
//     warnIfHardcodedFallbackUsed({
//       routeLabel: 'api/foo',
//       envVarsTried: ['MY_UPSTREAM_BASE', 'NEXT_PUBLIC_MY_UPSTREAM_BASE'],
//       fallback: DEFAULT_FOO_BASE,
//     });
//   }
//
// The warning logs once per (worker process, routeLabel) pair so cold
// starts get a single line in Vercel logs and request handlers don't
// flood stderr.

const _warned = new Set<string>();

export function warnIfHardcodedFallbackUsed(opts: {
  routeLabel: string;
  envVarsTried: string[];
  fallback: string;
}): void {
  if (_warned.has(opts.routeLabel)) return;
  _warned.add(opts.routeLabel);
  // eslint-disable-next-line no-console
  console.error(
    `[${opts.routeLabel}] No upstream env var set (tried: ${opts.envVarsTried.join(', ')}); ` +
      `falling back to hardcoded ${opts.fallback}. ` +
      'Configure the env var in this deploy to avoid silently routing to production.',
  );
}
