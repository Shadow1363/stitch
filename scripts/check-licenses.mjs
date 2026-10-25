// License gate. Shipped (production) dependencies must use an allowlisted license.
// Dev-only tools outside the allowlist must be named in DEV_EXCEPTIONS with a reason.
// Ask before adding any exception, and never add GPL/AGPL without explicit approval.
import { execSync } from 'node:child_process';

const ALLOW = new Set(['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', '0BSD']);

/**
 * Font files (no code) may be SIL OFL-1.1, approved by the owner for Phase 7. Only these
 * packages, which ship nothing but CSS and font files, may use it.
 */
const FONT_LICENSES = new Set(['OFL-1.1']);
const FONT_PACKAGES = new Set(['@fontsource/inter', '@fontsource/jetbrains-mono']);

/** Build/lint tools that never end up in the editor, runtime or exports. */
const DEV_EXCEPTIONS = {
  lightningcss: 'MPL-2.0; Vite 8 CSS tooling, build-time only (pending owner approval)',
  'lightningcss-darwin-arm64': 'MPL-2.0; native binary of lightningcss (pending owner approval)',
  minimatch: 'BlueOak-1.0.0 (permissive); used by eslint (pending owner approval)',
  argparse: 'Python-2.0 (permissive); typedoc → markdown-it, API docs only (pending owner approval)',
  elkjs:
    'EPL-2.0; Mermaid layout engine, used only by `pnpm docs:diagrams` (pending owner approval)',
  'robust-predicates':
    'Unlicense (public domain); Mermaid geometry, docs:diagrams only (pending owner approval)',
  khroma:
    'MIT (its package.json has no license field); Mermaid colours, docs:diagrams only (pending owner approval)',
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
    for (const p of pkgs)
      if (!(FONT_LICENSES.has(license) && FONT_PACKAGES.has(p.name)))
        failures.push(`shipped: ${p.name}@${p.versions?.join(',')} — ${license}`);
for (const [license, pkgs] of Object.entries(list(false)))
  if (!allowed(license))
    for (const p of pkgs)
      if (!(p.name in DEV_EXCEPTIONS) && !(FONT_LICENSES.has(license) && FONT_PACKAGES.has(p.name)))
        failures.push(`dev: ${p.name}@${p.versions?.join(',')} — ${license}`);

if (failures.length) {
  console.error('Disallowed licenses:\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log(
  `Licenses OK. Fonts (${[...FONT_LICENSES].join(', ')}): ${[...FONT_PACKAGES].join(', ')}.\nDev-only exceptions:\n  ` +
    Object.entries(DEV_EXCEPTIONS)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n  '),
);
