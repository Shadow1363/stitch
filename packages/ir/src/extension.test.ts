import { describe, expect, it } from 'vitest';
import { CORE_CATALOG, createCatalog } from './catalog';
import { validateManifest, type ExtensionManifest } from './extension';

const manifest = (over: Record<string, unknown> = {}) => ({
  id: 'text',
  name: 'Text tools',
  version: '1.0.0',
  color: '#2E8B57',
  blocks: [
    {
      name: 'text_upper',
      kind: 'reporter',
      label: 'uppercase %1',
      params: [{ name: 's', type: 'string', default: 'hello' }],
      returns: 'string',
    },
    {
      name: 'text_join3',
      kind: 'reporter',
      label: 'join %2 between %1 and %3',
      params: [{ name: 'a' }, { name: 'sep' }, { name: 'b' }],
    },
    { name: 'text_pause', kind: 'command', label: 'pause', params: [], waits: true },
  ],
  ...over,
});

const valid = (over: Record<string, unknown> = {}): ExtensionManifest => {
  const r = validateManifest(manifest(over));
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.manifest;
};

describe('validateManifest', () => {
  it('accepts a good manifest and normalizes it', () => {
    const m = valid({ extra: 'dropped' });
    expect(m.color).toBe('#2e8b57');
    expect(m).not.toHaveProperty('extra');
    expect(m.blocks[1]!.params.map((p) => p.type)).toEqual(['any', 'any', 'any']);
    expect(m.blocks[1]!.returns).toBe('any');
    expect(m.blocks[2]).toEqual({
      name: 'text_pause',
      kind: 'command',
      label: 'pause',
      params: [],
      waits: true,
    });
  });

  const rejects = (over: Record<string, unknown>, message: RegExp) => {
    const r = validateManifest(manifest(over));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join('\n')).toMatch(message);
  };

  it('rejects bad envelopes', () => {
    expect(validateManifest([]).ok).toBe(false);
    rejects({ id: 'Text_1' }, /'id'/);
    rejects({ color: 'green' }, /'color'/);
    rejects({ version: '' }, /'version'/);
    rejects({ blocks: [] }, /'blocks'/);
  });

  it('rejects bad blocks', () => {
    const one = (b: Record<string, unknown>) => ({
      blocks: [{ name: 'text_x', kind: 'command', label: 'x', params: [], ...b }],
    });
    rejects(one({ name: 'upper' }), /must start with 'text_'/);
    rejects(one({ name: 'text-x' }), /identifier/);
    rejects(one({ kind: 'hat' }), /'kind'/);
    rejects(one({ label: 'x %1' }), /'label' must use/);
    rejects(one({ params: [{ name: 'a' }], label: 'x' }), /'label' must use each of %1/);
    rejects(one({ params: [{ name: 'a', type: 'map' }], label: '%1' }), /unknown type/);
    rejects(one({ returns: 'number' }), /reporters only/);
    rejects(one({ waits: 'yes' }), /'waits'/);
    rejects(
      { blocks: [manifest().blocks[0], manifest().blocks[0]] },
      /'text_upper' is defined twice/,
    );
  });

  it('rejects core builtin names', () => {
    rejects(
      { id: 'play', blocks: [{ name: 'play_sound', kind: 'command', label: 'x', params: [] }] },
      /'play_sound' is a core builtin/,
    );
  });
});

describe('createCatalog', () => {
  it('is the core catalog without extensions', () => {
    expect(createCatalog([])).toBe(CORE_CATALOG);
  });

  it('appends extension entries after the core ones', () => {
    const c = createCatalog([valid()]);
    expect(c.all.slice(0, CORE_CATALOG.all.length)).toEqual(CORE_CATALOG.all);
    const upper = c.get('text_upper')!;
    expect(upper).toMatchObject({
      kind: 'reporter',
      category: 'extension',
      returns: 'string',
      sprite: true,
      ext: { id: 'text', label: 'uppercase %1', color: '#2e8b57', defaults: ['hello'] },
    });
    expect(c.get('text_pause')!.yields).toBe(true);
    expect(c.get('move')).toBe(CORE_CATALOG.get('move'));
  });

  it('keeps the first owner of a name', () => {
    const a = valid();
    const b = valid({ name: 'Other' });
    const c = createCatalog([a, b]);
    expect(c.all.filter((x) => x.name === 'text_upper')).toHaveLength(1);
    expect(c.get('text_upper')!.ext!.name).toBe('Text tools');
  });
});
