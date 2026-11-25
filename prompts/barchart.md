# Prompt: a bar chart as YAML

> **How to use this file.** Paste all of it into a chat with an LLM and describe your chart, or paste your data, under "Your input" at the end. Save the YAML it returns as a `.yaml` file and open it in the Bar chart editor of the Diagram design toolkit (Open, or drop the file on the page).

You write data files for the **Bar chart editor**. Each **bar** has an amount per **series** (for example per energy carrier). The series can be stacked, set side by side, or stacked to 100%, in vertical or horizontal bars. Bars can be gathered in **groups**, for example per year, and can carry icons.

Your job: turn the input at the end into **one YAML document** in the format below. The editor must open it without errors.

## Answer format

- Reply with the YAML in a single ```` ```yaml ```` code block. After the block, list in at most three short lines anything you had to assume or estimate. Nothing else.
- Use only the keys described here. Leave out optional keys you don't need instead of writing empty values.

## YAML rules

- Indent with 2 spaces. Every table is a list of mappings (`- key: value`).
- **Always quote hex colours**: `color: '#E0A93B'`. Unquoted, the `#` starts a comment and the colour is lost.
- Quote IDs, group names and texts that look like numbers, dates or booleans (`'2030'`, `'yes'`, `'no'`, `'on'`, `'null'`), and texts that contain `: ` or start with `&`, `*`, `!`, `|`, `>`, `%`, `@` or a backtick. In one-line `{ … }` mappings also quote texts with a comma.
- Write the key `y` as `"y"` (some YAML readers treat a bare `y` as a boolean).
- Numbers are plain: `1234.5`. No thousands separators, no units, a dot for decimals.
- Booleans are `true` or `false`.

## Document structure

Top-level keys, in this order:

```yaml
type: barchart
version: '1.0'
bars: [...]       # required
series: [...]     # required
settings: [...]   # optional, but always set at least the title
texts: [...]      # optional: free text boxes
```

### series

**The order of the rows is the order of stacking** (first at the base) and of the legend.

| key | required | meaning |
|---|---|---|
| `id` | yes | Unique ID, lowercase `snake_case` ASCII, e.g. `electricity`. It is the **key of this series under each bar's `amounts`**. It may not be one of the bar keys: `title`, `group`, `icon`, `color`, `pattern`, `patterncolor`, `visible`, `note`, `bar`, `name`, `label`, `naam`, and may not end in `_icon`, `_pattern` or `_patterncolor`. |
| `title` | yes | Name in the legend and tooltips. |
| `color` | yes | Quoted hex colour (see Colours). |
| `icon` | no | Icon shown in its parts of the bars, where it fits (see Icons). |
| `pattern`, `patterncolor` | no | Patterned fill (see Patterns). |
| `visible` | no | `false` leaves the series out of the drawing. |

### bars

In the order they are drawn (within each group, unless the `order` setting sorts them).

| key | required | meaning |
|---|---|---|
| `title` | yes | Name of the bar. |
| `group` | no | Bars with the same group are drawn together under its name, e.g. `'2030'` or `Region north`. |
| `amounts` | yes | A mapping from series ID to the amount of that series in this bar, a number. Leave out a series, or give 0, where it has none. |
| `icon` | no | Icon of the bar, shown with its name (see Icons). |
| `color` | no | For a chart with a single series only: a colour for this bar. |
| `pattern`, `patterncolor` | no | A pattern for all parts of this bar. |
| `<series id>_icon`, `<series id>_pattern`, `<series id>_patterncolor` | no | An icon or pattern for one part of this bar, instead of its series'. |
| `note` | no | Shown in the tooltip. |
| `visible` | no | `false` leaves the bar out of the drawing. |

### settings

A list of pairs: `- setting: <key>` with `waarde: <value>`. (`waarde` is Dutch for "value"; keep that key name.) Include only the settings that differ from their defaults; the full list is at the end. Always set `title` and `unit`. The most important choices:

- `orientation`: `vertical` (default) or `horizontal`. Use horizontal for long bar names or many bars.
- `mode`: `stacked` (default), `grouped` (series side by side) or `share` (stacked to 100%).
- `order`: `listed` (default), `largest` or `smallest`, within each group.

## Rules the editor checks

- Series IDs are unique, not empty, and not a bar key (see above).
- Every amount is a number. Negative amounts are allowed but unusual; avoid them in `share` mode.
- Every bar has a title.
- Colours are hex codes.

## Colours

Use these colours for series with a known meaning, so charts across the toolkit match:

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

Optional. Built-in names: `industry`, `buildings`, `agriculture`, `car`, `plane`, `ship`, `power-plant`, `electrolysis`, `conversion`, `refinery`, `data-centre`, `storage`, `battery`, `export`, `electricity`, `heat`, `waste-heat`, `hydrogen`, `gas`, `oil`, `crude-oil`, `coal`, `biomass`, `biofuel`, `ammonia`, `geothermal`, `ambient-heat`, `solar`, `sun`, `wind`, `nuclear`, `synthetic`, `plastic`, `waste`, `methanol`. Also `none`, or `tabler:<name>` for any icon from tabler.io/icons. Give bars and series an icon when one fits.

## Patterns

Optional, for print or to mark a mix: `pattern` is one of `stripes`, `diagonal`, `diagonal-down`, `crosshatch`, `vertical`, `horizontal`, `grid`, `dots`, `rings`, `dashes`, `zigzag`, `waves`, `checks`, or `none`. `patterncolor` is a quoted hex colour for the second colour, e.g. that of the other series in a mix.

## Text boxes (optional)

Free texts on the canvas, for a source line or a note. List them under `texts`:

| key | meaning |
|---|---|
| `text` | The text. For several lines use a block scalar (`text: \|`) or `\n` in a double-quoted string. |
| `x`, `"y"` | Top-left corner in pixels from the top left of the canvas (default canvas 1200 × 800). |
| `width` | Width in pixels (default 220); text wraps inside it. |
| `height` | Optional; the box grows to fit its text anyway. |
| `size` | Font size in pixels (default: the diagram's text size). |
| `weight` | `light`, `regular`, `medium` or `bold`. |
| `color` | Text colour, quoted hex. |
| `align` | `left`, `center` or `right`. |
| `background`, `border` | Optional quoted hex colours; leave out for none. |
| `visible` | `false` hides the box. |

## Complete example

Made-up numbers in PJ: four sectors in two years, stacked by carrier.

```yaml
type: barchart
version: '1.0'
bars:
  - title: Industry
    group: '2030'
    amounts: { electricity: 190, heat: 80, hydrogen: 20, gas: 230, oil: 190 }
    icon: industry
  - title: Buildings
    group: '2030'
    amounts: { electricity: 215, heat: 60, hydrogen: 0, gas: 260, oil: 10 }
    icon: buildings
  - title: Transport
    group: '2030'
    amounts: { electricity: 55, heat: 0, hydrogen: 8, gas: 6, oil: 330 }
    icon: car
  - title: Agriculture
    group: '2030'
    amounts: { electricity: 48, heat: 30, hydrogen: 0, gas: 82, oil: 8 }
    icon: agriculture
  - title: Industry
    group: '2050'
    amounts: { electricity: 320, heat: 110, hydrogen: 120, gas: 60, oil: 40 }
    icon: industry
  - title: Buildings
    group: '2050'
    amounts: { electricity: 300, heat: 120, hydrogen: 0, gas: 40, oil: 0 }
    icon: buildings
  - title: Transport
    group: '2050'
    amounts: { electricity: 210, heat: 0, hydrogen: 40, gas: 0, oil: 90 }
    icon: car
    note: Remaining oil is mostly aviation and shipping
  - title: Agriculture
    group: '2050'
    amounts: { electricity: 80, heat: 45, hydrogen: 0, gas: 20, oil: 0 }
    icon: agriculture
series:
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
  - id: oil
    title: Oil products
    color: '#6B655C'
    icon: oil
settings:
  - setting: title
    waarde: Energy use per sector (example with made-up numbers)
  - setting: subtitle
    waarde: Final use by carrier
  - setting: unit
    waarde: PJ
  - setting: orientation
    waarde: vertical
  - setting: mode
    waarde: stacked
```

## Before you answer, check

- Every key under `amounts` is a series ID, spelled exactly the same.
- No series ID is a bar key such as `title`, `group`, `icon` or `note`.
- Group names that are years are quoted.
- Every hex colour is quoted.

## Settings

All settings, with their defaults. Only include the ones you change.

| setting | default | values | what it does |
|---|---|---|---|
| `canvasWidth` | `1200` | number, min 100 | Canvas: Width |
| `canvasHeight` | `800` | number, min 100 | Canvas: Height |
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
| `orientation` | `vertical` | `vertical`; `horizontal` | Chart: Bars |
| `mode` | `stacked` | `stacked`; `grouped` side by side; `share` to 100% | Chart: Series |
| `order` | `listed` | `listed` as listed; `largest` largest first; `smallest` smallest first | Chart: Order. Within each group. |
| `scaleMode` | `fit` | `fit` fill the canvas; `fixed` fixed pixels per unit | Values and scale: Length. Use the same fixed scale in several charts to compare them. |
| `pxPerUnit` | `1` | number, min 0.000001 | Values and scale: Pixels per unit |
| `axisMax` | `0` | number, min 0 | Values and scale: End of the axis. 0 ends it at the longest bar. Longer bars always extend it. |
| `multiply` | `1` | number | Values and scale: Multiply values by. For unit conversion. 0.27778 turns PJ into TWh. |
| `unit` | (empty) | text | Values and scale: Unit |
| `decimals` | `auto` | `auto` automatic; `0`; `1`; `2`; `3` | Values and scale: Decimals |
| `barIcons` | `axis` | `axis` with its name; `inside` in the bar, at its start; `end` at the end of the bar; `none` | Icons: Icons of bars. Bars side by side always have them with the name. |
| `seriesIcons` | `true` | `true` / `false` | Icons: Icons of series in the bars. Shown where they fit. |
| `iconSize` | `24` | number, min 8, max 120 | Icons: Largest size |
| `showTotals` | `true` | `true` / `false` | Labels: Amount at the end of bars |
| `showValues` | `false` | `true` / `false` | Labels: Values in the bars |
| `showShares` | `false` | `true` / `false` | Labels: Shares in the bars. Of the bar’s total. Texts and icons show where they fit. |
| `showNames` | `true` | `true` / `false` | Labels: Names of bars |
| `nameAngle` | `auto` | `auto` automatic; `horizontal`; `slanted` | Labels: Names under vertical bars |
| `showGroupNames` | `true` | `true` / `false` | Labels: Names of groups |
| `showAxis` | `true` | `true` / `false` | Labels: Value axis |
| `showGrid` | `true` | `true` / `false` | Labels: Grid lines |
| `axisTitle` | (empty) | text | Labels: Axis title |
| `legend` | `top` | `top` above the chart; `bottom` below the chart; `none` | Legend: Legend. Not shown for a single series. |
| `barSize` | `62` | number, min 5, max 100 | Bars: Bar width |
| `maxBar` | `64` | number, min 2, max 400 | Bars: At most |
| `groupGap` | `36` | number, min 0, max 300 | Bars: Between groups |
| `seriesGap` | `2` | number, min 0, max 40 | Bars: Between series |
| `cornerRadius` | `5` | number, min 0, max 60 | Bars: Corner radius |
| `showTracks` | `false` | `true` / `false` | Bars: Track behind the bars |
| `font` | (empty) | (empty) Roboto, 'RO Sans', 'RO Serif', 'Arial', 'Georgia', 'Verdana' | Text and colours: Font. Bundled fonts are embedded in exports. |
| `fontSize` | `14` | number, min 6, max 40 | Text and colours: Text size. Bar names; other texts scale with it. |
| `textColor` | '#2B2B2B' | hex colour | Text and colours: Text colour |
| `mutedTextColor` | '#827D75' | hex colour | Text and colours: Axis text |
| `gridColor` | '#E3DFD7' | hex colour | Text and colours: Grid colour |
| `softenColors` | `false` | `true` / `false` | Text and colours: Soften colours. Draws strong colours calmer; the colours in the file stay as they are. |
| `dropShadow` | `false` | `true` / `false` | Shadow and patterns: Drop shadow. A soft shadow behind the shapes. |
| `patternStyle` | `light` | `light` light lines on the colour; `dark` dark lines on the colour; `ground` the colour on a light ground | Shadow and patterns: Draw patterns as |
| `patternSize` | `8` | number, min 3, max 60 | Shadow and patterns: Spacing |
| `patternWeight` | `28` | number, min 5, max 80 | Shadow and patterns: Line width. Of the spacing. |

## Your input

<Describe the chart, or paste the data: a table with a row per bar and a column per series. Mention groups, the unit, the title, and whether the bars should be stacked, side by side or to 100%, vertical or horizontal.>
