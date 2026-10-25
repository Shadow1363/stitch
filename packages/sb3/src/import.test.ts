import { describe, expect, it } from 'vitest';
import type { Cart } from '@stitch/cart';
import { encodeWav } from '@stitch/cart/audio';
import { compile } from '@stitch/compiler';
import { validateProject } from '@stitch/ir';
import { parse, printModule } from '@stitch/lang';
import { NullAsk, NullRenderer, World, type Program } from '@stitch/runtime';
import { strToU8 } from 'fflate';
import { importSb3, isZip } from './index';
import { arg, b, callProc, lf, menu, msg, proc, sb3, stage, target, v, vf } from './testing';

/** Compiles an imported cart and runs it on World, as the parity tests do. */
function run(cart: Cart, ticks: number) {
  const r = compile(
    cart.project,
    cart.sprites.map((s) => s.id),
  );
  if (!r.ok) throw new Error(JSON.stringify(r.diagnostics, null, 1));
  const errors: string[] = [];
  const world = new World({
    stage: cart.stage,
    sprites: cart.sprites,
    backdrops: cart.backdrops,
    backdrop: cart.backdrop,
    costumes: {},
    sounds: Object.entries(cart.sounds).map(([id, s]) => ({ id, name: s.name, seconds: 0.1 })),
    songs: [],
    ask: new NullAsk(),
    seed: 1,
    onError: (e) => errors.push(`${e.sprite} ${e.event}: ${String(e.error)}`),
  });
  world.load(new Function('rt', r.code) as Program);
  world.start();
  const renderer = new NullRenderer();
  for (let i = 0; i < ticks; i++) {
    world.tick();
    renderer.render(world);
  }
  return { world, errors, G: world.globals as Record<string, unknown> };
}

/** Each file's text, keyed by sprite name (`stage` for the stage). */
function texts(cart: Cart): Record<string, string> {
  return Object.fromEntries([
    ['stage', printModule(cart.project.stage)],
    ...cart.project.sprites.map((s) => [s.name, printModule(s.module)]),
  ]);
}

const flag = b('event_whenflagclicked');

describe('importSb3', () => {
  it('runs variables, lists, loops, custom blocks, broadcasts and clones as Scratch would', async () => {
    const file = sb3([
      stage({ variables: { score: 0, copies: 0 }, lists: { items: ['a'] } }),
      target({
        name: 'Cat',
        scripts: [
          {
            hat: flag,
            body: [
              b('data_setvariableto', { VALUE: '5' }, { VARIABLE: vf('score') }),
              b('data_changevariableby', { VALUE: 2 }, { VARIABLE: vf('score') }),
              b('data_addtolist', { ITEM: 'b' }, { LIST: lf('items') }),
              {
                ...b('control_repeat', { TIMES: 3 }),
                sub: [b('data_changevariableby', { VALUE: 1 }, { VARIABLE: vf('score') })],
              },
              {
                ...b('control_if_else', {
                  CONDITION: b('operator_gt', { OPERAND1: v('score'), OPERAND2: 9 }),
                }),
                sub: [b('looks_say', { MESSAGE: 'big' })],
                sub2: [b('looks_say', { MESSAGE: 'small' })],
              },
              b('event_broadcastandwait', { BROADCAST_INPUT: msg('go') }),
              callProc('add %s twice', { n: 3 }),
              b('control_create_clone_of', {
                CLONE_OPTION: menu('control_create_clone_of_menu', 'CLONE_OPTION', '_myself_'),
              }),
            ],
          },
          {
            hat: b('event_whenbroadcastreceived', undefined, { BROADCAST_OPTION: ['go', 'm:go'] }),
            body: [b('data_changevariableby', { VALUE: 100 }, { VARIABLE: vf('score') })],
          },
          proc(
            'add %s twice',
            ['n'],
            [
              b('data_changevariableby', { VALUE: arg('n') }, { VARIABLE: vf('score') }),
              b('data_changevariableby', { VALUE: arg('n') }, { VARIABLE: vf('score') }),
            ],
            true,
          ),
          {
            hat: b('control_start_as_clone'),
            body: [
              b('data_changevariableby', { VALUE: 1 }, { VARIABLE: vf('copies') }),
              b('control_delete_this_clone'),
            ],
          },
        ],
      }),
    ]);
    expect(isZip(file)).toBe(true);
    const { cart, report } = await importSb3(file, { title: 'Test' });
    expect(report.unsupported).toEqual({});
    expect(report.notes).toEqual([]);
    expect(validateProject(cart.project).filter((d) => d.severity === 'error')).toEqual([]);
    const { G, errors, world } = run(cart, 30);
    expect(errors).toEqual([]);
    expect(G.score).toBe(116);
    expect(G.items).toEqual(['a', 'b']);
    expect(G.copies).toBe(1);
    expect(world.all.find((s) => s.name === 'Cat')!.sayText).toBe('big');
    expect(texts(cart).Cat).toContain('warp function add_twice(n)');
  });

  it('writes canonical text that reads back the same', async () => {
    const file = sb3([
      stage({ variables: { 'high score': 10 } }),
      target({
        name: 'Ball',
        variables: { speed: '1.50' },
        scripts: [
          {
            hat: b('event_whenkeypressed', undefined, { KEY_OPTION: ['left arrow'] }),
            body: [
              b('motion_changexby', { DX: -10 }),
              {
                ...b('control_if_else', {
                  CONDITION: b('sensing_touchingobject', {
                    TOUCHINGOBJECTMENU: menu(
                      'sensing_touchingobjectmenu',
                      'TOUCHINGOBJECTMENU',
                      '_edge_',
                    ),
                  }),
                }),
                sub: [b('looks_say', { MESSAGE: 'edge' })],
                sub2: [
                  {
                    ...b('control_if', {
                      CONDITION: b('operator_lt', { OPERAND1: b('motion_xposition'), OPERAND2: 0 }),
                    }),
                    sub: [b('looks_say', { MESSAGE: 'left' })],
                  },
                ],
              },
            ],
          },
        ],
      }),
    ]);
    const { cart } = await importSb3(file);
    for (const text of Object.values(texts(cart)))
      expect(printModule(parse(text).module)).toBe(text);
    const ball = texts(cart).Ball!;
    expect(ball).toContain('var speed = "1.50"');
    expect(ball).toContain('on key "left" do');
    expect(ball).toContain('x += -10');
    expect(ball).toContain('elseif x < 0 then');
    expect(texts(cart).stage).toContain('global var high_score = 10');
  });

  it('spells names as identifiers and avoids keywords, builtins, sprite properties and globals', async () => {
    const file = sb3([
      stage({ variables: { lives: 3 } }),
      target({
        name: 'Hero',
        variables: { 'my score!': 0, move: 0, x: 0, lives: 0, end: 0, '2fast': 0 },
        lists: { 'my score!': [] },
        scripts: [
          { hat: flag, body: [b('data_setvariableto', { VALUE: 1 }, { VARIABLE: vf('x') })] },
        ],
      }),
    ]);
    const { cart, report } = await importSb3(file);
    const text = texts(cart).Hero!;
    for (const decl of [
      'var my_score = 0',
      'var move_2 = 0',
      'var x_2 = 0',
      'var lives_2 = 0',
      'var end_2 = 0',
      'var _2fast = 0',
      'var my_score_2 = []',
    ])
      expect(text).toContain(decl);
    expect(text).toContain('x_2 = 1');
    expect(report.renamed).toContainEqual({
      kind: 'variable',
      from: 'x',
      to: 'x_2',
      target: 'Hero',
    });
    expect(validateProject(cart.project).filter((d) => d.severity === 'error')).toEqual([]);
  });

  it("reads another sprite's variable through var_of with its new name", async () => {
    const file = sb3([
      stage(),
      target({ name: 'A', variables: { 'hit points': 7 } }),
      target({
        name: 'B',
        scripts: [
          {
            hat: flag,
            body: [
              b('looks_say', {
                MESSAGE: b(
                  'sensing_of',
                  { OBJECT: menu('sensing_of_object_menu', 'OBJECT', 'A') },
                  { PROPERTY: ['hit points'] },
                ),
              }),
            ],
          },
        ],
      }),
    ]);
    const { cart } = await importSb3(file);
    expect(texts(cart).B).toContain('say(var_of("A", "hit_points"))');
    expect(run(cart, 3).world.all.find((s) => s.name === 'B')!.sayText).toBe('7');
  });

  it('turns unsupported blocks into comments and counts them', async () => {
    const file = sb3([
      stage(),
      target({
        name: 'Band',
        scripts: [
          {
            hat: flag,
            body: [
              b('music_playDrumForBeats', { BEATS: 0.25 }),
              b('looks_say', { MESSAGE: b('translate_getTranslate', { WORDS: 'hi' }) }),
              b('motion_movesteps', { STEPS: 10 }),
              b('videoSensing_videoToggle'),
            ],
          },
          { hat: b('event_whenstageclicked'), body: [b('looks_show')] },
        ],
      }),
    ]);
    const { cart, report } = await importSb3(file);
    expect(report.unsupported).toEqual({
      music_playDrumForBeats: 1,
      translate_getTranslate: 1,
      videoSensing_videoToggle: 1,
      event_whenstageclicked: 1,
    });
    expect(texts(cart).Band).toBe(
      [
        'on start do',
        '  -- sb3: music_playDrumForBeats',
        '  -- sb3: translate_getTranslate (reads as "")',
        '  say("")',
        '  move(10)',
        '  -- sb3: videoSensing_videoToggle',
        'end',
        '',
        '-- sb3: event_whenstageclicked has no Stitch event, so nothing runs this',
        'function whenstageclicked()',
        '  show()',
        'end',
        '',
      ].join('\n'),
    );
  });

  it('keeps Scratch comments, monitors, drag mode and rotation style', async () => {
    const t = target({
      name: 'Pet',
      variables: { mood: 'happy' },
      scripts: [{ hat: flag, body: [b('looks_show')] }],
      extra: { draggable: true, rotationStyle: 'left-right' },
    });
    const hatId = Object.keys(t.blocks!).find(
      (id) => (t.blocks![id] as { opcode: string }).opcode === 'event_whenflagclicked',
    )!;
    t.comments = {
      c1: { blockId: hatId, text: 'starts here\nsecond line' },
      c2: { blockId: null, text: 'about this sprite' },
    };
    const file = sb3([stage(), t], {}, [
      {
        id: 'v:mood',
        opcode: 'data_variable',
        params: { VARIABLE: 'mood' },
        spriteName: 'Pet',
        visible: true,
      },
    ]);
    const text = texts((await importSb3(file)).cart).Pet!;
    expect(text).toContain('-- about this sprite\nvar mood = "happy"');
    expect(text).toContain(
      'on start do\n  set_drag_mode(true)\n  rotation_style("left-right")\nend',
    );
    expect(text).toContain('-- starts here\n-- second line\non start do\n  show()');
    expect(text).toContain('forever do\n    watch("mood", mood)');
  });

  it('maps menus to Stitch words', async () => {
    const file = sb3([
      stage(),
      target({
        name: 'M',
        lists: { l: [1, 2, 3] },
        scripts: [
          {
            hat: flag,
            body: [
              b('motion_goto', { TO: menu('motion_goto_menu', 'TO', '_random_') }),
              b('motion_glideto', { SECS: 1, TO: menu('motion_glideto_menu', 'TO', '_mouse_') }),
              b('motion_pointtowards', {
                TOWARDS: menu('motion_pointtowards_menu', 'TOWARDS', 'Other'),
              }),
              b('looks_switchcostumeto', { COSTUME: menu('looks_costume', 'COSTUME', '2') }),
              b('looks_changeeffectby', { CHANGE: 25 }, { EFFECT: ['GHOST'] }),
              b('looks_goforwardbackwardlayers', { NUM: 2 }, { FORWARD_BACKWARD: ['backward'] }),
              b('data_deleteoflist', { INDEX: 'last' }, { LIST: lf('l') }),
              b('data_deleteoflist', { INDEX: 'all' }, { LIST: lf('l') }),
              b('data_insertatlist', { ITEM: 'x', INDEX: 'random' }, { LIST: lf('l') }),
              b('looks_say', {
                MESSAGE: b('sensing_distanceto', {
                  DISTANCETOMENU: menu('sensing_distancetomenu', 'DISTANCETOMENU', '_mouse_'),
                }),
              }),
              b('looks_say', {
                MESSAGE: b('sensing_current', undefined, { CURRENTMENU: ['DAYOFWEEK'] }),
              }),
              b('looks_say', { MESSAGE: b('operator_mathop', { NUM: 1 }, { OPERATOR: ['10 ^'] }) }),
              b('control_stop', undefined, { STOP_OPTION: ['other scripts in sprite'] }),
              b('control_stop', undefined, { STOP_OPTION: ['this script'] }),
            ],
          },
        ],
      }),
    ]);
    const text = texts((await importSb3(file)).cart).M!;
    for (const line of [
      'goto_random()',
      'glide_to(1, "mouse")',
      'point_towards_sprite("Other")',
      'costume("2")',
      'change_effect("ghost", 25)',
      'change_layer(-2)',
      'remove(l, len(l))',
      'clear(l)',
      'insert(l, random(1, len(l) + 1), "x")',
      'say(distance_to(mouse_x(), mouse_y()))',
      'say(current("day of week"))',
      'say(pow10(1))',
      'stop_other_scripts()',
      'stop()',
    ])
      expect(text).toContain(line);
  });

  it('returns from a custom block on "stop this script"', async () => {
    const file = sb3([
      stage(),
      target({
        name: 'P',
        scripts: [
          proc(
            'check %b',
            ['ok'],
            [
              {
                ...b('control_if', { CONDITION: arg('ok', true) }),
                sub: [b('control_stop', undefined, { STOP_OPTION: ['this script'] })],
              },
            ],
          ),
        ],
      }),
    ]);
    expect(texts((await importSb3(file)).cart).P).toContain(
      'function check(ok)\n  if ok then\n    return\n  end\nend',
    );
  });

  it('imports costumes, backdrops and both kinds of WAV sound into one bank', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>';
    const tone = encodeWav(Float32Array.of(0, 0.5, -0.5, 0), 22050);
    const other = encodeWav(Float32Array.of(0.25, 0.25), 11025);
    const file = sb3(
      [
        stage({
          costumes: [
            {
              name: 'backdrop1',
              md5ext: 'bd.svg',
              dataFormat: 'svg',
              rotationCenterX: 240,
              rotationCenterY: 180,
            },
          ],
        }),
        target({
          name: 'A',
          costumes: [
            {
              name: 'a1',
              md5ext: 'a.svg',
              dataFormat: 'svg',
              rotationCenterX: 5,
              rotationCenterY: 5,
            },
            {
              name: 'a2',
              md5ext: 'a.png',
              dataFormat: 'png',
              bitmapResolution: 2,
              rotationCenterX: 20,
              rotationCenterY: 10,
            },
          ],
          sounds: [{ name: 'Meow', md5ext: 'meow.wav', dataFormat: 'wav' }],
        }),
        target({
          name: 'B',
          sounds: [
            { name: 'Meow', md5ext: 'meow.wav', dataFormat: 'wav' },
            { name: 'Meow', md5ext: 'other.wav', dataFormat: 'wav' },
            { name: 'Pop', md5ext: 'pop.mp3', dataFormat: 'mp3' },
          ],
          scripts: [
            {
              hat: flag,
              body: [
                b('sound_play', { SOUND_MENU: menu('sound_sounds_menu', 'SOUND_MENU', 'Meow') }),
              ],
            },
          ],
        }),
      ],
      {
        'bd.svg': strToU8(svg),
        'a.svg': strToU8(svg),
        'a.png': new Uint8Array([1, 2, 3]),
        'meow.wav': tone,
        'other.wav': other,
      },
    );
    const scaled: number[] = [];
    const { cart, report } = await importSb3(file, {
      scaleBitmap: async (bytes, _mime, factor) => (scaled.push(factor), bytes),
    });
    expect(scaled).toEqual([0.5]);
    expect(cart.backdrops).toEqual(['stage-c1']);
    expect(cart.assets['stage-c1']).toMatchObject({ kind: 'svg', center: [240, 180] });
    expect(cart.assets['sprite1-c2']).toMatchObject({
      kind: 'png',
      center: [10, 5],
      data: 'data:image/png;base64,AQID',
    });
    expect(cart.sprites[0]!.costumes).toEqual(['sprite1-c1', 'sprite1-c2']);
    // A's Meow and B's identical Meow are one sound; B's different Meow is numbered.
    expect(
      Object.values(cart.sounds).map((s) => [s.name, s.kind, s.kind === 'sample' && s.rate]),
    ).toEqual([
      ['Meow', 'sample', 22050],
      ['Meow2', 'sample', 11025],
    ]);
    expect(texts(cart).B).toContain('play_sound("Meow2")');
    expect(report.notes).toEqual(['B: sound "Pop" is missing from the file']);
  });

  it('notes bitmaps it could not scale', async () => {
    const file = sb3(
      [
        stage(),
        target({
          name: 'A',
          costumes: [
            {
              name: 'big',
              md5ext: 'a.png',
              dataFormat: 'png',
              bitmapResolution: 2,
              rotationCenterX: 20,
              rotationCenterY: 10,
            },
          ],
        }),
      ],
      { 'a.png': new Uint8Array([1]) },
    );
    const { cart, report } = await importSb3(file);
    expect(cart.assets['sprite1-c1']).toMatchObject({ center: [20, 10] });
    expect(report.notes).toEqual(['A: costume "big" kept at 2× size']);
  });

  it('rejects files that are not Scratch 3 projects', async () => {
    await expect(importSb3(new Uint8Array([1, 2, 3]))).rejects.toThrow(/not a zip/);
    await expect(importSb3(sb3([]).slice(0, 0))).rejects.toThrow(/not a Scratch project/);
    const { zipSync } = await import('fflate');
    const sb2 = zipSync({
      'project.json': strToU8(JSON.stringify({ objName: 'Stage', children: [] })),
    });
    await expect(importSb3(sb2)).rejects.toThrow(/Scratch 2/);
  });
});
