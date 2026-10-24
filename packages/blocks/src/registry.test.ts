import { CORE_CATALOG, createCatalog, SPRITE_PROPS, validateManifest } from '@stitch/ir';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe as group, expect, it } from 'vitest';
import { parseExample } from './docs';
import {
  builtinVariableNames,
  describe,
  docEntry,
  keywordEntry,
  SECTIONS,
  SNIPPETS,
  summaryOf,
} from './registry';

const root = resolve(import.meta.dirname, '../../..');

/** A snippet with each tab stop replaced by its placeholder text. */
const fill = (snippet: string) =>
  snippet.replace(/\$\{([^}]*)\}/g, (_, t: string) => t).replace(/\t/g, '  ');

group('docs registry', () => {
  it('documents every core builtin', () => {
    expect(CORE_CATALOG.all.filter((b) => !docEntry(b.name)).map((b) => b.name)).toEqual([]);
  });

  it('documents every sprite property as a per-clone built-in variable', () => {
    for (const p of Object.keys(SPRITE_PROPS)) expect(docEntry(p)?.scope, p).toBe('clone');
  });

  it('gives every reporter without parameters a scope (except constructors)', () => {
    const missing = CORE_CATALOG.all
      .filter((b) => b.kind === 'reporter' && !b.params.length && b.name !== 'dict')
      .filter((b) => !docEntry(b.name)?.scope)
      .map((b) => b.name);
    expect(missing).toEqual([]);
    expect(builtinVariableNames()).toContain('timer');
  });

  it('documents every keyword (do and end are punctuation)', () => {
    const grammar = readFileSync(join(root, 'packages/lang/src/stitch.grammar'), 'utf8');
    const keywords = new Set([...grammar.matchAll(/c?kw<"(\w+)">/g)].map((m) => m[1]!));
    const missing = [...keywords].filter((k) => k !== 'do' && k !== 'end' && !keywordEntry(k));
    expect(missing).toEqual([]);
  });

  it('has unique ids, titles for everything that is not a builtin, and one-line summaries', () => {
    const ids = SECTIONS.flatMap((s) => s.entries.map((e) => e.id));
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
    for (const s of SECTIONS)
      for (const e of s.entries) {
        if (!CORE_CATALOG.get(e.id)) expect(e.title, e.id).toBeTruthy();
        if (e.id !== 'raw') expect(summaryOf(e.doc).length, e.id).toBeGreaterThan(3);
      }
  });

  it('has snippets that parse once filled in', () => {
    expect(SNIPPETS.length).toBeGreaterThan(15);
    // Snippets are inserted where they fit, so "outside a loop/function" doesn't apply.
    const bad = SNIPPETS.flatMap((e) =>
      parseExample(fill(e.snippet!))
        .problems.filter((p) => !/outside a (loop|function)/.test(p))
        .map((p) => `${e.id}: ${p}`),
    );
    expect(bad).toEqual([]);
  });
});

group('summaryOf', () => {
  it('takes the first sentence and ignores full stops in code', () => {
    expect(summaryOf('Waits `round(s × 60.5)` ticks. Then more.')).toBe(
      'Waits `round(s × 60.5)` ticks.',
    );
    expect(summaryOf('No full stop')).toBe('No full stop');
  });
});

group('describe', () => {
  it('describes a builtin with its signature, block text and docs', () => {
    const d = describe('goto')!;
    expect(d.signature).toBe('goto(x, y)');
    expect(d.blockText).toBe('go to x: (x) y: (y)');
    expect(d.kind).toBe('command');
    expect(d.anchor).toBe('gotox-y--command');
    expect(d.colour).toMatch(/^#/);
  });

  it('describes built-in variables with scope and access', () => {
    expect(describe('x')).toMatchObject({ kind: 'property', scope: 'clone', writable: true });
    expect(describe('costume_number')).toMatchObject({ writable: false });
    expect(describe('timer')).toMatchObject({
      scope: 'global',
      writable: false,
      returns: 'number',
    });
  });

  it('describes keywords through their construct', () => {
    expect(describe('forever')?.kind).toBe('construct');
    expect(describe('elseif')?.signature).toBe('if … then … elseif … else … end');
  });

  it('describes extension blocks from their manifest', () => {
    const r = validateManifest({
      id: 'demo',
      name: 'Demo',
      version: '1',
      color: '#123456',
      blocks: [
        {
          name: 'demo_twice',
          kind: 'reporter',
          label: 'twice %1',
          description: 'Doubles a number.',
          params: [{ name: 'n', type: 'number' }],
        },
      ],
    });
    if (!r.ok) throw new Error(r.errors.join());
    const d = describe('demo_twice', createCatalog([r.manifest]))!;
    expect(d).toMatchObject({
      summary: 'Doubles a number.',
      blockText: 'twice (n)',
      colour: '#123456',
      extension: 'Demo',
    });
  });

  it('knows nothing about other names', () => {
    expect(describe('score')).toBeUndefined();
  });
});
