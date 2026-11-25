# Prompt: a chord diagram as YAML

> **How to use this file.** Paste all of it into a chat with an LLM and describe your diagram, or paste your data, under "Your input" at the end. Save the YAML it returns as a `.yaml` file and open it in the Chord editor of the Diagram design toolkit (Open, or drop the file on the page).

You write data files for the **Chord editor**. A chord diagram shows flows between **nodes** placed around a circle. Each node is an arc whose length is proportional to its amount, and each **flow** is a ribbon from one node to another, coloured by its **carrier** (for example electricity or gas). Nodes can be gathered in **groups**, shown as an arc around them. One file can hold several **scenarios** (for example years): each flow has an amount per scenario, and the diagram shows one scenario at a time.

Your job: turn the input at the end into **one YAML document** in the format below. The editor must open it without errors.

## Answer format

- Reply with the YAML in a single ```` ```yaml ```` code block. After the block, list in at most three short lines anything you had to assume or estimate. Nothing else.
- Use only the keys described here. Leave out optional keys you don't need instead of writing empty values.

## YAML rules

- Indent with 2 spaces. Every table is a list of mappings (`- key: value`).
- **Always quote hex colours**: `color: '#E0A93B'`. Unquoted, the `#` starts a comment and the colour is lost.
- **Always quote scenario IDs**, here and as keys under `amounts`: `id: '2030'`, `'2030': 180`.
- Quote texts that look like numbers, dates or booleans (`'yes'`, `'no'`, `'on'`, `'null'`), and texts that contain `: ` or start with `&`, `*`, `!`, `|`, `>`, `%`, `@` or a backtick. In one-line `{ … }` mappings also quote texts with a comma.
- Write the key `y` as `"y"` (some YAML readers treat a bare `y` as a boolean).
- Numbers are plain: `1234.5`. No thousands separators, no units, a dot for decimals.
- Booleans are `true` or `false`.

## Document structure

Top-level keys, in this order:

```yaml
type: chord
version: '1.0'
flows: [...]      # required
nodes: [...]      # required
groups: [...]     # optional
carriers: [...]   # required
scenarios: [...]  # required: at least one
details: [...]    # optional
settings: [...]   # optional, but always set at least the title
texts: [...]      # optional: free text boxes
```

Do **not** add a `links` key: with it the file is sent to the Sankey editor.

### scenarios

| key | required | meaning |
|---|---|---|
| `id` | yes | Unique ID, quoted, e.g. `'2030'`. It is the key of this scenario under `amounts`. Not one of `source`, `target`, `carrier`, `part`, `note`, `icon`, `pattern`, `patterncolor`, `node`, `title`. |
| `title` | yes | Shown in the subtitle when the diagram shows this scenario. |

With only one scenario, still give it a row, e.g. `id: '2024'`, `title: '2024'`.

### nodes

**The order of the rows is the order around the circle**, clockwise from the top. Keep the nodes of a group together, and put nodes that exchange a lot near each other.

| key | required | meaning |
|---|---|---|
| `id` | yes | Unique ID, lowercase `snake_case` ASCII. Flows refer to it. |
| `title` | yes | Name shown beside the node. |
| `group` | no | ID of a group in `groups`. |
| `color` | no | Quoted hex colour of its own. Otherwise it takes the colour of its carrier when all its flows have one carrier, and grey when they are mixed. |
| `icon` | no | Icon shown with its name (see Icons). |
| `label` | no | `false` draws the node without an arc and label: its flows then end at the arc of its group inside the circle. Use it for a hub such as "the electricity grid". |
| `visible` | no | `false` leaves the node and its flows out of the drawing. |

### groups (optional)

| key | required | meaning |
|---|---|---|
| `id` | yes | Unique ID used by the nodes. |
| `title` | yes | Name along the group's arc. |
| `color` | no | Quoted hex colour of the arc. |
| `place` | no | `outside` (around the nodes) or `inside` (over the flows). |

### carriers

The order of the rows is the order of the legend.

| key | required | meaning |
|---|---|---|
| `id` | yes | Unique ID used by the flows. |
| `title` | yes | Name in the legend and tooltips. |
| `color` | yes | Quoted hex colour (see Colours). |
| `icon` | no | Icon (see Icons). |
| `pattern`, `patterncolor` | no | Patterned fill (see Patterns). |
| `visible` | no | `false` leaves its flows out of the drawing. |

### flows

One row per source, target and carrier.

| key | required | meaning |
|---|---|---|
| `source` | yes | ID of the node the flow comes from. |
| `target` | yes | ID of the node the flow goes to. |
| `carrier` | yes | ID of a carrier; it sets the colour. |
| `amounts` | yes | A mapping from each scenario ID (quoted) to the amount in that scenario, a number ≥ 0. |
| `part` | no | Rows with the same source, target and carrier form one flow; give each a `part` name to list the parts in its tooltip. |
| `note` | no | Shown in the tooltip. |
| `icon`, `pattern`, `patterncolor` | no | For this flow only, instead of its carrier's. |

A flow goes one way. If a value would be negative, swap `source` and `target` instead.

### details (optional)

Small lines under a node's label, e.g. what a supply is made of.

| key | required | meaning |
|---|---|---|
| `node` | yes | ID of the node. |
| `title` | yes | The line's text. |
| `amounts` | yes | A mapping from each scenario ID (quoted) to a number. |

### settings

A list of pairs: `- setting: <key>` with `waarde: <value>`. (`waarde` is Dutch for "value"; keep that key name.) Include only the settings that differ from their defaults; the full list is at the end. Always set `title` and `unit`, and set `scenario` to the ID of the scenario to show first (quoted).

## Rules the editor checks

- Node, group, carrier and scenario IDs are unique and not empty.
- Every flow has a `source` and `target` that are node IDs, and a carrier that is in `carriers`.
- Every amount is a number; negative amounts are not drawn.
- A node's `group` is a group ID; a detail's `node` is a node ID.
- Colours are hex codes.

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
| nuclear, uranium | `'#5AB2DA'` | | methanol | `'#9A7A58'` |

For anything else, take colours in this order: `'#3B78B0'`, `'#E0A93B'`, `'#3F9A74'`, `'#7862C6'`, `'#DD8560'`, `'#0A7350'`, `'#5AB2DA'`, `'#C8586F'`, `'#8A9A2B'`, `'#6B655C'`, `'#9A6FA6'`, `'#B9B2A6'`. Skip colours already used.

## Icons

Optional. Built-in names: `industry`, `buildings`, `agriculture`, `car`, `plane`, `ship`, `power-plant`, `electrolysis`, `conversion`, `refinery`, `data-centre`, `storage`, `battery`, `export`, `electricity`, `heat`, `waste-heat`, `hydrogen`, `gas`, `oil`, `crude-oil`, `coal`, `biomass`, `biofuel`, `ammonia`, `geothermal`, `ambient-heat`, `solar`, `sun`, `wind`, `nuclear`, `synthetic`, `plastic`, `waste`, `methanol`. Also `none`, or `tabler:<name>` for any icon from tabler.io/icons. Give nodes and carriers an icon when one fits.

## Patterns

Optional, for print or to mark a mix: `pattern` is one of `stripes`, `diagonal`, `diagonal-down`, `crosshatch`, `vertical`, `horizontal`, `grid`, `dots`, `rings`, `dashes`, `zigzag`, `waves`, `checks`, or `none`. `patterncolor` is a quoted hex colour for the second colour, e.g. that of the other carrier in a mix.

## Text boxes (optional)

Free texts on the canvas, for a source line or a note. List them under `texts`:

| key | meaning |
|---|---|
| `text` | The text. For several lines use a block scalar (`text: \|`) or `\n` in a double-quoted string. |
| `x`, `"y"` | Top-left corner in pixels from the top left of the canvas (default canvas 1200 × 1050). |
| `width` | Width in pixels (default 220); text wraps inside it. |
| `height` | Optional; the box grows to fit its text anyway. |
| `size` | Font size in pixels (default: the diagram's text size). |
| `weight` | `light`, `regular`, `medium` or `bold`. |
| `color` | Text colour, quoted hex. |
| `align` | `left`, `center` or `right`. |
| `background`, `border` | Optional quoted hex colours; leave out for none. |
| `visible` | `false` hides the box. |

## Complete example

Made-up numbers in PJ for two years.

```yaml
type: chord
version: '1.0'
flows:
  - source: wind
    target: power_plants
    carrier: electricity
    amounts: { '2030': 180, '2050': 420 }
  - source: solar
    target: power_plants
    carrier: electricity
    amounts: { '2030': 110, '2050': 260 }
  - source: natural_gas
    target: power_plants
    carrier: gas
    amounts: { '2030': 160, '2050': 20 }
  - source: natural_gas
    target: industry
    carrier: gas
    amounts: { '2030': 240, '2050': 60 }
  - source: natural_gas
    target: buildings
    carrier: gas
    amounts: { '2030': 280, '2050': 40 }
  - source: oil
    target: transport
    carrier: oil
    amounts: { '2030': 380, '2050': 90 }
    note: Mostly road transport
  - source: power_plants
    target: industry
    carrier: electricity
    amounts: { '2030': 170, '2050': 300 }
  - source: power_plants
    target: buildings
    carrier: electricity
    amounts: { '2030': 210, '2050': 250 }
  - source: power_plants
    target: transport
    carrier: electricity
    amounts: { '2030': 45, '2050': 150 }
nodes:
  - { id: wind, title: Wind, group: supply, icon: wind }
  - { id: solar, title: Solar, group: supply, icon: solar }
  - { id: natural_gas, title: Natural gas, group: supply, icon: gas }
  - { id: oil, title: Oil, group: supply, icon: oil }
  - { id: power_plants, title: Power plants, group: conversion, icon: power-plant }
  - { id: industry, title: Industry, group: use, icon: industry }
  - { id: buildings, title: Buildings, group: use, icon: buildings }
  - { id: transport, title: Transport, group: use, icon: car }
groups:
  - { id: supply, title: Supply }
  - { id: conversion, title: Conversion }
  - { id: use, title: Final use }
carriers:
  - id: electricity
    title: Electricity
    color: '#E0A93B'
    icon: electricity
  - id: gas
    title: Natural gas
    color: '#3B78B0'
    icon: gas
  - id: oil
    title: Oil products
    color: '#6B655C'
    icon: oil
scenarios:
  - id: '2030'
    title: '2030'
  - id: '2050'
    title: '2050'
details:
  - node: wind
    title: Offshore
    amounts: { '2030': 130, '2050': 340 }
  - node: wind
    title: Onshore
    amounts: { '2030': 50, '2050': 80 }
settings:
  - setting: title
    waarde: Energy flows (example with made-up numbers)
  - setting: unit
    waarde: PJ
  - setting: scenario
    waarde: '2030'
```

## Before you answer, check

- Every flow's `source`, `target` and `carrier` exist, spelled exactly as their IDs.
- Every flow and detail has an amount for every scenario, under the quoted scenario ID.
- Nodes are in a sensible order around the circle, with the nodes of a group together.
- Every hex colour and every scenario ID is quoted.

## Settings

All settings, with their defaults. Only include the ones you change.

| setting | default | values | what it does |
|---|---|---|---|
| `canvasWidth` | `1200` | number, min 100 | Canvas: Width |
| `canvasHeight` | `1050` | number, min 100 | Canvas: Height |
| `scaleCanvas` | `1` | number, min 0.1, max 5 | Canvas: Output scale. Scales the drawing inside the exported image: 0.8 draws everything at 80%. Zooming the view does not change it. |
| `margin` | `60` | number, min 0, max 400 | Canvas: Margin |
| `backgroundColor` | '#F5F3EF' | hex colour | Canvas: Background |
| `transparentBackground` | `false` | `true` / `false` | Canvas: Transparent background. Exports without a background fill. |
| `title` | (empty) | text | Title: Title |
| `subtitle` | (empty) | text | Title: Subtitle |
| `showScenario` | `true` | `true` / `false` | Title: Name of the scenario in the subtitle |
| `titleFontSize` | `24` | number, min 6 | Title: Size |
| `subtitleFontSize` | `15` | number, min 6 | Title: Subtitle size |
| `titlePositionX` | `60` | number | Title: X |
| `titlePositionY` | `60` | number | Title: Y |
| `titleColor` | '#2B2B2B' | hex colour | Title: Colour |
| `scenario` | (empty) | text | Scenario: Show |
| `scaleMode` | `largest` | `shown` the total that is shown; `largest` the total of the largest scenario; `fixed` a fixed amount | Values and scale: A full circle is. Use the same amount in several diagrams to compare them. A smaller total leaves part of the circle empty. |
| `fullCircle` | `1000` | number, min 0.000001 | Values and scale: Amount of a full circle |
| `multiply` | `1` | number | Values and scale: Multiply values by. For unit conversion. 0.27778 turns PJ into TWh. |
| `unit` | (empty) | text | Values and scale: Unit |
| `decimals` | `auto` | `auto` automatic; `0`; `1`; `2`; `3` | Values and scale: Decimals |
| `spacing` | `spread` | `spread` between groups; `compact` at the end | Circle: Empty space |
| `radius` | `0` | number, min 0, max 5000 | Circle: Radius. 0 is as large as fits. |
| `rotation` | `0` | number, min -360, max 360 | Circle: Rotation |
| `offsetX` | `0` | number | Circle: Move right |
| `offsetY` | `0` | number | Circle: Move down |
| `groupGap` | `7` | number, min 0, max 90 | Circle: Between groups |
| `nodeGap` | `1.2` | number, min 0, max 45 | Circle: Between nodes |
| `showDisc` | `true` | `true` / `false` | Circle: Disc behind the flows |
| `discColor` | '#FFFFFF' | hex colour | Circle: Disc colour |
| `ribbonOrder` | `untangled` | `untangled` by where they go, with few crossings; `carrier` by carrier; `size` largest first | Flows: Order along a node |
| `flowOpacity` | `0.6` | number, min 0.05, max 1 | Flows: Opacity |
| `bend` | `70` | number, min 0, max 100 | Flows: Bend to the centre |
| `arrows` | `true` | `true` / `false` | Flows: Arrow heads |
| `flowLabels` | `none` | `none` nothing; `values`; `icons` | Flows: On flows. Where they fit. |
| `nodeWidth` | `7` | number, min 0, max 100 | Nodes and groups: Width of nodes |
| `nodeColor` | '#B9B2A6' | hex colour | Nodes and groups: Colour of mixed nodes. Nodes with flows of one carrier take its colour. |
| `showGroups` | `true` | `true` / `false` | Nodes and groups: Arcs of groups |
| `groupPlace` | `outside` | `outside` outside the circle; `inside` inside, over the flows | Nodes and groups: Place of groups |
| `groupWidth` | `28` | number, min 4, max 200 | Nodes and groups: Width of groups |
| `groupColor` | '#FFFFFF' | hex colour | Nodes and groups: Colour of groups |
| `groupBorder` | `true` | `true` / `false` | Nodes and groups: Border around groups |
| `cornerRadius` | `4` | number, min 0, max 40 | Nodes and groups: Corner radius |
| `showNames` | `true` | `true` / `false` | Labels: Names of nodes |
| `showValues` | `true` | `true` / `false` | Labels: Amounts of nodes |
| `nodeAmount` | `larger` | `larger` the larger of what goes in and out; `sum` in and out together; `out` what goes out; `in` what comes in | Labels: Amount of a node |
| `showDetails` | `true` | `true` / `false` | Labels: Details under them |
| `nodeIcons` | `true` | `true` / `false` | Labels: Icons of nodes |
| `showGroupNames` | `true` | `true` / `false` | Labels: Names of groups |
| `colorValues` | `true` | `true` / `false` | Labels: Amounts in the colour of their carrier |
| `markerLines` | `auto` | `auto` where a label had to move; `always`; `never` | Labels: Lines to labels |
| `labelDistance` | `16` | number, min 0, max 400 | Labels: Distance |
| `labelWidth` | `180` | number, min 40, max 800 | Labels: Widest label |
| `legend` | `top` | `top` above the diagram; `bottom` below the diagram; `none` | Legend: Legend |
| `font` | (empty) | (empty) Roboto, 'RO Sans', 'RO Serif', 'Arial', 'Georgia', 'Verdana' | Text and colours: Font. Bundled fonts are embedded in exports. |
| `fontSize` | `14` | number, min 6, max 40 | Text and colours: Text size. Node names; other texts and icons scale with it. |
| `textColor` | '#2B2B2B' | hex colour | Text and colours: Text colour |
| `mutedTextColor` | '#827D75' | hex colour | Text and colours: Details colour |
| `softenColors` | `false` | `true` / `false` | Text and colours: Soften carrier colours. Draws strong colours calmer; the colours in the file stay as they are. |
| `dropShadow` | `false` | `true` / `false` | Shadow and patterns: Drop shadow. A soft shadow behind the shapes. |
| `patternStyle` | `light` | `light` light lines on the colour; `dark` dark lines on the colour; `ground` the colour on a light ground | Shadow and patterns: Draw patterns as |
| `patternSize` | `8` | number, min 3, max 60 | Shadow and patterns: Spacing |
| `patternWeight` | `28` | number, min 5, max 80 | Shadow and patterns: Line width. Of the spacing. |

## Your input

<Describe the diagram, or paste the data: a list of flows (from, to, carrier, amount per scenario). Mention groups of nodes, the scenarios (years), the unit and the title.>
