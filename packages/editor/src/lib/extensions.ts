/**
 * Loading extensions into a cart. The editor parses and validates the manifest only; the code
 * is stored as text and runs inside the sandboxed stage, never here.
 */
import type { CartExtension } from '@stitch/cart';
import { validateManifest } from '@stitch/ir';

/** Largest extension code accepted, so a cart stays a reasonable size. */
const MAX_CODE = 512 * 1024;

function manifestFrom(text: string, where: string) {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${where} isn't valid JSON`);
  }
  const r = validateManifest(json);
  if (!r.ok) throw new Error(`${where}: ${r.errors.join('; ')}`);
  return r.manifest;
}

function checkCode(code: string): string {
  if (code.length > MAX_CODE) throw new Error(`extension code is over ${MAX_CODE / 1024} KB`);
  return code;
}

/**
 * From picked files: one manifest (`.json`) and its code (`.js`, the manifest's `main` when
 * several are picked).
 */
export function extensionFromFiles(files: { name: string; text: string }[]): CartExtension {
  const jsons = files.filter((f) => f.name.toLowerCase().endsWith('.json'));
  if (jsons.length !== 1) throw new Error('pick one manifest (.json) and its code (.js)');
  const manifest = manifestFrom(jsons[0]!.text, jsons[0]!.name);
  const scripts = files.filter((f) => /\.m?js$/i.test(f.name));
  const main = manifest.main?.split('/').pop();
  const code = scripts.length === 1 ? scripts[0] : scripts.find((f) => f.name === main);
  if (!code)
    throw new Error(`pick the extension's code${main ? ` (${main})` : ''} with the manifest`);
  return { manifest, code: checkCode(code.text) };
}

/** From the URL of a manifest whose `main` names the code, relative to the manifest. */
export async function extensionFromUrl(
  url: string,
  get: (url: string) => Promise<Response> = (u) => fetch(u),
): Promise<CartExtension> {
  const text = async (u: string) => {
    const res = await get(u);
    if (!res.ok) throw new Error(`${u}: HTTP ${res.status}`);
    return res.text();
  };
  const manifest = manifestFrom(await text(url), url);
  if (!manifest.main) throw new Error(`${url}: the manifest needs 'main' (its code file)`);
  const page = typeof location === 'undefined' ? undefined : location.href;
  const codeUrl = new URL(manifest.main, new URL(url, page)).href;
  return { manifest, code: checkCode(await text(codeUrl)) };
}
