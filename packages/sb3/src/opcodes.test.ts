import { describe, expect, it } from 'vitest';
import { compile } from '@stitch/compiler';
import { validateProject } from '@stitch/ir';
import { importSb3 } from './index';
import { HANDLED } from './scripts';
import {
  arg,
  b,
  callProc,
  lf,
  menu,
  msg,
  proc,
  sb3,
  stage,
  target,
  v,
  vf,
  type B,
} from './testing';

/** Scratch 3's core blocks and the Pen extension, as scratch-vm names them. */
const SCRATCH = {
  motion:
    'movesteps turnright turnleft goto gotoxy glideto glidesecstoxy pointindirection pointtowards changexby setx changeyby sety ifonedgebounce setrotationstyle xposition yposition direction scroll_right scroll_up align_scene xscroll yscroll',
  looks:
    'sayforsecs say thinkforsecs think switchcostumeto nextcostume switchbackdropto switchbackdroptoandwait nextbackdrop changesizeby setsizeto changeeffectby seteffectto cleargraphiceffects show hide gotofrontback goforwardbackwardlayers costumenumbername backdropnumbername size hideallsprites changestretchby setstretchto',
  sound:
    'play playuntildone stopallsounds changeeffectby seteffectto cleareffects changevolumeby setvolumeto volume',
  event:
    'whenflagclicked whenkeypressed whenthisspriteclicked whenstageclicked whenbackdropswitchesto whengreaterthan whenbroadcastreceived broadcast broadcastandwait whentouchingobject',
  control:
    'wait repeat forever if if_else wait_until repeat_until while for_each stop start_as_clone create_clone_of delete_this_clone get_counter incr_counter clear_counter all_at_once',
  sensing:
    'touchingobject touchingcolor coloristouchingcolor distanceto askandwait answer keypressed mousedown mousex mousey setdragmode loudness loud timer resettimer of current dayssince2000 username userid',
  operator:
    'add subtract multiply divide random gt lt equals and or not join letter_of length contains mod round mathop',
  data: 'variable setvariableto changevariableby showvariable hidevariable listcontents addtolist deleteoflist deletealloflist insertatlist replaceitemoflist itemoflist itemnumoflist lengthoflist listcontainsitem showlist hidelist',
  procedures: 'definition call prototype',
  argument: 'reporter_string_number reporter_boolean',
  pen: 'clear stamp penDown penUp setPenColorToColor changePenColorParamBy setPenColorParamTo changePenSizeBy setPenSizeTo setPenShadeToNumber changePenShadeBy setPenHueToNumber changePenHueBy',
};

/** Left out on purpose, each with why (also in docs/import-scratch.md). */
const UNSUPPORTED: Record<string, string> = {
  motion_scroll_right: 'hidden Scratch 2 block; Stitch has no stage scrolling',
  motion_scroll_up: 'hidden Scratch 2 block',
  motion_align_scene: 'hidden Scratch 2 block',
  motion_xscroll: 'hidden Scratch 2 block',
  motion_yscroll: 'hidden Scratch 2 block',
  looks_hideallsprites: 'hidden Scratch 2 block',
  looks_changestretchby: 'hidden Scratch 2 block; Stitch has no stretch',
  looks_setstretchto: 'hidden Scratch 2 block',
  event_whenstageclicked: 'Stitch has no stage click event',
  event_whentouchingobject: 'hidden block; Stitch has no touching event',
  control_for_each: 'hidden block',
  control_get_counter: 'hidden block',
  control_incr_counter: 'hidden block',
  control_clear_counter: 'hidden block',
  control_all_at_once: 'hidden block',
  sensing_userid: 'hidden block; Stitch has no accounts',
  pen_setPenShadeToNumber: 'Scratch 2 shade has no Stitch equivalent',
  pen_changePenShadeBy: 'Scratch 2 shade has no Stitch equivalent',
};

const ALL = Object.entries(SCRATCH).flatMap(([cat, ops]) =>
  ops.split(' ').map((op) => `${cat}_${op}`),
);

describe('opcode coverage', () => {
  it('maps every Scratch 3 core and Pen opcode or lists it as unsupported', () => {
    const missing = ALL.filter((op) => !HANDLED.has(op) && !UNSUPPORTED[op]);
    expect(missing).toEqual([]);
    expect(ALL.filter((op) => HANDLED.has(op) && UNSUPPORTED[op])).toEqual([]);
    // Nothing handled that Scratch doesn't have.
    expect([...HANDLED].filter((op) => !ALL.includes(op))).toEqual([]);
  });

  const m = (opcode: string, field: string, value: string) => menu(opcode, field, value);
  const statements: B[] = [
    b('motion_movesteps', { STEPS: 10 }),
    b('motion_turnright', { DEGREES: 15 }),
    b('motion_turnleft', { DEGREES: 15 }),
    b('motion_goto', { TO: m('motion_goto_menu', 'TO', 'Other') }),
    b('motion_gotoxy', { X: 1, Y: 2 }),
    b('motion_glideto', { SECS: 1, TO: m('motion_glideto_menu', 'TO', '_random_') }),
    b('motion_glidesecstoxy', { SECS: 1, X: 1, Y: 2 }),
    b('motion_pointindirection', { DIRECTION: 90 }),
    b('motion_pointtowards', { TOWARDS: m('motion_pointtowards_menu', 'TOWARDS', '_random_') }),
    b('motion_changexby', { DX: 10 }),
    b('motion_setx', { X: 0 }),
    b('motion_changeyby', { DY: 10 }),
    b('motion_sety', { Y: 0 }),
    b('motion_ifonedgebounce'),
    b('motion_setrotationstyle', undefined, { STYLE: ["don't rotate"] }),
    b('looks_sayforsecs', { MESSAGE: 'Hello!', SECS: 2 }),
    b('looks_say', { MESSAGE: 'Hello!' }),
    b('looks_thinkforsecs', { MESSAGE: 'Hmm', SECS: 2 }),
    b('looks_think', { MESSAGE: 'Hmm' }),
    b('looks_switchcostumeto', { COSTUME: m('looks_costume', 'COSTUME', 'c') }),
    b('looks_nextcostume'),
    b('looks_switchbackdropto', { BACKDROP: m('looks_backdrops', 'BACKDROP', 'next backdrop') }),
    b('looks_switchbackdroptoandwait', { BACKDROP: m('looks_backdrops', 'BACKDROP', 'b') }),
    b('looks_nextbackdrop'),
    b('looks_changesizeby', { CHANGE: 10 }),
    b('looks_setsizeto', { SIZE: 100 }),
    b('looks_changeeffectby', { CHANGE: 25 }, { EFFECT: ['COLOR'] }),
    b('looks_seteffectto', { VALUE: 0 }, { EFFECT: ['FISHEYE'] }),
    b('looks_cleargraphiceffects'),
    b('looks_show'),
    b('looks_hide'),
    b('looks_gotofrontback', undefined, { FRONT_BACK: ['front'] }),
    b('looks_goforwardbackwardlayers', { NUM: 1 }, { FORWARD_BACKWARD: ['forward'] }),
    b('sound_play', { SOUND_MENU: m('sound_sounds_menu', 'SOUND_MENU', 'pop') }),
    b('sound_playuntildone', { SOUND_MENU: m('sound_sounds_menu', 'SOUND_MENU', 'pop') }),
    b('sound_stopallsounds'),
    b('sound_changeeffectby', { VALUE: 10 }, { EFFECT: ['PITCH'] }),
    b('sound_seteffectto', { VALUE: 100 }, { EFFECT: ['PAN'] }),
    b('sound_cleareffects'),
    b('sound_changevolumeby', { VOLUME: -10 }),
    b('sound_setvolumeto', { VOLUME: 100 }),
    b('event_broadcast', { BROADCAST_INPUT: msg('m') }),
    b('event_broadcastandwait', { BROADCAST_INPUT: msg('m') }),
    b('control_wait', { DURATION: 1 }),
    { ...b('control_repeat', { TIMES: 10 }), sub: [b('looks_show')] },
    { ...b('control_if', { CONDITION: b('sensing_mousedown') }), sub: [b('looks_show')] },
    {
      ...b('control_if_else', { CONDITION: b('sensing_mousedown') }),
      sub: [b('looks_show')],
      sub2: [b('looks_hide')],
    },
    b('control_wait_until', { CONDITION: b('sensing_mousedown') }),
    { ...b('control_repeat_until', { CONDITION: b('sensing_mousedown') }), sub: [b('looks_show')] },
    { ...b('control_while', { CONDITION: b('sensing_mousedown') }), sub: [b('looks_show')] },
    b('control_create_clone_of', {
      CLONE_OPTION: m('control_create_clone_of_menu', 'CLONE_OPTION', 'Other'),
    }),
    b('sensing_askandwait', { QUESTION: "What's your name?" }),
    b('sensing_resettimer'),
    b('sensing_setdragmode', undefined, { DRAG_MODE: ['not draggable'] }),
    b('data_setvariableto', { VALUE: 0 }, { VARIABLE: vf('n') }),
    b('data_changevariableby', { VALUE: 1 }, { VARIABLE: vf('n') }),
    b('data_showvariable', undefined, { VARIABLE: vf('n') }),
    b('data_hidevariable', undefined, { VARIABLE: vf('n') }),
    b('data_addtolist', { ITEM: 'thing' }, { LIST: lf('l') }),
    b('data_deleteoflist', { INDEX: 1 }, { LIST: lf('l') }),
    b('data_deletealloflist', undefined, { LIST: lf('l') }),
    b('data_insertatlist', { ITEM: 'thing', INDEX: 1 }, { LIST: lf('l') }),
    b('data_replaceitemoflist', { INDEX: 1, ITEM: 'thing' }, { LIST: lf('l') }),
    b('data_showlist', undefined, { LIST: lf('l') }),
    b('data_hidelist', undefined, { LIST: lf('l') }),
    callProc('jump %s', { h: 10 }),
    b('pen_clear'),
    b('pen_stamp'),
    b('pen_penDown'),
    b('pen_penUp'),
    b('pen_setPenColorToColor', { COLOR: { prim: [9, '#ff0000'] } }),
    b('pen_changePenColorParamBy', {
      COLOR_PARAM: m('pen_menu_colorParam', 'colorParam', 'saturation'),
      VALUE: 10,
    }),
    b('pen_setPenColorParamTo', {
      COLOR_PARAM: m('pen_menu_colorParam', 'colorParam', 'transparency'),
      VALUE: 50,
    }),
    b('pen_changePenSizeBy', { SIZE: 1 }),
    b('pen_setPenSizeTo', { SIZE: 1 }),
    b('pen_changePenHueBy', { HUE: 10 }),
    b('pen_setPenHueToNumber', { HUE: 0 }),
    b('control_delete_this_clone'),
  ];
  const reporters: B[] = [
    b('motion_xposition'),
    b('motion_yposition'),
    b('motion_direction'),
    b('looks_costumenumbername', undefined, { NUMBER_NAME: ['name'] }),
    b('looks_backdropnumbername', undefined, { NUMBER_NAME: ['number'] }),
    b('looks_size'),
    b('sound_volume'),
    b('sensing_touchingobject', {
      TOUCHINGOBJECTMENU: m('sensing_touchingobjectmenu', 'TOUCHINGOBJECTMENU', '_mouse_'),
    }),
    b('sensing_touchingcolor', { COLOR: { prim: [9, '#00ff00'] } }),
    b('sensing_coloristouchingcolor', {
      COLOR: { prim: [9, '#00ff00'] },
      COLOR2: { prim: [9, '#0000ff'] },
    }),
    b('sensing_distanceto', {
      DISTANCETOMENU: m('sensing_distancetomenu', 'DISTANCETOMENU', 'Other'),
    }),
    b('sensing_answer'),
    b('sensing_keypressed', { KEY_OPTION: m('sensing_keyoptions', 'KEY_OPTION', 'space') }),
    b('sensing_mousedown'),
    b('sensing_mousex'),
    b('sensing_mousey'),
    b('sensing_loudness'),
    b('sensing_loud'),
    b('sensing_timer'),
    b(
      'sensing_of',
      { OBJECT: m('sensing_of_object_menu', 'OBJECT', 'Other') },
      { PROPERTY: ['x position'] },
    ),
    b(
      'sensing_of',
      { OBJECT: m('sensing_of_object_menu', 'OBJECT', '_stage_') },
      { PROPERTY: ['backdrop name'] },
    ),
    b(
      'sensing_of',
      { OBJECT: m('sensing_of_object_menu', 'OBJECT', '_stage_') },
      { PROPERTY: ['g'] },
    ),
    b('sensing_current', undefined, { CURRENTMENU: ['YEAR'] }),
    b('sensing_dayssince2000'),
    b('sensing_username'),
    ...['add', 'subtract', 'multiply', 'divide', 'mod'].map((op) =>
      b(`operator_${op}`, { NUM1: 1, NUM2: 2 }),
    ),
    ...['gt', 'lt', 'equals'].map((op) => b(`operator_${op}`, { OPERAND1: 1, OPERAND2: 50 })),
    ...['and', 'or'].map((op) =>
      b(`operator_${op}`, { OPERAND1: b('sensing_mousedown'), OPERAND2: b('sensing_mousedown') }),
    ),
    b('operator_random', { FROM: 1, TO: 10 }),
    b('operator_not', { OPERAND: b('sensing_mousedown') }),
    b('operator_join', { STRING1: 'apple ', STRING2: 'banana' }),
    b('operator_letter_of', { LETTER: 1, STRING: 'apple' }),
    b('operator_length', { STRING: 'apple' }),
    b('operator_contains', { STRING1: 'apple', STRING2: 'a' }),
    b('operator_round', { NUM: 2.5 }),
    b('operator_mathop', { NUM: 4 }, { OPERATOR: ['sqrt'] }),
    b('data_listcontents', undefined, { LIST: lf('l') }),
    b('data_itemoflist', { INDEX: 1 }, { LIST: lf('l') }),
    b('data_itemnumoflist', { ITEM: 'thing' }, { LIST: lf('l') }),
    b('data_lengthoflist', undefined, { LIST: lf('l') }),
    b('data_listcontainsitem', { ITEM: 'thing' }, { LIST: lf('l') }),
  ];
  const hats: B[] = [
    b('event_whenflagclicked'),
    b('event_whenkeypressed', undefined, { KEY_OPTION: ['a'] }),
    b('event_whenthisspriteclicked'),
    b('event_whenbackdropswitchesto', undefined, { BACKDROP: ['b'] }),
    b('event_whengreaterthan', { VALUE: 10 }, { WHENGREATERTHANMENU: ['TIMER'] }),
    b('event_whenbroadcastreceived', undefined, { BROADCAST_OPTION: ['m', 'm:m'] }),
    b('control_start_as_clone'),
  ];

  it('imports every mapped block into code that validates', async () => {
    const file = sb3([
      stage({ variables: { g: 0 } }),
      target({ name: 'Other' }),
      target({
        name: 'S',
        variables: { n: 0 },
        lists: { l: [] },
        scripts: [
          ...hats.map((hat) => ({ hat, body: [b('looks_show')] })),
          {
            hat: b('event_whenflagclicked'),
            body: [...statements, b('control_stop', undefined, { STOP_OPTION: ['all'] })],
          },
          {
            hat: b('event_whenflagclicked'),
            body: reporters.map((r) => b('looks_say', { MESSAGE: r })),
          },
          {
            hat: b('event_whenflagclicked'),
            body: [{ ...b('control_forever'), sub: [b('motion_movesteps', { STEPS: v('n') })] }],
          },
          proc('jump %s', ['h'], [b('motion_changeyby', { DY: arg('h') })]),
        ],
      }),
    ]);
    const { cart, report } = await importSb3(file);
    expect(report.unsupported).toEqual({});
    expect(report.notes).toEqual([]);
    const diagnostics = validateProject(cart.project).filter((d) => d.severity === 'error');
    expect(diagnostics).toEqual([]);
    expect(report.scripts).toBe(hats.length + 4);
    const compiled = compile(
      cart.project,
      cart.sprites.map((s) => s.id),
    );
    expect(compiled.ok).toBe(true);
  });
});
