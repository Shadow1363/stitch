import { describe, expect, it } from 'vitest';
import { normalizeCart } from '@stitch/cart';
import { toBlocks } from '@stitch/blocks';
import { loadSample } from './project';
import { Session, STAGE_FILE } from './session';

describe('Session', () => {
  it('round-trips through a cart, keeping node ids, block layout and loose blocks', () => {
    const s = Session.empty();
    const doc = s.docs[1]!;
    doc.setText('var n = 1\non start do\n  move(10)\nend\n');
    const ev = doc.module.items[1]!;
    doc.layout = { [ev.id]: { x: 40, y: 80 } };
    doc.loose = [{ type: 'stitch_b_turn', id: 'L', x: 300, y: 0 }];
    const cart = normalizeCart(JSON.parse(JSON.stringify(s.toCart())));
    const back = Session.fromCart(cart);
    const d2 = back.doc(doc.id)!;
    expect(d2.text).toBe(doc.text);
    expect(d2.module.items[1]!.id).toBe(ev.id);
    expect(toBlocks(d2.module, d2.layout)[1]).toMatchObject({ id: ev.id, x: 40, y: 80 });
    expect(d2.loose).toEqual(doc.loose);
    expect(back.toCart().assets).toEqual(s.toCart().assets);
  });

  it('round-trips sounds and music, and the sample cart has both', () => {
    const s = loadSample();
    expect(Object.values(s.sounds).map((x) => x.name)).toEqual(['bounce', 'stop']);
    expect(Object.values(s.music.songs).map((x) => x.name)).toEqual(['theme']);
    const back = Session.fromCart(normalizeCart(JSON.parse(JSON.stringify(s.toCart()))));
    expect(back.sounds).toEqual(s.sounds);
    expect(back.music).toEqual(s.music);
  });

  it('adds, renames and removes sprites with their files and unused assets', () => {
    const s = Session.empty();
    const a = s.addSprite();
    expect(s.sprites.map((x) => x.name)).toEqual(['Sprite1', 'Sprite2']);
    expect(s.doc(a.id)?.name).toBe('Sprite2');
    s.renameSprite(a.id, 'Hero');
    expect(s.toCart().project.sprites[1]!.name).toBe('Hero');
    const costume = a.costumes[0]!;
    s.removeSprite(a.id);
    expect(s.doc(a.id)).toBeUndefined();
    expect(s.assets[costume]).toBeUndefined();
    expect(s.doc(STAGE_FILE)).toBeDefined();
  });

  it('keeps assets still used by the map', () => {
    const s = Session.empty();
    const sp = s.sprites[0]!;
    const c = sp.costumes[0]!;
    s.map = { tileset: c, tileSize: 8, width: 1, height: 1, tiles: 'AAA=' };
    s.removeSprite(sp.id);
    expect(s.assets[c]).toBeDefined();
  });
});
