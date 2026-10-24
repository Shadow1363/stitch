/** Well-known credential shapes, by provider. */
const KNOWN: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{20,}/, // OpenAI, Anthropic and others
  /\bgh[pousr]_[A-Za-z0-9]{30,}/, // GitHub tokens
  /\bgithub_pat_[A-Za-z0-9_]{30,}/,
  /\bAKIA[0-9A-Z]{16}\b/, // AWS access key id
  /\bxox[abpr]-[A-Za-z0-9-]{10,}/, // Slack
  /\bAIza[0-9A-Za-z_-]{30,}/, // Google
  /\bBearer\s+[A-Za-z0-9._~+/-]{16,}/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

/** Bits per character; random keys sit near log2 of their alphabet, words and ids far below. */
function entropy(s: string): number {
  const counts = new Map<string, number>();
  for (const c of s) counts.set(c, (counts.get(c) ?? 0) + 1);
  let h = 0;
  for (const n of counts.values()) h -= (n / s.length) * Math.log2(n / s.length);
  return h;
}

/**
 * True for text that looks like an API key or token: a known provider shape, or a long random
 * run of letters and digits (also inside a URL query). Used to warn before a key ends up in a cart.
 */
export function looksLikeSecret(text: string): boolean {
  if (KNOWN.some((r) => r.test(text))) return true;
  return text.split(/[\s?&=/:,;"'{}()[\]<>]+/).some(randomToken);
}

/** Long, high-entropy, several digits, and hex or mixed case (snake_case names are neither). */
function randomToken(t: string): boolean {
  if (t.length < 32 || entropy(t) < 3.5) return false;
  if ((t.match(/\d/g)?.length ?? 0) < 2) return false;
  return /^[0-9a-fA-F-]+$/.test(t) || (/[a-z]/.test(t) && /[A-Z]/.test(t));
}
