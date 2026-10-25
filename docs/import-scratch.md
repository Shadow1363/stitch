# Importing Scratch projects

Stitch opens Scratch 3 projects (`.sb3`). Use **Cart → Open file…**, drop the file on the editor, or open `?cart=<url of the .sb3>`. You get an ordinary cart: the sprites and stage, every costume and backdrop, the sounds, variables, lists, custom blocks and scripts, as Stitch code and blocks. Save it as a `.stitch.png` to keep it.

When something couldn't come across exactly, a dialog lists it after the import. Nothing is silently dropped: each block Stitch can't express leaves a `-- sb3:` comment where it was, so you can find it with the editor's search.

The converter is `packages/sb3`. It turns blocks into the same tree the [language reference](reference.md) describes, then prints and re-reads it, so an imported cart holds the same canonical code you would type.

## What comes across

| Scratch | Stitch |
|---|---|
| Stage costumes | [Backdrops](cart-format.md#top-level), with the current one selected |
| Sprites | Sprites with the same position, direction, size, visibility, current costume and layer order |
| Costumes | Vector costumes as SVG and bitmaps as PNG, with the same rotation centre. Bitmaps saved at double resolution (most of them) are scaled down to stage size, as Scratch draws them |
| Sounds | [Recorded sounds](cart-format.md#sounds), decoded from WAV (including Scratch's ADPCM recordings) or MP3, mixed down to mono |
| Stage variables and lists | `global var`, with their saved values |
| Sprite variables and lists | `var` (one per clone, as in Scratch), with their saved values |
| Cloud variables | Ordinary `global var`s. The report notes each one |
| Custom blocks | `function`, or `warp function` when *run without screen refresh* is ticked. Inputs become parameters |
| Visible variable and list monitors | A `forever` loop calling [`watch`](reference.md#watchlabel-value--command) (see [D29](departures.md)) |
| Draggable sprites and rotation style | `set_drag_mode(true)` and `rotation_style(…)` in an `on start` script |
| Comments | `--` comments above the block they were attached to. Loose comments go at the top of the file |

Scripts keep their order from the workspace, top to bottom. Every Scratch 3 block in Motion, Looks, Sound, Events, Control, Sensing, Operators, Variables, My Blocks and the Pen extension has a Stitch spelling; the [language reference](reference.md) shows each one with its block. A few translations are worth knowing:

- *if … else* holding just another *if* becomes `elseif`.
- *stop this script* is `stop()`, or `return` inside a custom block, which in Scratch also only leaves the block.
- *go to / glide to / point towards* with *random position* or *mouse-pointer* use `"random"` and `"mouse"`. *point towards random* is `point(random(-180, 180))`.
- List indexes *last* and *random* become `len(list)` and `random(1, len(list))`; *delete all of* is `clear(list)`.
- *(list)* as a reporter is `join(list, " ")`. Scratch joins with no space when every item is one character; Stitch always uses a space.
- Key names are Stitch's ([D8](departures.md)): *left arrow* is `"left"`.
- Scratch 2's *pen hue* (0–200 around the wheel) is halved into Stitch's 0–100.

## Names

Stitch names are identifiers: letters, digits and `_`, not starting with a digit. Scratch names that aren't are spelled as one, so `my score!` becomes `my_score` and `Glide To (x , y ) speed` becomes `Glide_To_x_y_speed`. Letters lose their accents; a name with nothing left, such as one written only in Japanese, becomes `var`, `list` or `block`.

A name that is taken gets a number: a keyword (`end`), a builtin (`move`, `clones`), a sprite property (`x`, `size`), a global of the same name, or another variable in the sprite. So a sprite variable `x` is `x_2`. *of* blocks that read another sprite's variable use the new name: `var_of("Player", "hit_points")`.

Sprite, costume, backdrop and message names don't change, because Stitch scripts name them in strings. Sounds join one bank for the whole cart ([D36](departures.md)). The same recording with the same name in two sprites becomes one sound. A different sound under a name that's already taken gets a number (`Meow2`), and the scripts that play it are changed to match.

## What doesn't come across

These become `-- sb3:` comments. A reporter becomes `0`, `""` or `false` with a comment above its statement:

- Extensions other than Pen: Music, Text to Speech, Translate, Video Sensing, micro:bit and the rest, and TurboWarp's extensions.
- Hats with no Stitch event: *when stage clicked*, *when this sprite clicked* on the stage, and *when timer/loudness >* with a reporter instead of a number. The script is kept as a function nothing calls.
- *of* reading a sprite's *volume* or *costume name*, or reading from a sprite chosen by a reporter.
- Scratch 2 blocks that Scratch 3 hides: stretch, scrolling, *hide all sprites*, the counter blocks, *for each*, *all at once*, and pen shade.

Some things are approximated and noted in the report:

- **Sprite volume.** Stitch has one master volume ([D16](departures.md)), so each sprite's own volume is ignored.
- **Loose blocks.** Stacks without a hat and reporters left on the workspace are skipped. Scratch never runs them either.
- **Duplicate custom blocks.** When two definitions have the same text, the second is skipped. Scratch runs only the first.
- **Missing assets.** A costume missing from the file becomes an empty picture, and a sound that can't be decoded is left out.

## Behaviour that can differ

The code means the same, but a few of Stitch's [departures](departures.md) can change how a project plays:

- Hats fired during a tick start on the next tick ([D6](departures.md)). Scratch starts them in the same frame. A project that creates a clone or broadcasts, then changes a variable straight after `wait 0`, can find the new script reading the changed value.
- Clones past `stage.cloneLimit` (300, like Scratch) are an error instead of being ignored.
- Text in vector costumes keeps the font names Scratch saved (*Sans Serif*, *Handwriting*, *Marker* and so on). Browsers don't have those fonts, so the text draws in the browser's default font.
