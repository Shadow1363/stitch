# Departures from Scratch

Stitch keeps Scratch's defaults (480×360 stage, centre origin, y up, direction 90 = right, 1-based lists, floored `mod`, number coercion, division by zero → Infinity, `size` as a percentage, trig in degrees, broadcast restart semantics). Each difference is listed below with its reason. All are **pending owner approval** (Phase 1 review).

| # | Scratch | Stitch | Why |
|---|---|---|---|
| D1 | Sprites are silently fenced so part of them stays on stage | No implicit fencing. Sprites can sit fully off-stage, and drawing is clipped to the stage. You fence explicitly with `clamp_to_stage()`, `on_edge()` and `bounce()` | Hidden position edits break float math and confuse coders. Games often spawn sprites off-screen |
| D2 | Positions are rounded to 8 decimals | Full floats. Pixel-art costumes snap to whole pixels at render time only | Deterministic math. Render-only rounding |
| D3 | `if on edge, bounce` uses the pixel-accurate hull | `bounce()` uses the rotated costume's bounding box, reflects direction (keeping Scratch's minimum 0.2 push off the edge), then clamps the sprite back onto the stage. `on_edge()` returns `"left"`/`"right"`/`"top"`/`"bottom"`/`""` (visual edges) so velocity-style code can flip `vx`/`vy` | Cheap, predictable, identical on every renderer |
| D4 | `wait` and `timer` use the wall clock | Simulation time: whole ticks, 60 per second. `wait(s)` waits `max(1, round(s × 60))` ticks | Deterministic and testable; lag never skips a wait |
| D5 | Loops may run several iterations per frame when nothing redraws | Exactly one iteration per tick. A `warp function` (no yields) is planned for Phase 2 | Predictable timing. Compute-heavy loops are slower until warp lands |
| D6 | Hats fired mid-frame can run in the same frame | Hats fired during a tick start on the next tick | Order doesn't depend on thread position |
| D7 | String `=` ignores case | `==` is case-sensitive. Numeric strings still compare as numbers (`"10" == 10`). `contains` on text is also case-sensitive | Fewer surprises in text code |
| D8 | Key names like `"left arrow"` | `"left"`, `"space"`, `"a"`, `"enter"`, plus `"any"` for `key_down` | Shorter in text |
| D9 | Variables and lists are separate kinds | A variable can hold a list (`var items = [1, 2]`). Lists are shared by reference | One concept; maps to blocks with expression slots |
| D10 | point/distance only target sprites or the mouse | `point_towards(x, y)`, `angle_to(x, y)` and `distance_to(x, y)`, all in Scratch's direction convention. No raw `atan2` | One angle convention everywhere |
| D11 | — | `and`/`or` always return booleans (as Scratch blocks do, unlike Lua) | Matches boolean block slots |
| D12 | — | `return` must be the last statement of a block (as in Lua) | Keeps `return` followed by a newline unambiguous |
