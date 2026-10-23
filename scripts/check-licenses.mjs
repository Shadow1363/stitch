// License gate. Shipped (production) dependencies must use an allowlisted license.
// Dev-only tools outside the allowlist must be named in DEV_EXCEPTIONS with a reason.
// Ask before adding any exception, and never add GPL/AGPL without explicit approval.
import { execSync } from 'node:child_process';

const ALLOW = new Set(['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', '0BSD']);

/** Build/lint tools that never end up in the editor, runtime or exports. */
const DEV_EXCEPTIONS = {
  lightningcss: 'MPL-2.0; Vite 8 CSS tooling, build-time only (pending owner approval)',
  'lightningcss-darwin-arm64': 'MPL-2.0; native binary of lightningcss (pending owner approval)',
  minimatch: 'BlueOak-1.0.0 (permissive); used by eslint (pending owner approval)',
};

const list = (prod) =>
  JSON.parse(
    execSync(`pnpm licenses list --json --recursive${prod ? ' --prod' : ''}`, {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    }),
  );
const allowed = (license) => license.split(/\s+OR\s+|[()]/).some((l) => ALLOW.has(l.trim()));

const failures = [];
for (const [license, pkgs] of Object.entries(list(true)))
  if (!allowed(license))
    for (const p of pkgs) failures.push(`shipped: ${p.name}@${p.versions?.join(',')} — ${license}`);
for (const [license, pkgs] of Object.entries(list(false)))
  if (!allowed(license))
    for (const p of pkgs)
      if (!(p.name in DEV_EXCEPTIONS))
        failures.push(`dev: ${p.name}@${p.versions?.join(',')} — ${license}`);

if (failures.length) {
  console.error('Disallowed licenses:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log(
  'Licenses OK. Dev-only exceptions:\n  ' +
    Object.entries(DEV_EXCEPTIONS)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n  '),
);
