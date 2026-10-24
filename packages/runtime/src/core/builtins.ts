import { parseHex } from '@stitch/cart';
import { findByNameOrNumber } from './audio';
import { clampToStage, edgeCrossed, stageBounds } from './bounds';
import { opaqueAt, spriteAt, spritesTouch, touchesColor, type Backdrop } from './collide';
import { jsonGet, jsonParse } from './json';
import { settle, type HttpRequest } from './net';
import { parseColor, rgbToHsv } from './pen';
import { createRandom } from './random';
import { STOP_THREAD } from './scheduler';
import type { RotationStyle, Sprite } from './sprite';
import * as $ from './values';
import { Dict, type Value } from './values';
import type { World } from './world';

type Fn = (...args: never[]) => unknown;
/** A builtin that takes ticks; compiled code runs it with `yield*`. */
type Waits<T = void> = Generator<undefined, T, unknown>;

/**
 * Runtime implementations of the builtin catalog (@stitch/ir builtins.ts), keyed by name.
 * Sprite builtins take the calling sprite first. A test keeps this 1:1 with the catalog.
 */
export function createBuiltins(w: World) {
  const space = w.space;
  /** Map cell under a cart-space point; the map is anchored at the stage's top-left. */
  const cellIndex = (x: Value, y: Value): number | undefined => {
    const m = w.map;
    if (!m) return undefined;
    const p = space.toStagePx($.n(x), $.n(y));
    const cx = Math.floor(p.x / m.tileSize);
    const cy = Math.floor(p.y / m.tileSize);
    if (cx < 0 || cy < 0 || cx >= m.width || cy >= m.height) return undefined;
    return cy * m.width + cx;
  };
  /** Status of each sprite's last finished request, for `http_status`. */
  const httpStatus = new WeakMap<Sprite, number>();
  function* http(S: Sprite, req: HttpRequest): Waits<string> {
    const r = yield* settle(w.net.request(req));
    httpStatus.set(S, r.status);
    return r.body;
  }
  /** Ticks for a duration in seconds: whole ticks, at least one (D4). */
  const ticksFor = (secs: Value) => Math.max(1, Math.round($.n(secs) * 60));
  /** A sprite named in a script: original name, clone id, or "stage". */
  const find = (id: Value) => {
    const s = w.find($.s(id));
    return s && !s.deleted ? s : undefined;
  };
  /** "mouse" and sprite names as a target position. */
  const target = (id: Value): { x: number; y: number } | undefined => {
    if ($.s(id) === 'mouse') return { x: w.input.mouseX, y: w.input.mouseY };
    const s = find(id);
    return s && !s.isStage ? { x: s.x, y: s.y } : undefined;
  };
  /** The original and every clone of a named sprite, or just one clone when given its id. */
  const everyone = (id: Value): Sprite[] => {
    const s = find(id);
    if (!s || s.isStage) return [];
    return s.isClone ? [s] : [s, ...w.clonesOf(s)];
  };
  const backdrop = (): Backdrop => ({
    drawList: w.sprites,
    map: w.map,
    tileset: w.map ? w.costumes[w.map.tileset] : undefined,
    background: rgbNumber(parseHex(space.settings.background)),
  });
  const colorArg = (c: Value) => {
    const rgb = parseColor(c);
    return rgb ? rgbNumber(rgb) : undefined;
  };
  const say = (S: Sprite, text: Value, thinking: boolean) => {
    const t = $.s(text);
    S.sayText = t === '' ? null : t;
    S.thinking = thinking;
    return t;
  };
  const stagePx = () => space.toStagePx(w.input.mouseX, w.input.mouseY);
  const clampN = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);
  const gridSize = (v: Value) => clampN(Math.floor($.n(v)), 0, 10000);
  const DEG = 180 / Math.PI;
  const penMoved = (S: Sprite, x0: number, y0: number, x1: number, y1: number) => {
    if (x0 !== x1 || y0 !== y1) w.pen.line(S.pen, x0, y0, x1, y1);
  };
  const lib = {
    // motion
    move(S: Sprite, steps: Value) {
      const d = space.forward(S.direction, $.n(steps));
      S.moveTo(S.x + d.dx, S.y + d.dy);
    },
    turn(S: Sprite, deg: Value) {
      S.direction = S.direction + $.n(deg);
    },
    goto(S: Sprite, x: Value, y: Value) {
      S.moveTo($.n(x), $.n(y));
    },
    point(S: Sprite, dir: Value) {
      S.direction = $.n(dir);
    },
    point_towards(S: Sprite, x: Value, y: Value) {
      const dx = $.n(x) - S.x;
      const dy = $.n(y) - S.y;
      if (dx !== 0 || dy !== 0) S.direction = space.directionOf(dx, dy);
    },
    bounce(S: Sprite) {
      const edge = edgeCrossed(S, space);
      if (!edge) return;
      // Reflect in screen space, keeping at least a small push away from the edge (as Scratch).
      const rad = (S.direction * Math.PI) / 180;
      let sx = Math.sin(rad);
      let sy = -Math.cos(rad);
      if (edge === 'left') sx = Math.max(0.2, Math.abs(sx));
      else if (edge === 'right') sx = -Math.max(0.2, Math.abs(sx));
      else if (edge === 'top') sy = Math.max(0.2, Math.abs(sy));
      else sy = -Math.max(0.2, Math.abs(sy));
      S.direction = (Math.atan2(sx, -sy) * 180) / Math.PI;
      clampToStage(S, space);
    },
    clamp_to_stage(S: Sprite) {
      clampToStage(S, space);
    },
    on_edge(S: Sprite): string {
      return edgeCrossed(S, space);
    },
    angle_to(S: Sprite, x: Value, y: Value): number {
      return space.directionOf($.n(x) - S.x, $.n(y) - S.y);
    },
    distance_to(S: Sprite, x: Value, y: Value): number {
      return Math.hypot($.n(x) - S.x, $.n(y) - S.y);
    },
    // looks
    costume(S: Sprite, c: Value) {
      const count = S.costumes.length;
      if (!count) return;
      if (typeof c === 'string') {
        const i = S.costumes.findIndex((k) => k.name === c);
        if (i >= 0) {
          S.costume = i;
          return;
        }
        if (c.trim() === '' || Number.isNaN(Number(c))) return;
      }
      const k = Math.round($.n(c)) - 1;
      S.costume = ((k % count) + count) % count;
    },
    next_costume(S: Sprite) {
      if (S.costumes.length) S.costume = (S.costume + 1) % S.costumes.length;
    },
    say(S: Sprite, text: Value) {
      say(S, text, false);
    },
    *say_for(S: Sprite, text: Value, secs: Value): Waits {
      const t = say(S, text, false);
      yield* lib.wait(secs);
      if (S.sayText === t) S.sayText = null;
    },
    show(S: Sprite) {
      S.visible = true;
    },
    hide(S: Sprite) {
      S.visible = false;
    },
    // sound
    play_sound(snd: Value) {
      const s = findByNameOrNumber(w.sounds, snd);
      if (s) w.audio.playSound(s.id);
    },
    *play_sound_wait(snd: Value): Waits {
      const s = findByNameOrNumber(w.sounds, snd);
      if (!s) return;
      w.audio.playSound(s.id);
      // Simulation time, from the rendered length: never ends before the sound does.
      const until = w.ticks + Math.max(1, Math.ceil(s.seconds * 60 - 1e-9));
      while (w.ticks < until) yield;
    },
    stop_sounds() {
      w.audio.stopSounds();
    },
    play_music(song: Value) {
      const s = findByNameOrNumber(w.songs, song);
      if (s) w.audio.playMusic(s.id);
    },
    stop_music() {
      w.audio.stopMusic();
    },
    set_volume(v: Value) {
      w.volume = Math.max(0, Math.min(100, $.n(v)));
      w.audio.setVolume(w.volume / 100);
    },
    volume: (): number => w.volume,
    // events
    broadcast(msg: Value) {
      w.scheduler.trigger('message', $.s(msg), true);
    },
    *broadcast_wait(msg: Value): Waits {
      const threads = w.scheduler.trigger('message', $.s(msg), true);
      const gens = threads.map((t) => t.gen);
      // Done when each started thread finished or was restarted by someone else.
      while (threads.some((t, i) => t.state !== 'done' && t.gen === gens[i])) yield;
    },
    // control
    *wait(secs: Value): Waits {
      // Simulation time: whole ticks, at least one, so `wait(0)` still yields.
      const until = w.ticks + Math.max(1, Math.round($.n(secs) * 60));
      while (w.ticks < until) yield;
    },
    stop(): never {
      throw STOP_THREAD;
    },
    // sensing
    key_down(key: Value): boolean {
      return w.input.isDown($.s(key));
    },
    timer(): number {
      return (w.ticks - w.timerStart) / 60;
    },
    reset_timer() {
      w.timerStart = w.ticks;
    },
    // map
    tile_at(x: Value, y: Value): number {
      const i = cellIndex(x, y);
      return i === undefined ? 0 : w.map!.cells[i]!;
    },
    set_tile(x: Value, y: Value, t: Value) {
      const i = cellIndex(x, y);
      if (i === undefined) return;
      const v = Math.max(0, Math.min(0xffff, Math.round($.n(t))));
      if (w.map!.cells[i] === v) return;
      w.map!.cells[i] = v;
      w.map!.dirty.add(i);
    },
    // math
    abs: (x: Value) => Math.abs($.n(x)),
    floor: (x: Value) => Math.floor($.n(x)),
    ceil: (x: Value) => Math.ceil($.n(x)),
    round: (x: Value) => Math.round($.n(x)),
    sqrt: (x: Value) => Math.sqrt($.n(x)),
    sin: (x: Value) => $.sin(x),
    cos: (x: Value) => $.cos(x),
    tan: (x: Value) => $.tan(x),
    min: (a: Value, c: Value) => Math.min($.n(a), $.n(c)),
    max: (a: Value, c: Value) => Math.max($.n(a), $.n(c)),
    random(a: Value, c: Value): number {
      const x = $.n(a);
      const y = $.n(c);
      const lo = Math.min(x, y);
      const hi = Math.max(x, y);
      const decimal = (v: Value) => typeof v === 'string' && v.includes('.');
      if (Number.isInteger(lo) && Number.isInteger(hi) && !decimal(a) && !decimal(c))
        return lo + Math.floor(w.random() * (hi - lo + 1));
      return lo + w.random() * (hi - lo);
    },
    // lists and strings
    len: (v: Value) => $.len(v),
    push: (list: Value, item: Value) => $.push(list, item),
    insert: (list: Value, i: Value, item: Value) => $.insert(list, i, item),
    remove: (list: Value, i: Value) => $.remove(list, i),
    contains: (v: Value, item: Value) => $.contains(v, item),
    // data
    *http_get(S: Sprite, url: Value): Waits<string> {
      return yield* http(S, { method: 'GET', url: $.s(url) });
    },
    *http_post(S: Sprite, url: Value, body: Value): Waits<string> {
      return yield* http(S, { method: 'POST', url: $.s(url), body: $.s(body) });
    },
    http_status: (S: Sprite): number => httpStatus.get(S) ?? 0,
    json_get: (json: Value, path: Value) => jsonGet(json, path),
    json_parse: (text: Value) => jsonParse(text),
    // debug
    print(v: Value) {
      w.log($.s(v));
    },
    // ---- block parity (Phase 9) ----
    // motion
    goto_random(S: Sprite) {
      const p = space.fromStagePx(w.random() * space.width, w.random() * space.height);
      S.moveTo(p.x, p.y);
    },
    goto_sprite(S: Sprite, id: Value) {
      if ($.s(id) === 'random') return lib.goto_random(S);
      const p = target(id);
      if (p) S.moveTo(p.x, p.y);
    },
    *glide(S: Sprite, secs: Value, x: Value, y: Value): Waits {
      const n = ticksFor(secs);
      const x0 = S.x;
      const y0 = S.y;
      const x1 = $.n(x);
      const y1 = $.n(y);
      for (let i = 1; i <= n; i++) {
        yield;
        S.moveTo(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n);
      }
    },
    point_towards_sprite(S: Sprite, id: Value) {
      const p = target(id);
      if (p) lib.point_towards(S, p.x, p.y);
    },
    rotation_style(S: Sprite, style: Value) {
      const v = $.s(style)
        .toLowerCase()
        .replace(/[^a-z]/g, '');
      const styles: Record<string, RotationStyle> = {
        allaround: 'all around',
        leftright: 'left-right',
        dontrotate: "don't rotate",
      };
      const r = styles[v];
      if (r) S.rotationStyle = r;
    },
    // looks
    think(S: Sprite, text: Value) {
      say(S, text, true);
    },
    *think_for(S: Sprite, text: Value, secs: Value): Waits {
      const t = say(S, text, true);
      yield* lib.wait(secs);
      if (S.sayText === t) S.sayText = null;
    },
    costume_name: (S: Sprite): string => S.currentCostume?.name ?? '',
    set_effect(S: Sprite, name: Value, v: Value) {
      const e = $.s(name).toLowerCase();
      const x = $.n(v);
      if (e === 'ghost') S.effects.ghost = clampN(x, 0, 100);
      else if (e === 'brightness') S.effects.brightness = clampN(x, -100, 100);
      else if (e === 'color') S.effects.color = ((x % 200) + 200) % 200;
    },
    change_effect(S: Sprite, name: Value, by: Value) {
      const e = $.s(name).toLowerCase();
      const cur = e === 'ghost' || e === 'brightness' || e === 'color' ? S.effects[e] : 0;
      lib.set_effect(S, name, cur + $.n(by));
    },
    clear_effects(S: Sprite) {
      S.effects = { ghost: 0, brightness: 0, color: 0 };
    },
    go_to_front(S: Sprite) {
      w.moveLayer(S, Infinity);
    },
    go_to_back(S: Sprite) {
      w.moveLayer(S, 0);
    },
    change_layer(S: Sprite, by: Value) {
      w.moveLayer(S, w.layerIndex(S) + Math.round($.n(by)));
    },
    // sound
    change_volume(by: Value) {
      lib.set_volume(w.volume + $.n(by));
    },
    // control
    stop_all(): never {
      w.stopEverything();
      throw STOP_THREAD;
    },
    stop_other_scripts(S: Sprite) {
      w.scheduler.stopOthers(S, w.scheduler.current);
    },
    // clones
    create_clone(S: Sprite) {
      w.createClone(S);
    },
    create_clone_of(S: Sprite, id: Value) {
      const t = $.s(id) === 'myself' ? S : find(id);
      if (t && !t.isStage) w.createClone(t.original);
    },
    delete_clone(S: Sprite) {
      if (!S.isClone) return;
      w.deleteClone(S);
      throw STOP_THREAD;
    },
    is_clone: (S: Sprite): boolean => S.isClone,
    clone_count: (S: Sprite): number => w.clonesOf(S).length,
    clones(id: Value): Value[] {
      const s = find(id);
      return s && !s.isStage ? w.clonesOf(s).map((c) => c.handle) : [];
    },
    my_id: (S: Sprite): string => S.handle,
    // sensing
    key_pressed: (key: Value): boolean => w.input.wasPressed($.s(key)),
    mouse_x: (): number => w.input.mouseX,
    mouse_y: (): number => w.input.mouseY,
    mouse_down: (): boolean => w.input.mouseDown,
    touching(S: Sprite, id: Value): boolean {
      if ($.s(id) === 'mouse') return lib.touching_mouse(S);
      if ($.s(id) === 'edge') return lib.touching_edge(S);
      return everyone(id).some((o) => spritesTouch(S, o, space));
    },
    touching_edge(S: Sprite): boolean {
      const r = stageBounds(S, space);
      return r.left <= 0 || r.top <= 0 || r.right >= space.width || r.bottom >= space.height;
    },
    touching_mouse(S: Sprite): boolean {
      const p = stagePx();
      return opaqueAt(S, space, p.x, p.y);
    },
    touching_color(S: Sprite, c: Value): boolean {
      const target = colorArg(c);
      return target !== undefined && touchesColor(S, target, undefined, backdrop(), space);
    },
    color_touching(S: Sprite, mine: Value, other: Value): boolean {
      const a = colorArg(mine);
      const b = colorArg(other);
      return a !== undefined && b !== undefined && touchesColor(S, b, a, backdrop(), space);
    },
    distance_to_sprite(S: Sprite, id: Value): number {
      const p = target(id);
      return p ? Math.hypot(p.x - S.x, p.y - S.y) : 10000;
    },
    sprite_at(x: Value, y: Value): string {
      const p = space.toStagePx($.n(x), $.n(y));
      return spriteAt(w.sprites, space, p.x, p.y)?.handle ?? '';
    },
    x_of: (id: Value): number => find(id)?.x ?? 0,
    y_of: (id: Value): number => find(id)?.y ?? 0,
    direction_of: (id: Value): number => find(id)?.direction ?? 0,
    costume_of: (id: Value): number => find(id)?.costume_number ?? 0,
    var_of(id: Value, name: Value): Value {
      const s = find(id);
      if (!s) return '';
      const k = $.s(name);
      const own = Object.hasOwn(s.vars, k) ? s.vars[k] : undefined;
      if (own !== undefined) return own;
      const shared = w.sharedVars(s);
      if (Object.hasOwn(shared, k)) return shared[k]!;
      return s.isStage && Object.hasOwn(w.globals, k) ? w.globals[k]! : '';
    },
    delta_time: (): number => 1 / 60,
    // map by cell
    map_cell(col: Value, row: Value): number {
      const m = w.map;
      if (!m) return 0;
      const c = Math.floor($.n(col)) - 1;
      const r = Math.floor($.n(row)) - 1;
      return c >= 0 && r >= 0 && c < m.width && r < m.height ? m.cells[r * m.width + c]! : 0;
    },
    set_map_cell(col: Value, row: Value, tile: Value) {
      const m = w.map;
      if (!m) return;
      const c = Math.floor($.n(col)) - 1;
      const r = Math.floor($.n(row)) - 1;
      if (c < 0 || r < 0 || c >= m.width || r >= m.height) return;
      const i = r * m.width + c;
      const v = clampN(Math.round($.n(tile)), 0, 0xffff);
      if (m.cells[i] === v) return;
      m.cells[i] = v;
      m.dirty.add(i);
    },
    map_width: (): number => w.map?.width ?? 0,
    map_height: (): number => w.map?.height ?? 0,
    tile_size: (): number => w.map?.tileSize ?? 0,
    // math
    random_int(a: Value, c: Value): number {
      const lo = Math.ceil(Math.min($.n(a), $.n(c)));
      const hi = Math.floor(Math.max($.n(a), $.n(c)));
      return hi < lo ? lo : lo + Math.floor(w.random() * (hi - lo + 1));
    },
    set_seed(seed: Value) {
      w.random = createRandom(Math.floor($.n(seed)) >>> 0);
    },
    clamp(x: Value, lo: Value, hi: Value): number {
      const a = $.n(lo);
      const b = $.n(hi);
      return clampN($.n(x), Math.min(a, b), Math.max(a, b));
    },
    lerp: (a: Value, b: Value, t: Value): number => $.n(a) + ($.n(b) - $.n(a)) * $.n(t),
    sign: (x: Value): number => ($.n(x) > 0 ? 1 : $.n(x) < 0 ? -1 : 0),
    distance: (x1: Value, y1: Value, x2: Value, y2: Value): number =>
      Math.hypot($.n(x2) - $.n(x1), $.n(y2) - $.n(y1)),
    angle: (x1: Value, y1: Value, x2: Value, y2: Value): number =>
      space.directionOf($.n(x2) - $.n(x1), $.n(y2) - $.n(y1)),
    asin: (x: Value): number => Math.asin($.n(x)) * DEG,
    acos: (x: Value): number => Math.acos($.n(x)) * DEG,
    atan: (x: Value): number => Math.atan($.n(x)) * DEG,
    ln: (x: Value): number => Math.log($.n(x)),
    log: (x: Value): number => Math.log10($.n(x)),
    exp: (x: Value): number => Math.exp($.n(x)),
    pow10: (x: Value): number => 10 ** $.n(x),
    // strings
    split(text: Value, sep: Value): Value[] {
      const t = $.s(text);
      const s = $.s(sep);
      return t === '' ? [] : s === '' ? Array.from(t) : t.split(s);
    },
    join(list: Value, sep: Value): string {
      return Array.isArray(list) ? list.map($.s).join($.s(sep)) : $.s(list);
    },
    substring(text: Value, from: Value, to: Value): string {
      const chars = Array.from($.s(text));
      const a = Math.max(1, Math.floor($.n(from)));
      const b = Math.min(chars.length, Math.floor($.n(to)));
      return a > b ? '' : chars.slice(a - 1, b).join('');
    },
    upper: (text: Value): string => $.s(text).toUpperCase(),
    lower: (text: Value): string => $.s(text).toLowerCase(),
    format_number: (x: Value, d: Value): string =>
      $.n(x).toFixed(clampN(Math.floor($.n(d)), 0, 20)),
    // lists, grids and dictionaries
    clear(list: Value) {
      if (Array.isArray(list)) list.length = 0;
      else if (list instanceof Dict) list.clear();
    },
    index_of(list: Value, item: Value): number {
      return Array.isArray(list) ? list.findIndex((x) => $.eq(x, item)) + 1 : 0;
    },
    make_grid(width: Value, height: Value, v: Value): Value[] {
      const gw = gridSize(width);
      const gh = gridSize(height);
      if (gw * gh > 1_000_000)
        throw new Error(`a ${gw}×${gh} grid is too big (1,000,000 cells at most)`);
      return Array.from({ length: gh }, () => new Array<Value>(gw).fill(v));
    },
    cell: (g: Value, x: Value, y: Value): Value => $.index($.index(g, y), x),
    set_cell(g: Value, x: Value, y: Value, v: Value) {
      $.setIndex($.index(g, y), x, v);
    },
    grid_width: (g: Value): number => (Array.isArray(g) && g.length ? $.len(g[0]) : 0),
    grid_height: (g: Value): number => (Array.isArray(g) ? g.length : 0),
    fill_grid(g: Value, v: Value) {
      if (Array.isArray(g)) for (const row of g) if (Array.isArray(row)) row.fill(v);
    },
    dict: (): Dict => new Dict(),
    keys: (d: Value): Value[] => (d instanceof Dict ? [...d.keys()] : []),
    has_key: (d: Value, k: Value): boolean => d instanceof Dict && d.has($.s(k)),
    // pen
    clear_pen() {
      w.pen.clear();
    },
    stamp(S: Sprite) {
      w.pen.stamp(S);
    },
    pen_down(S: Sprite) {
      if (S.isStage) return;
      S.pen.down = true;
      S.penMoved = penMoved;
      w.pen.dot(S.pen, S.x, S.y);
    },
    pen_up(S: Sprite) {
      S.pen.down = false;
      S.penMoved = undefined;
    },
    set_pen_color(S: Sprite, c: Value) {
      const rgb = parseColor(c);
      if (!rgb) return;
      [S.pen.hue, S.pen.saturation, S.pen.brightness] = rgbToHsv(...rgb);
    },
    change_pen_color(S: Sprite, by: Value) {
      S.pen.hue = (((S.pen.hue + $.n(by)) % 100) + 100) % 100;
    },
    set_pen_size(S: Sprite, v: Value) {
      S.pen.size = clampN($.n(v), 1, 1200);
    },
    change_pen_size(S: Sprite, by: Value) {
      lib.set_pen_size(S, S.pen.size + $.n(by));
    },
    set_pen_transparency(S: Sprite, v: Value) {
      S.pen.transparency = clampN($.n(v), 0, 100);
    },
    change_pen_transparency(S: Sprite, by: Value) {
      lib.set_pen_transparency(S, S.pen.transparency + $.n(by));
    },
    draw_line(S: Sprite, x1: Value, y1: Value, x2: Value, y2: Value) {
      w.pen.line(S.pen, $.n(x1), $.n(y1), $.n(x2), $.n(y2));
    },
    draw_rect(S: Sprite, x1: Value, y1: Value, x2: Value, y2: Value) {
      w.pen.rect(S.pen, $.n(x1), $.n(y1), $.n(x2), $.n(y2), false);
    },
    fill_rect(S: Sprite, x1: Value, y1: Value, x2: Value, y2: Value) {
      w.pen.rect(S.pen, $.n(x1), $.n(y1), $.n(x2), $.n(y2), true);
    },
    draw_circle(S: Sprite, x: Value, y: Value, r: Value) {
      w.pen.circle(S.pen, $.n(x), $.n(y), $.n(r), false);
    },
    fill_circle(S: Sprite, x: Value, y: Value, r: Value) {
      w.pen.circle(S.pen, $.n(x), $.n(y), $.n(r), true);
    },
    draw_text(S: Sprite, text: Value, x: Value, y: Value) {
      w.pen.text(S.pen, $.s(text), $.n(x), $.n(y));
    },
    // debug
    watch(label: Value, v: Value) {
      w.watches.set($.s(label), $.s(v));
    },
    assert(cond: Value, message: Value) {
      if (!$.b(cond)) throw new Error(`assertion failed: ${$.s(message)}`);
    },
    // ---- editor tooling (Phase 11) ----
    *ask(S: Sprite, question: Value): Waits {
      const q = $.s(question);
      const gen = w.askGeneration;
      // One question at a time, in the order asked (as Scratch). A visible sprite asks in its
      // speech bubble; the stage and hidden sprites ask in the answer field's prompt.
      const turn = w.askQueue.then(() => {
        if (gen !== w.askGeneration || S.deleted) return '';
        const bubble = S.visible && !S.isStage;
        if (bubble) say(S, q, false);
        return w.asker.ask(bubble ? '' : q).then((a) => {
          if (bubble && S.sayText === q) S.sayText = null;
          return a;
        });
      });
      w.askQueue = turn.catch(() => undefined);
      w.answer = yield* settle(turn);
    },
    answer: (): string => w.answer,
    stage_width: (): number => space.width,
    stage_height: (): number => space.height,
    frame_count: (): number => w.ticks,
  } satisfies Record<string, Fn>;
  return lib;
}

export type Builtins = ReturnType<typeof createBuiltins>;

const rgbNumber = ([r, g, b]: [number, number, number]) => (r << 16) | (g << 8) | b;

export { stageBounds };
