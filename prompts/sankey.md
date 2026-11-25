# Prompt: a Sankey diagram as YAML

> **How to use this file.** Paste all of it into a chat with an LLM and describe your diagram, or paste your data, under "Your input" at the end. Save the YAML it returns as a `.yaml` file and open it in the Sankey editor of the Diagram design toolkit (Open, or drop the file on the page).

You write data files for the **Sankey editor**. A Sankey diagram shows flows between nodes; the thickness of each flow is proportional to its value. Nodes sit at fixed positions that you choose, and every flow has a carrier (for example electricity or gas) that sets its colour.

Your job: turn the input at the end into **one YAML document** in the format below. The editor must open it without errors and draw a readable diagram straight away.

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
version: '2.0'
nodes: [...]      # required
links: [...]      # required: the flows
carriers: [...]   # required: one per carrier used by a flow
settings: [...]   # optional, but always set at least the title
texts: [...]      # optional: free text boxes
```

Do **not** add the keys `points`, `bars`, `flows`, `moments` or `values`: they belong to the other editors, and with them the file is sent to the wrong one.

### nodes

| key | required | meaning |
|---|---|---|
| `id` | yes | Unique ID, lowercase `snake_case` ASCII, e.g. `natural_gas`. Flows refer to it. |
| `title` | yes | Label shown next to the node. Start it with `.` to hide the label, with `_` to show only the value. |
| `x` | yes | Horizontal position of the node in pixels, a **whole number**. |
| `"y"` | yes | Vertical position of the **top** of the node in pixels, a **whole number**. |
| `direction` | yes | `right` (flows leave to the right; nearly always) or `left` (flows leave to the left, for flows that loop back). |
| `labelposition` | yes | `left` or `right` of the node. |

### links (the flows)

| key | required | meaning |
|---|---|---|
| `source` | yes | ID of the node the flow starts at. |
| `target` | yes | ID of the node the flow ends at. |
| `value` | yes | Size of the flow, a number ≥ 0. |
| `carrier` | yes | ID of a carrier in `carriers`; it sets the colour. |
| `type` | no | Only needed to keep two flows between the same two nodes apart. If you give it, flows between the same pair need different types. Usually leave it out. |
| `annotate` | no | Text shown when hovering the flow. |
| `icon` | no | Icon for this flow only (see Icons). |
| `iconposition` | no | Where its icon sits along the flow: 0 (start) to 100 (end). |
| `pattern`, `patterncolor` | no | Patterned fill for this flow only (see Patterns). |

### carriers

| key | required | meaning |
|---|---|---|
| `id` | yes | Unique ID used by the flows. |
| `color` | yes | Hex colour, quoted (see Colours). |
| `icon` | no | Icon shown on its flows (see Icons). |
| `pattern`, `patterncolor` | no | Patterned fill (see Patterns). |

### settings

A list of pairs: `- setting: <key>` with `waarde: <value>`. (`waarde` is Dutch for "value"; keep that key name.) Include only the settings that differ from their defaults; the full list is at the end. Always set `title` and `unit`.

## Placing the nodes

You choose every position, so lay the diagram out like this:

1. **Drawing area.** It is `canvasWidth / scaleCanvas` by `canvasHeight / scaleCanvas` pixels. Keep `scaleCanvas` at 1, so the drawing area is the canvas size (default 1200 × 800). Pick a larger canvas for many nodes, e.g. 1600 × 1000.
2. **Columns.** Put the nodes in columns from left to right in the order energy (or money, material…) moves: sources first, then conversions, then final uses. Every flow should run from a column to a column further right.
3. **x.** First column at `x: 160` (room for labels on its left), last column at `canvas width − 240` (room for labels on its right), the others evenly in between.
4. **Node height.** A node is `max(total in, total out) × scaleDataValue × scaleHeight` pixels tall. `scaleHeight` (pixels per unit) is the same for the whole diagram.
5. **scaleHeight.** Find the column whose nodes add up to the most, `T` (in the data's own units), with `n` nodes. Then `scaleHeight = (canvas height − 130 − 60 − 40 × (n − 1)) / T`, rounded **down** to two significant figures (e.g. 0.73 → 0.7, 0.0347 → 0.034). Set it as a setting.
6. **y.** Stack the nodes of each column from `y: 130` (below the title) downwards, with a gap of at least 40 px. The next node starts at the previous node's `y` + its height + the gap. Order nodes within a column like the nodes they connect to, so flows cross as little as possible. Shorter columns can start lower to sit opposite their partners.
7. **Labels.** `labelposition: left` for the first column, `right` for all others.
8. **Check:** within each column no two nodes overlap, and every node ends above `canvas height − 40`. All positions are whole numbers.

## Rules the editor checks

- Node IDs and carrier IDs are unique and not empty.
- Every flow has a `source`, `target`, `carrier` and numeric `value`; `source` and `target` are node IDs; its carrier is in `carriers`.
- No flow starts and ends at the same node; no negative values.
- `x` and `"y"` are whole numbers.
- A node with flows in and out should be in balance: the flows in add up to the flows out (add a `losses` node and carrier if needed).
- Every node and carrier is used.

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

Optional. Built-in names: `industry`, `buildings`, `agriculture`, `car`, `plane`, `ship`, `power-plant`, `electrolysis`, `conversion`, `refinery`, `data-centre`, `storage`, `battery`, `export`, `electricity`, `heat`, `waste-heat`, `hydrogen`, `gas`, `oil`, `crude-oil`, `coal`, `biomass`, `biofuel`, `ammonia`, `geothermal`, `ambient-heat`, `solar`, `sun`, `wind`, `nuclear`, `synthetic`, `plastic`, `waste`, `methanol`. Also `none`, or `tabler:<name>` for any icon from tabler.io/icons. Give carriers an icon when one fits.

## Patterns

Optional, for print or to mark a mix: `pattern` is one of `stripes`, `diagonal`, `diagonal-down`, `crosshatch`, `vertical`, `horizontal`, `grid`, `dots`, `rings`, `dashes`, `zigzag`, `waves`, `checks`, or `none`. `patterncolor` is a quoted hex colour for the second colour, e.g. that of the other carrier in a mix.

## Text boxes (optional)

Free texts on the canvas, for a source line or a note. List them under `texts`:

| key | meaning |
|---|---|
| `text` | The text. For several lines use a block scalar (`text: \|`) or `\n` in a double-quoted string. |
| `x`, `"y"` | Top-left corner in pixels, like the nodes. |
| `width` | Width in pixels (default 220); text wraps inside it. |
| `height` | Optional; the box grows to fit its text anyway. |
| `size` | Font size in pixels (default: the label size). |
| `weight` | `light`, `regular`, `medium` or `bold`. |
| `color` | Text colour, quoted hex. |
| `align` | `left`, `center` or `right`. |
| `background`, `border` | Optional quoted hex colours; leave out for none. |
| `visible` | `false` hides the box. |

## Complete example

Made-up numbers in PJ. Note how the positions follow the recipe: `scaleHeight` 0.7, nodes stacked from `y` 130 with 40 px gaps.

```yaml
version: '2.0'
nodes:
  - id: wind
    title: Wind
    x: 160
    "y": 130
    direction: right
    labelposition: left
  - id: solar
    title: Solar
    x: 160
    "y": 254
    direction: right
    labelposition: left
  - id: natural_gas
    title: Natural gas
    x: 160
    "y": 350
    direction: right
    labelposition: left
  - id: oil
    title: Oil
    x: 160
    "y": 600
    direction: right
    labelposition: left
  - id: power_plants
    title: Power plants
    x: 560
    "y": 160
    direction: right
    labelposition: right
  - id: losses
    title: Losses
    x: 960
    "y": 130
    direction: right
    labelposition: right
  - id: industry
    title: Industry
    x: 960
    "y": 212
    direction: right
    labelposition: right
  - id: buildings
    title: Buildings
    x: 960
    "y": 406
    direction: right
    labelposition: right
  - id: transport
    title: Transport
    x: 960
    "y": 579
    direction: right
    labelposition: right
links:
  - source: wind
    target: power_plants
    value: 120
    carrier: wind
  - source: solar
    target: power_plants
    value: 80
    carrier: solar
  - source: natural_gas
    target: power_plants
    value: 100
    carrier: gas
  - source: natural_gas
    target: industry
    value: 120
    carrier: gas
  - source: natural_gas
    target: buildings
    value: 80
    carrier: gas
  - source: oil
    target: transport
    value: 200
    carrier: oil
  - source: power_plants
    target: industry
    value: 100
    carrier: electricity
  - source: power_plants
    target: buildings
    value: 110
    carrier: electricity
  - source: power_plants
    target: transport
    value: 30
    carrier: electricity
  - source: power_plants
    target: losses
    value: 60
    carrier: losses
    annotate: Conversion losses in power plants
carriers:
  - id: wind
    color: '#7CC2A0'
    icon: wind
  - id: solar
    color: '#C9B45A'
    icon: solar
  - id: gas
    color: '#3B78B0'
    icon: gas
  - id: oil
    color: '#6B655C'
    icon: oil
  - id: electricity
    color: '#E0A93B'
    icon: electricity
  - id: losses
    color: '#B9B2A6'
settings:
  - setting: title
    waarde: Energy flows (example with made-up numbers)
  - setting: unit
    waarde: PJ
  - setting: decimalsRoundValues
    waarde: 0
  - setting: scaleHeight
    waarde: 0.7
  - setting: canvasWidth
    waarde: 1200
  - setting: canvasHeight
    waarde: 800
texts:
  - text: 'Source: made-up numbers for this example.'
    x: 60
    "y": 752
    width: 360
    size: 11
    color: '#827D75'
```

## Before you answer, check

- Every flow's `source`, `target` and `carrier` exist, spelled exactly as their IDs.
- Nodes with flows in and out are in balance.
- Positions are whole numbers, nodes in a column don't overlap, and everything fits on the canvas.
- Every hex colour is quoted.

## Settings

All settings, with their defaults. Only include the ones you change.

| setting | default | values | what it does |
|---|---|---|---|
| `canvasWidth` | `1200` | number, min 100 | Canvas: Width |
| `canvasHeight` | `800` | number, min 100 | Canvas: Height |
| `scaleCanvas` | `1` | number, min 0.1, max 5 | Canvas: Output scale. Scales the drawing inside the exported image: 0.8 draws everything at 80%. Zooming the view does not change it. |
| `backgroundColor` | '#F5F3EF' | hex colour | Canvas: Background |
| `transparentBackground` | `false` | `true` / `false` | Canvas: Transparent background. Exports without a background fill. |
| `unit` | (empty) | text | Values and scaling: Unit. Shown after every value label and in tooltips. |
| `decimalsRoundValues` | `1` | number, min 0, max 5 | Values and scaling: Decimals. Only labels are rounded. |
| `scaleDataValue` | `1` | number, min 0 | Values and scaling: Multiply values by. Converts every value before drawing and labelling, e.g. 0.2778 for PJ → TWh. The file keeps the original values. |
| `scaleHeight` | `1` | number, min 0 | Values and scaling: Pixels per unit. Flow thickness per unit. Keep it equal across diagrams so they can be compared. |
| `title` | (empty) | text | Title: Title |
| `titleFontSize` | `24` | number, min 6 | Title: Size |
| `titlePositionX` | `60` | number | Title: X |
| `titlePositionY` | `60` | number | Title: Y |
| `titleColor` | '#000000' | hex colour | Title: Colour |
| `font` | (empty) | (empty) Roboto, 'RO Sans', 'RO Serif', 'Arial', 'Helvetica', 'Georgia', 'Verdana' | Labels and font: Font. Bundled fonts are embedded in exports. |
| `labelFontSize` | `11` | number, min 6, max 40 | Labels and font: Label size |
| `labelTextColor` | '#000000' | hex colour | Labels and font: Label text |
| `labelFillColor` | '#ffffff' | hex colour | Labels and font: Label background |
| `showValueLabels` | `true` | `true` / `false` | Labels and font: Show values next to labels |
| `nodeWidth` | `4` | number, min 1, max 60 | Nodes: Node width |
| `nodeColor` | '#333333' | hex colour | Nodes: Node colour |
| `globalFlowOpacity` | `0.9` | number, min 0, max 1 | Flows: Flow opacity |
| `flowIcons` | `chosen` | `chosen` where one is chosen; `all` on all flows with a fitting one; `none` | Icons on flows: Show icons. Choose an icon for a carrier or for a single flow. The second option also adds icons to carriers with a well-known ID, such as hydrogen. |
| `flowIconSize` | `16` | number, min 6, max 80 | Icons on flows: Size |
| `flowIconPosition` | `auto` | `auto` automatic, where flows spread out; `start` near the start; `middle` in the middle; `end` near the end | Icons on flows: Place on the flow. Drag an icon to place it yourself. |
| `flowIconThin` | `badge` | `badge` in a circle; `hide` no icon | Icons on flows: On thin flows. In thick flows icons grow up to twice their size. |
| `dropShadow` | `false` | `true` / `false` | Shadow and patterns: Drop shadow. A soft shadow behind the shapes. |
| `patternStyle` | `light` | `light` light lines on the colour; `dark` dark lines on the colour; `ground` the colour on a light ground | Shadow and patterns: Draw patterns as |
| `patternSize` | `8` | number, min 3, max 60 | Shadow and patterns: Spacing |
| `patternWeight` | `28` | number, min 5, max 80 | Shadow and patterns: Line width. Of the spacing. |

## Your input

<Describe the diagram, or paste the data: a list of flows (from, to, amount, carrier), a table or numbers from a report. Mention the unit, the title, and any wishes about size, colours or order.>
