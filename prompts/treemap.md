# Prompt: a treemap as YAML

> **How to use this file.** Paste all of it into a chat with an LLM and describe your diagram, or paste your data, under "Your input" at the end. Save the YAML it returns as a `.yaml` file and open it in the Treemap editor of the Diagram design toolkit (Open, or drop the file on the page).

You write data files for the **Treemap editor**. A treemap shows what totals are made up of. Each **block** (for example a sector) is a rectangle split into **tiles**, one per **carrier** (for example electricity or gas). Every area is on one scale: a tile's area is proportional to its value. Blocks can be gathered in **groups** that are drawn together under the group's name.

Your job: turn the input at the end into **one YAML document** in the format below. The editor must open it without errors.

## Answer format

- Reply with the YAML in a single ```` ```yaml ```` code block. After the block, list in at most three short lines anything you had to assume or estimate. Nothing else.
- Use only the keys described here. Leave out optional keys you don't need instead of writing empty values.

## YAML rules

- Indent with 2 spaces. Every table is a list of mappings (`- key: value`).
- **Always quote hex colours**: `color: '#E0A93B'`. Unquoted, the `#` starts a comment and the colour is lost.
- Quote IDs and texts that look like numbers, dates or booleans (`'2030'`, `'yes'`, `'no'`, `'on'`, `'null'`), and texts that contain `: ` or start with `&`, `*`, `!`, `|`, `>`, `%`, `@` or a backtick. In one-line `{ … }` mappings also quote texts with a comma.
- Write the key `y` as `"y"` (some YAML readers treat a bare `y` as a boolean).
- Numbers are plain: `1234.5`. No thousands separators, no units, a dot for decimals.
- Booleans are `true` or `false`.

## Document structure

Top-level keys, in this order:

```yaml
type: treemap
version: '1.0'
blocks: [...]     # required
values: [...]     # required
carriers: [...]   # required
settings: [...]   # optional, but always set at least the title
texts: [...]      # optional: free text boxes
```

Do **not** add a `moments` key: with it the file is sent to the waterfall editor.

### blocks

The order of the rows is the order in the drawing.

| key | required | meaning |
|---|---|---|
| `id` | yes | Unique ID, lowercase `snake_case` ASCII, e.g. `industry`. Values refer to it. |
| `title` | yes | Name shown above the block. |
| `group` | no | Blocks with the same group are drawn together under this name, e.g. `Final use`. |
| `icon` | no | Icon shown with the block's name (see Icons). |
| `visible` | no | `false` leaves the block out of the drawing. |

### carriers

The order of the rows is the order of the tiles and of the legend.

| key | required | meaning |
|---|---|---|
| `id` | yes | Unique ID used by the values. |
| `title` | yes | Name in the legend and tooltips. |
| `color` | yes | Quoted hex colour (see Colours). |
| `icon` | no | Icon shown on its tiles (see Icons). |
| `pattern`, `patterncolor` | no | Patterned fill (see Patterns). |

### values

One row per block and carrier.

| key | required | meaning |
|---|---|---|
| `block` | yes | ID of a block. |
| `carrier` | yes | ID of a carrier. |
| `value` | yes | The amount, a number ≥ 0. |
| `part` | no | Rows with the same block and carrier form one tile; give each a `part` name to list the parts in the tile's tooltip. |
| `note` | no | Shown in the tooltip. |
| `icon`, `pattern`, `patterncolor` | no | For this tile only, instead of its carrier's. |

Leave out combinations that are zero.

### settings

A list of pairs: `- setting: <key>` with `waarde: <value>`. (`waarde` is Dutch for "value"; keep that key name.) Include only the settings that differ from their defaults; the full list is at the end. Always set `title` and `unit`.

## Rules the editor checks

- Block and carrier IDs are unique and not empty.
- Every value has a `block` and `carrier` that exist, and a numeric amount that is not negative.
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

Optional. Built-in names: `industry`, `buildings`, `agriculture`, `car`, `plane`, `ship`, `power-plant`, `electrolysis`, `conversion`, `refinery`, `data-centre`, `storage`, `battery`, `export`, `electricity`, `heat`, `waste-heat`, `hydrogen`, `gas`, `oil`, `crude-oil`, `coal`, `biomass`, `biofuel`, `ammonia`, `geothermal`, `ambient-heat`, `solar`, `sun`, `wind`, `nuclear`, `synthetic`, `plastic`, `waste`, `methanol`. Also `none`, or `tabler:<name>` for any icon from tabler.io/icons. Give blocks and carriers an icon when one fits.

## Patterns

Optional, for print or to mark a mix: `pattern` is one of `stripes`, `diagonal`, `diagonal-down`, `crosshatch`, `vertical`, `horizontal`, `grid`, `dots`, `rings`, `dashes`, `zigzag`, `waves`, `checks`, or `none`. `patterncolor` is a quoted hex colour for the second colour, e.g. that of the other carrier in a mix.

## Text boxes (optional)

Free texts on the canvas, for a source line or a note. List them under `texts`:

| key | meaning |
|---|---|
| `text` | The text. For several lines use a block scalar (`text: \|`) or `\n` in a double-quoted string. |
| `x`, `"y"` | Top-left corner in pixels from the top left of the canvas (default canvas 1200 × 900). |
| `width` | Width in pixels (default 220); text wraps inside it. |
| `height` | Optional; the box grows to fit its text anyway. |
| `size` | Font size in pixels (default: the diagram's text size). |
| `weight` | `light`, `regular`, `medium` or `bold`. |
| `color` | Text colour, quoted hex. |
| `align` | `left`, `center` or `right`. |
| `background`, `border` | Optional quoted hex colours; leave out for none. |
| `visible` | `false` hides the box. |

## Complete example

Made-up numbers in PJ.

```yaml
type: treemap
version: '1.0'
blocks:
  - id: industry
    title: Industry
    group: Final use
    icon: industry
  - id: buildings
    title: Buildings
    group: Final use
    icon: buildings
  - id: transport
    title: Transport
    group: Final use
    icon: car
  - id: power_generation
    title: Power generation
    group: Conversion (input)
    icon: power-plant
values:
  - { block: industry, carrier: electricity, value: 170 }
  - { block: industry, carrier: heat, value: 65 }
  - { block: industry, carrier: hydrogen, value: 30 }
  - { block: industry, carrier: gas, value: 240 }
  - { block: industry, carrier: oil, value: 60 }
  - { block: buildings, carrier: electricity, value: 210 }
  - { block: buildings, carrier: heat, value: 70 }
  - { block: buildings, carrier: gas, value: 280 }
  - { block: transport, carrier: electricity, value: 45 }
  - { block: transport, carrier: biomass, value: 35, note: Biofuels blended into petrol and diesel }
  - { block: transport, carrier: oil, value: 380 }
  - { block: power_generation, carrier: gas, value: 260 }
  - { block: power_generation, carrier: biomass, value: 60 }
  - { block: power_generation, carrier: coal, value: 40, part: Hard coal }
  - { block: power_generation, carrier: coal, value: 15, part: Lignite }
carriers:
  - id: electricity
    title: Electricity
    color: '#E0A93B'
    icon: electricity
  - id: heat
    title: Heat
    color: '#C8586F'
    icon: heat
  - id: hydrogen
    title: Hydrogen
    color: '#7862C6'
    icon: hydrogen
  - id: gas
    title: Natural gas
    color: '#3B78B0'
    icon: gas
  - id: biomass
    title: Biomass
    color: '#3F9A74'
    icon: biomass
  - id: oil
    title: Oil products
    color: '#6B655C'
    icon: oil
  - id: coal
    title: Coal
    color: '#4A4641'
    icon: coal
settings:
  - setting: title
    waarde: Energy use per sector (example with made-up numbers)
  - setting: unit
    waarde: PJ
```

Values may be written on one line each, as here, or as ordinary indented mappings.

## Before you answer, check

- Every value's `block` and `carrier` exist, spelled exactly as their IDs.
- No value is negative.
- Every hex colour is quoted.

## Settings

All settings, with their defaults. Only include the ones you change.

| setting | default | values | what it does |
|---|---|---|---|
| `canvasWidth` | `1200` | number, min 100 | Canvas: Width |
| `canvasHeight` | `900` | number, min 100 | Canvas: Height |
| `scaleCanvas` | `1` | number, min 0.1, max 5 | Canvas: Output scale. Scales the drawing inside the exported image: 0.8 draws everything at 80%. Zooming the view does not change it. |
| `margin` | `60` | number, min 0, max 400 | Canvas: Margin |
| `backgroundColor` | '#F5F3EF' | hex colour | Canvas: Background |
| `transparentBackground` | `false` | `true` / `false` | Canvas: Transparent background. Exports without a background fill. |
| `title` | (empty) | text | Title: Title |
| `titleFontSize` | `24` | number, min 6 | Title: Size |
| `titlePositionX` | `60` | number | Title: X |
| `titlePositionY` | `60` | number | Title: Y |
| `titleColor` | '#2B2B2B' | hex colour | Title: Colour |
| `view` | `block` | `block` per block, split by carrier; `carrier` per carrier, split by block | View: Show |
| `chart` | `treemap` | `treemap` treemaps; `bars` stacked bars | View: Draw blocks as. Bars run along the longer side of each block. |
| `order` | `listed` | `listed` as listed; `size` largest first | View: Order. As listed keeps blocks in the same place when values change. |
| `scaleMode` | `fit` | `fit` fill the canvas; `fixed` fixed area per unit | Values and scale: Area. Use the same fixed area in several diagrams to compare them. |
| `areaPerUnit` | `100` | number, min 0.000001 | Values and scale: Area per unit |
| `multiply` | `1` | number | Values and scale: Multiply values by. For unit conversion. 0.27778 turns PJ into TWh. |
| `unit` | (empty) | text | Values and scale: Unit |
| `decimals` | `auto` | `auto` automatic; `0`; `1`; `2`; `3` | Values and scale: Decimals |
| `showGroupLabels` | `true` | `true` / `false` | Labels: Group names |
| `showGroupTotals` | `true` | `true` / `false` | Labels: Group totals |
| `showBlockTotals` | `true` | `true` / `false` | Labels: Block totals |
| `showBlockIcons` | `true` | `true` / `false` | Labels: Block icons |
| `tileIcons` | `true` | `true` / `false` | Labels: Icons on tiles |
| `tileNames` | `false` | `true` / `false` | Labels: Names on tiles |
| `tileValues` | `false` | `true` / `false` | Labels: Values on tiles |
| `tileShares` | `false` | `true` / `false` | Labels: Shares on tiles. Of the block’s total. Texts and icons show where they fit. |
| `legend` | `top` | `top` above the diagram; `bottom` below the diagram; `none` | Legend: Legend |
| `groupGap` | `44` | number, min 0, max 300 | Spacing: Between groups |
| `blockGap` | `20` | number, min 0, max 200 | Spacing: Between blocks |
| `tileGap` | `0` | number, min 0, max 20 | Spacing: Between tiles |
| `cornerRadius` | `7` | number, min 0, max 60 | Spacing: Corner radius |
| `font` | (empty) | (empty) Roboto, 'RO Sans', 'RO Serif', 'Arial', 'Georgia', 'Verdana' | Text and colours: Font. Bundled fonts are embedded in exports. |
| `fontSize` | `14` | number, min 6, max 40 | Text and colours: Text size. Block names; other texts and icons scale with it. |
| `textColor` | '#2B2B2B' | hex colour | Text and colours: Text colour |
| `mutedTextColor` | '#8F8A82' | hex colour | Text and colours: Totals colour |
| `softenColors` | `false` | `true` / `false` | Text and colours: Soften carrier colours. Draws strong colours calmer; the colours in the file stay as they are. |
| `dropShadow` | `false` | `true` / `false` | Shadow and patterns: Drop shadow. A soft shadow behind the shapes. |
| `patternStyle` | `light` | `light` light lines on the colour; `dark` dark lines on the colour; `ground` the colour on a light ground | Shadow and patterns: Draw patterns as |
| `patternSize` | `8` | number, min 3, max 60 | Shadow and patterns: Spacing |
| `patternWeight` | `28` | number, min 5, max 80 | Shadow and patterns: Line width. Of the spacing. |

## Your input

<Describe the diagram, or paste the data: for each block (sector, region, …) the amounts per carrier. Mention groups of blocks, the unit and the title.>
