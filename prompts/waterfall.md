# Prompt: a waterfall diagram as YAML

> **How to use this file.** Paste all of it into a chat with an LLM and describe your diagram, or paste your data, under "Your input" at the end. Save the YAML it returns as a `.yaml` file and open it in the Waterfall editor of the Diagram design toolkit (Open, or drop the file on the page).

You write data files for the **Waterfall editor**. A waterfall diagram shows how a total changes step by step between **moments** (usually years). At each moment a stacked total shows what it is made of, per **carrier** (for example electricity or gas). Between two totals, one step per carrier shows how much that carrier grew or shrank. You give only the amount of each carrier at each moment; **the editor works out the steps**. One file can hold several **diagrams** drawn above each other on shared columns, for example "growth" and "decline".

Your job: turn the input at the end into **one YAML document** in the format below. The editor must open it without errors.

## Answer format

- Reply with the YAML in a single ```` ```yaml ```` code block. After the block, list in at most three short lines anything you had to assume or estimate. Nothing else.
- Use only the keys described here. Leave out optional keys you don't need instead of writing empty values.

## YAML rules

- Indent with 2 spaces. Every table is a list of mappings (`- key: value`).
- **Always quote hex colours**: `color: '#E0A93B'`. Unquoted, the `#` starts a comment and the colour is lost.
- **Always quote moment IDs**, here and as keys under `amounts`: `id: '2030'`, `'2030': 300`.
- Quote texts that look like numbers, dates or booleans (`'yes'`, `'no'`, `'on'`, `'null'`), and texts that contain `: ` or start with `&`, `*`, `!`, `|`, `>`, `%`, `@` or a backtick. In one-line `{ … }` mappings also quote texts with a comma.
- Write the key `y` as `"y"` (some YAML readers treat a bare `y` as a boolean).
- Numbers are plain: `1234.5`. No thousands separators, no units, a dot for decimals.
- Booleans are `true` or `false`.

## Document structure

Top-level keys, in this order:

```yaml
type: waterfall
version: '1.0'
diagrams: [...]   # required: at least one
moments: [...]    # required: at least two
carriers: [...]   # required
values: [...]     # required
settings: [...]   # optional, but always set at least the title
texts: [...]      # optional: free text boxes
```

### diagrams

Drawn above each other in this order. They share their columns, so they line up.

| key | required | meaning |
|---|---|---|
| `id` | yes | Unique ID, lowercase `snake_case` ASCII. Values refer to it. |
| `title` | yes | Shown beside the diagram. |
| `subtitle` | no | Shown under the title. |
| `visible` | no | `false` leaves the diagram out of the drawing. |

### moments

In time order.

| key | required | meaning |
|---|---|---|
| `id` | yes | Unique ID, quoted, e.g. `'2030'`. It is the key of this moment under `amounts`. |
| `title` | yes | Shown under its total, e.g. `'2030'`. |
| `visible` | no | `false` skips the moment; the steps then run from the moment before to the one after. |

### carriers

**The order of the rows is the order of the steps** and of the stack in each total.

| key | required | meaning |
|---|---|---|
| `id` | yes | Unique ID used by the values. |
| `title` | yes | Name in the legend and tooltips. |
| `color` | yes | Quoted hex colour (see Colours). |
| `icon` | no | Icon above its steps (see Icons). |
| `pattern`, `patterncolor` | no | Patterned fill (see Patterns). |

### values

One row per diagram and carrier.

| key | required | meaning |
|---|---|---|
| `diagram` | yes | ID of a diagram. |
| `carrier` | yes | ID of a carrier. A carrier may appear in several diagrams. |
| `amounts` | yes | A mapping from each moment ID (quoted) to the carrier's amount **at** that moment, a number. Give every moment. These are levels, not changes. |
| `note` | no | Shown in the tooltip. |
| `pattern`, `patterncolor` | no | For these values only, instead of their carrier's. |

### settings

A list of pairs: `- setting: <key>` with `waarde: <value>`. (`waarde` is Dutch for "value"; keep that key name.) Include only the settings that differ from their defaults; the full list is at the end. Always set `title` and `unit`.

## Rules the editor checks

- Diagram, moment and carrier IDs are unique and not empty.
- Every value row has a `diagram` and `carrier` that exist.
- Every amount is a number.
- Carrier colours are hex codes.

## Colours

Use these colours for carriers with a known meaning, so diagrams across the toolkit match:

| meaning | colour | | meaning | colour |
|---|---|---|---|---|
| electricity | `'#E0A93B'` | | wind, renewable | `'#7CC2A0'` |
| hydrogen | `'#7862C6'` | | solar | `'#C9B45A'` |
| heat | `'#C8586F'` | | geothermal | `'#0A7350'` |
| waste heat | `'#D98A97'` | | oil, fossil | `'#6B655C'` |
| methane, natural gas | `'#3B78B0'` | | coal | `'#4A4641'` |
| biomass | `'#3F9A74'` | | waste | `'#9B948A'` |
| biofuel | `'#5FA98A'` | | losses | `'#B9B2A6'` |
| synthetic fuels | `'#DD8560'` | | ammonia | `'#9A88D2'` |
| nuclear | `'#5AB2DA'` | | methanol | `'#9A7A58'` |

For anything else, take colours in this order: `'#3B78B0'`, `'#E0A93B'`, `'#3F9A74'`, `'#7862C6'`, `'#DD8560'`, `'#0A7350'`, `'#5AB2DA'`, `'#C8586F'`, `'#8A9A2B'`, `'#6B655C'`, `'#9A6FA6'`, `'#B9B2A6'`. Skip colours already used.

## Icons

Optional. Built-in names: `industry`, `buildings`, `agriculture`, `car`, `plane`, `ship`, `power-plant`, `electrolysis`, `conversion`, `refinery`, `data-centre`, `storage`, `battery`, `export`, `electricity`, `heat`, `waste-heat`, `hydrogen`, `gas`, `oil`, `crude-oil`, `coal`, `biomass`, `biofuel`, `ammonia`, `geothermal`, `ambient-heat`, `solar`, `sun`, `wind`, `nuclear`, `synthetic`, `plastic`, `waste`, `methanol`. Also `none`, or `tabler:<name>` for any icon from tabler.io/icons. Give carriers an icon when one fits: by default the steps are marked with their carrier's icon.

## Patterns

Optional, for print or to mark a mix: `pattern` is one of `stripes`, `diagonal`, `diagonal-down`, `crosshatch`, `vertical`, `horizontal`, `grid`, `dots`, `rings`, `dashes`, `zigzag`, `waves`, `checks`, or `none`. `patterncolor` is a quoted hex colour for the second colour, e.g. that of the other carrier in a mix.

## Text boxes (optional)

Free texts on the canvas, for a source line or a note. List them under `texts`:

| key | meaning |
|---|---|
| `text` | The text. For several lines use a block scalar (`text: \|`) or `\n` in a double-quoted string. |
| `x`, `"y"` | Top-left corner in pixels from the top left of the canvas (default canvas 1600 × 900). |
| `width` | Width in pixels (default 220); text wraps inside it. |
| `height` | Optional; the box grows to fit its text anyway. |
| `size` | Font size in pixels (default: the diagram's text size). |
| `weight` | `light`, `regular`, `medium` or `bold`. |
| `color` | Text colour, quoted hex. |
| `align` | `left`, `center` or `right`. |
| `background`, `border` | Optional quoted hex colours; leave out for none. |
| `visible` | `false` hides the box. |

## Complete example

Made-up numbers in PJ: CO₂-free carriers grow in the top diagram, fossil ones shrink in the bottom one.

```yaml
type: waterfall
version: '1.0'
diagrams:
  - id: growth
    title: Growth
    subtitle: CO₂-free
  - id: decline
    title: Decline
    subtitle: Fossil
moments:
  - id: '2030'
    title: '2030'
  - id: '2040'
    title: '2040'
  - id: '2050'
    title: '2050'
carriers:
  - id: electricity
    title: Electricity
    color: '#E0A93B'
    icon: electricity
  - id: hydrogen
    title: Hydrogen
    color: '#7862C6'
    icon: hydrogen
  - id: heat
    title: Heat
    color: '#C8586F'
    icon: heat
  - id: biomass
    title: Biomass
    color: '#3F9A74'
    icon: biomass
  - id: gas
    title: Natural gas
    color: '#3B78B0'
    icon: gas
  - id: oil
    title: Oil products
    color: '#6B655C'
    icon: oil
values:
  - diagram: growth
    carrier: electricity
    amounts: { '2030': 300, '2040': 450, '2050': 600 }
  - diagram: growth
    carrier: hydrogen
    amounts: { '2030': 10, '2040': 60, '2050': 140 }
  - diagram: growth
    carrier: heat
    amounts: { '2030': 70, '2040': 90, '2050': 110 }
  - diagram: growth
    carrier: biomass
    amounts: { '2030': 80, '2040': 95, '2050': 100 }
  - diagram: decline
    carrier: gas
    amounts: { '2030': 600, '2040': 380, '2050': 150 }
  - diagram: decline
    carrier: oil
    amounts: { '2030': 450, '2040': 300, '2050': 120 }
    note: Mostly road transport
settings:
  - setting: title
    waarde: Final energy use, growth and decline (example with made-up numbers)
  - setting: unit
    waarde: PJ
```

## Before you answer, check

- Every value's `diagram` and `carrier` exist, spelled exactly as their IDs.
- Every value row has an amount for every moment, under the quoted moment ID.
- The amounts are levels at each moment, not changes.
- Every hex colour and every moment ID is quoted.

## Settings

All settings, with their defaults. Only include the ones you change.

| setting | default | values | what it does |
|---|---|---|---|
| `canvasWidth` | `1600` | number, min 100 | Canvas: Width |
| `canvasHeight` | `900` | number, min 100 | Canvas: Height |
| `scaleCanvas` | `1` | number, min 0.1, max 5 | Canvas: Output scale. Scales the drawing inside the exported image: 0.8 draws everything at 80%. Zooming the view does not change it. |
| `margin` | `60` | number, min 0, max 400 | Canvas: Margin |
| `backgroundColor` | '#F5F3EF' | hex colour | Canvas: Background |
| `transparentBackground` | `false` | `true` / `false` | Canvas: Transparent background. Exports without a background fill. |
| `title` | (empty) | text | Title: Title |
| `subtitle` | (empty) | text | Title: Subtitle |
| `titleFontSize` | `24` | number, min 6 | Title: Size |
| `subtitleFontSize` | `15` | number, min 6 | Title: Subtitle size |
| `titlePositionX` | `60` | number | Title: X |
| `titlePositionY` | `60` | number | Title: Y |
| `titleColor` | '#2B2B2B' | hex colour | Title: Colour |
| `axisSync` | `same` | `same` the same in every diagram; `fitted` same scale, height follows the values; `own` each its own scale | Diagrams: Vertical axes. Columns are always shared, so the diagrams line up. |
| `diagramGap` | `18` | number, min 0, max 300 | Diagrams: Space between |
| `axisPlace` | `auto` | `auto` between two diagrams, below one; `top` above; `bottom` below; `each` below every diagram | Diagrams: Column headings |
| `scaleMode` | `fit` | `fit` fill the canvas; `fixed` fixed pixels per unit | Values and scale: Height. Use the same fixed scale in several diagrams to compare them. |
| `pxPerUnit` | `0.1` | number, min 0.000001 | Values and scale: Pixels per unit |
| `multiply` | `1` | number | Values and scale: Multiply values by. For unit conversion. 0.27778 turns PJ into TWh. |
| `unit` | (empty) | text | Values and scale: Unit |
| `decimals` | `auto` | `auto` automatic; `0`; `1`; `2`; `3` | Values and scale: Decimals |
| `columns` | `all` | `all` every carrier, always in the same place; `changing` only carriers that change | Steps: Columns between totals |
| `columnHeads` | `icons` | `icons`; `names`; `tabs` colours; `none` nothing | Steps: Marked with |
| `decreases` | `light` | `light` outlined; `solid` filled, like increases | Steps: Decreases |
| `showConnectors` | `true` | `true` / `false` | Steps: Lines between steps |
| `showBands` | `true` | `true` / `false` | Steps: White panel behind the steps |
| `showTotals` | `true` | `true` / `false` | Labels: Totals |
| `showChanges` | `true` | `true` / `false` | Labels: Changes |
| `changeLabels` | `auto` | `auto` automatic; `horizontal`; `vertical` | Labels: Direction of change labels |
| `showNet` | `true` | `true` / `false` | Labels: Net change between totals |
| `netPercent` | `false` | `true` / `false` | Labels: Net change in percent too |
| `segmentLabels` | `none` | `none` nothing; `values`; `icons` | Labels: In the totals |
| `showAxis` | `true` | `true` / `false` | Labels: Vertical axis |
| `showGrid` | `true` | `true` / `false` | Labels: Grid lines |
| `legend` | `top` | `top` above the diagram; `bottom` below the diagram; `none` | Legend: Legend |
| `totalWidth` | `52` | number, min 4, max 300 | Widths: Width of totals |
| `periodGap` | `18` | number, min 0, max 200 | Widths: Beside totals |
| `barGap` | `3` | number, min 0, max 60 | Widths: Between steps |
| `cornerRadius` | `5` | number, min 0, max 40 | Widths: Corner radius |
| `font` | (empty) | (empty) Roboto, 'RO Sans', 'RO Serif', 'Arial', 'Georgia', 'Verdana' | Text and colours: Font. Bundled fonts are embedded in exports. |
| `fontSize` | `14` | number, min 6, max 40 | Text and colours: Text size. Diagram and year names; other texts and icons scale with it. |
| `textColor` | '#2B2B2B' | hex colour | Text and colours: Text colour |
| `mutedTextColor` | '#827D75' | hex colour | Text and colours: Axis text |
| `gridColor` | '#E3DFD7' | hex colour | Text and colours: Grid colour |
| `softenColors` | `false` | `true` / `false` | Text and colours: Soften carrier colours. Draws strong colours calmer; the colours in the file stay as they are. |
| `patternStyle` | `light` | `light` light lines on the colour; `dark` dark lines on the colour; `ground` the colour on a light ground | Patterns: Draw patterns as |
| `patternSize` | `8` | number, min 3, max 60 | Patterns: Spacing |
| `patternWeight` | `28` | number, min 5, max 80 | Patterns: Line width. Of the spacing. |

## Your input

<Describe the diagram, or paste the data: for each carrier the amount at each moment (year), and which diagram it belongs to if there is more than one. Mention the unit and the title.>
