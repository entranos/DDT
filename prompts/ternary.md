# Prompt: a ternary diagram as YAML

> **How to use this file.** Paste all of it into a chat with an LLM and describe your diagram, or paste your data, under "Your input" at the end. Save the YAML it returns as a `.yaml` file and open it in the Ternary editor of the Diagram design toolkit (Open, or drop the file on the page).

You write data files for the **Ternary editor**. A ternary diagram shows a mix of three shares that add up to 100%, for example an energy mix of bio, electrons and fossil. Each corner of the triangle stands for one share. A **series** is a trajectory through the triangle: one **point** per year, joined by a line.

Your job: turn the input at the end into **one YAML document** in the format below. The editor must open it without errors.

## Answer format

- Reply with the YAML in a single ```` ```yaml ```` code block. After the block, list in at most three short lines anything you had to assume or estimate. Nothing else.
- Use only the keys described here. Leave out optional keys you don't need instead of writing empty values.

## YAML rules

- Indent with 2 spaces. Every table is a list of mappings (`- key: value`).
- **Always quote hex colours**: `color: '#1F3F66'`. Unquoted, the `#` starts a comment and the colour is lost.
- Quote texts that look like numbers, dates or booleans (`'yes'`, `'no'`, `'on'`, `'null'`), and texts that contain `: ` or start with `&`, `*`, `!`, `|`, `>`, `%`, `@` or a backtick. In one-line `{ … }` mappings also quote texts with a comma.
- Write the key `y` as `"y"` (some YAML readers treat a bare `y` as a boolean).
- Numbers are plain: `1234.5`. No thousands separators, no units, a dot for decimals.
- Booleans are `true` or `false`.

## Document structure

Top-level keys, in this order:

```yaml
type: ternary
version: '1.0'
axes: [...]       # required: exactly three corners
series: [...]     # required
points: [...]     # required
settings: [...]   # optional, but always set at least the title
texts: [...]      # optional: free text boxes
```

### axes (the three corners)

Exactly three rows, one per corner.

| key | required | meaning |
|---|---|---|
| `id` | yes | Unique ID, lowercase `snake_case` ASCII, e.g. `electrons`. It is the **key of this share in every point**. |
| `label` | yes | Name shown at the corner. |
| `corner` | yes | `left` (top left), `right` (top right) or `bottom`. Each corner once. |
| `low` | no | Text at the start of this share's direction arrow, e.g. `Few electrons`. |
| `high` | no | Text at the end of the arrow, e.g. `Many electrons`. |

### series (the trajectories)

The order of the rows is the order in the legend.

| key | required | meaning |
|---|---|---|
| `id` | yes | Unique ID, lowercase `snake_case`. Points refer to it. |
| `title` | yes | Name in the legend and tooltips. |
| `group` | no | Series with the same group share a colour family and a heading in the legend, e.g. `Scenarios`. |
| `color` | no | Quoted hex colour. Leave it out to get a shade of the group's colour family; give one to make a series stand apart (history in grey, the main path in dark blue). |
| `style` | no | `solid` (default) or `dashed`. Use `dashed` for history. |
| `highlight` | no | `true` draws the line heavier with year labels. Highlight one or two series at most. |
| `visible` | no | `false` leaves the series out of the drawing. |

### points

One row per series and year.

| key | required | meaning |
|---|---|---|
| `series` | yes | ID of a series. |
| `year` | yes | The year, a number. It is also the point's label and its place along the line. |
| one key per corner ID | yes | The amount of that share, a number ≥ 0, in any unit (PJ, %, …). Each point is scaled so its three shares make 100%, so the unit only needs to be the same within a point. |

When scenarios start where history ends, give each scenario a point in that year with the same values, so the lines connect.

### settings

A list of pairs: `- setting: <key>` with `waarde: <value>`. (`waarde` is Dutch for "value"; keep that key name.) Include only the settings that differ from their defaults; the full list is at the end. Always set `title`, and `unit` when the amounts have one (it is shown with totals in tooltips).

## Rules the editor checks

- There are exactly three axes, one per corner, with unique, non-empty IDs.
- Series IDs are unique and not empty.
- Every point belongs to an existing series and has a numeric, non-negative value for all three corner IDs; not all three are zero.
- Every point has a numeric year; a series has one point per year.

## Colours

Leave series colours out unless a series needs its own. Good choices: history `'#8C8479'` (warm grey), a central path `'#1F3F66'` (dark blue). For one series per meaning, use: electricity `'#E0A93B'`, hydrogen `'#7862C6'`, heat `'#C8586F'`, methane `'#3B78B0'`, biomass `'#3F9A74'`, synthetic fuels `'#DD8560'`, nuclear `'#5AB2DA'`, wind `'#7CC2A0'`, oil `'#6B655C'`. Otherwise take colours in this order: `'#3B78B0'`, `'#E0A93B'`, `'#3F9A74'`, `'#7862C6'`, `'#DD8560'`, `'#0A7350'`, `'#5AB2DA'`, `'#C8586F'`.

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
type: ternary
version: '1.0'
axes:
  - id: bio
    label: Bio & other
    corner: left
    low: Little bio & other
    high: Much bio & other
  - id: electrons
    label: Electrons
    corner: right
    low: Few electrons
    high: Many electrons
  - id: fossil
    label: Fossil
    corner: bottom
    low: Little fossil
    high: Much fossil
series:
  - id: history
    title: History
    color: '#8C8479'
    style: dashed
  - id: central
    title: Central path
    color: '#1F3F66'
    highlight: true
  - id: fast_electrification
    title: Fast electrification
    group: Scenarios
  - id: molecules
    title: Molecules
    group: Scenarios
points:
  - { series: history, year: 2000, bio: 80, electrons: 340, fossil: 1700 }
  - { series: history, year: 2010, bio: 120, electrons: 380, fossil: 1600 }
  - { series: history, year: 2020, bio: 190, electrons: 420, fossil: 1450 }
  - { series: central, year: 2020, bio: 190, electrons: 420, fossil: 1450 }
  - { series: central, year: 2030, bio: 260, electrons: 560, fossil: 1150 }
  - { series: central, year: 2040, bio: 330, electrons: 720, fossil: 800 }
  - { series: central, year: 2050, bio: 380, electrons: 850, fossil: 480 }
  - { series: fast_electrification, year: 2020, bio: 190, electrons: 420, fossil: 1450 }
  - { series: fast_electrification, year: 2030, bio: 240, electrons: 680, fossil: 1000 }
  - { series: fast_electrification, year: 2040, bio: 280, electrons: 950, fossil: 550 }
  - { series: fast_electrification, year: 2050, bio: 300, electrons: 1150, fossil: 200 }
  - { series: molecules, year: 2020, bio: 190, electrons: 420, fossil: 1450 }
  - { series: molecules, year: 2030, bio: 330, electrons: 500, fossil: 1100 }
  - { series: molecules, year: 2040, bio: 520, electrons: 560, fossil: 700 }
  - { series: molecules, year: 2050, bio: 700, electrons: 600, fossil: 350 }
settings:
  - setting: title
    waarde: Energy mix trajectories (example with made-up numbers)
  - setting: unit
    waarde: PJ
  - setting: markYear
    waarde: 2030
```

Points may be written on one line each, as here, or as ordinary indented mappings.

## Before you answer, check

- There are exactly three axes, and every point has a value for each of their IDs, spelled exactly the same.
- Every point's `series` is the ID of a series.
- No series has two points for the same year.
- Every hex colour is quoted.

## Settings

All settings, with their defaults. Only include the ones you change.

| setting | default | values | what it does |
|---|---|---|---|
| `canvasWidth` | `1200` | number, min 100 | Canvas: Width |
| `canvasHeight` | `900` | number, min 100 | Canvas: Height |
| `margin` | `60` | number, min 0, max 400 | Canvas: Margin. Free space between the edges of the canvas and the diagram with its texts and legend. |
| `scaleCanvas` | `1` | number, min 0.1, max 5 | Canvas: Output scale. Scales the drawing inside the exported image: 0.8 draws everything at 80%. Zooming the view does not change it. |
| `backgroundColor` | '#F5F3EF' | hex colour | Canvas: Background |
| `transparentBackground` | `false` | `true` / `false` | Canvas: Transparent background. Exports without a background fill. |
| `title` | (empty) | text | Title: Title |
| `titleFontSize` | `24` | number, min 6 | Title: Size |
| `titlePositionX` | `60` | number | Title: X |
| `titlePositionY` | `60` | number | Title: Y |
| `titleColor` | '#2B2B2B' | hex colour | Title: Colour |
| `zoom` | `auto` | `auto` zoomed to the data; `full` full, 0–100% | Triangle: Axes. Zoomed shows only the part of the triangle the visible series use; lower bounds round down to 5%. Percentages read the same. |
| `stretch` | `true` | `true` / `false` | Triangle: Widen the zoomed plot. Spreads trajectories apart sideways when zoomed (no longer equilateral). |
| `gridStep` | `auto` | `auto` automatic; `0.05` 5%; `0.1` 10%; `0.2` 20%; `0.25` 25% | Triangle: Grid lines every |
| `showArrows` | `true` | `true` / `false` | Triangle: Direction arrows. The “few … / many …” arrows around the triangle; texts come from the corners. |
| `lineWidth` | `2` | number, min 0.5, max 12 | Lines and points: Line width |
| `dotSize` | `3.6` | number, min 0, max 14 | Lines and points: Dot size |
| `curve` | `smooth` | `smooth` smooth curves; `straight` | Lines and points: Lines |
| `yearLabels` | `highlighted` | `highlighted` on highlighted series; `all` on every series; `none` | Lines and points: Year labels |
| `markYear` | `0` | number, min 0 | Lines and points: Mark year. Draws a ring around this year on highlighted series. 0 for none. |
| `showLegend` | `true` | `true` / `false` | Legend: Show legend |
| `legendPosition` | `top` | `top`; `right`; `bottom` | Legend: Position. Between the title and the triangle, right of the triangle, or below it. |
| `legendWidth` | `240` | number, min 60, max 800 | Legend: Width |
| `legendRows` | `0` | number, min 0, max 30 | Legend: Rows. Most entries above each other. 0 uses as few rows as the width allows. |
| `font` | (empty) | (empty) Roboto, 'RO Sans', 'RO Serif', 'Arial', 'Georgia', 'Verdana' | Text and colours: Font. Bundled fonts are embedded in exports. |
| `fontSize` | `16` | number, min 6, max 40 | Text and colours: Text size. Corner names; other texts scale with it. |
| `textColor` | '#2B2B2B' | hex colour | Text and colours: Text colour |
| `gridColor` | '#E0DCD4' | hex colour | Text and colours: Grid colour |
| `unit` | (empty) | text | Values: Unit. Of the values in the points table; shown with totals in tooltips. |
| `decimals` | `0` | number, min 0, max 4 | Values: Decimals for totals |

## Your input

<Describe the diagram, or paste the data: for each series and year the three amounts (or shares). Name the three corners, the unit and the title, and say which series to highlight.>
