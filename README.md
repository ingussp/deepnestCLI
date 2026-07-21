<img src="https://github.com/user-attachments/assets/9c9b1e8c-0251-4888-95bd-e795fa523b58" alt="deepnest next" width="768">

# **deepnest**

A fast open source nesting tool for plotter, laser cutters and other CNC tools

deepnest is a desktop application originally based on [SVGNest](https://github.com/Jack000/SVGnest) and [deepnest](https://github.com/Jack000/Deepnest)

- New nesting engine with speed-critical code, written in C (outsourced to an external NodeJs module)
- Merging of common lines for plotter and laser cuts
- Support for DXF files (through conversion)
- New path approximation function for highly complex parts



## Upcoming changes
- more speed with code written in Rust outsourced as modules, the original code was written in JavaScript
- some core libraries rewritten from scratch in Rust so we get even more speed and ensure memory safety
- Save and load settings as presets
- Load nesting projects via CSV or JSON
- Native support of DXF file formats without online conversion
- **Cloud nesting:** Use our cloud for fast nesting of your projects _more soon_ 


## How to Build?

Reed the [Build Docs](BUILD.md)


## CLI JSON input

You can start the app with a JSON job file:

```bash
npm run start -- input.json
```

## CLI JSON input (`input.json`)

You can run Deepnest with a JSON job file:

```bash
npm run start -- input.json
```

Top-level structure:

- `settings` – configuration values (same idea as GUI settings)
- `sheets` – sheet/bin definitions (rectangles or polygons, with optional holes)
- `parts` – input files to nest
- `autoStart` – start nesting automatically after loading
- `output.resultJson` – write best/current result to JSON file

---

### Full example

```json
{
  "settings": {
    "units": "mm",
    "spacing": 3.52777,
    "curveTolerance": 0.25399,
    "rotations": 1,
    "placementType": "convexhull",
    "simplify": false,
    "threads": 3,

    "useSvgPreProcessor": false,
    "scale": 2.83464,
    "endpointTolerance": 0.12699,
    "dxfImportScale": 1,
    "dxfExportScale": 1,
    "exportWithSheetBoundboarders": false,
    "exportWithSheetsSpace": false,
    "exportWithSheetsSpaceValue": 0.13888,

    "mergeLines": true,
    "timeRatio": 0.5,
    "populationSize": 10,
    "mutationRate": 10,

    "useQuantityFromFileName": false
  },
  "sheets": [
    {
      "type": "rect",
      "width": 500,
      "height": 500,
      "quantity": 1
    },
    {
      "type": "polygon",
      "outer": [
        { "x": 218.030838, "y": 300 },
        { "x": 0, "y": 300 },
        { "x": 0, "y": 0 },
        { "x": 300, "y": 0 },
        { "x": 300, "y": 171.018143 },
        { "x": 256.016205, "y": 171.018143 },
        { "x": 256.016205, "y": 224.597488 },
        { "x": 218.030838, "y": 224.597488 }
      ],
      "holes": [
        [
          { "x": 175.283186657, "y": 144.22847 },
          { "x": 171.092565582, "y": 171.811333914 },
          { "x": 158.903237863, "y": 196.924962808 },
          { "x": 139.916760907, "y": 215.695150777 },
          { "x": 115.120438062, "y": 227.745121181 },
          { "x": 87.514531739, "y": 231.948993229 },
          { "x": 59.908625417, "y": 227.745121181 },
          { "x": 35.112302572, "y": 215.695150777 },
          { "x": 16.125825616, "y": 196.924962808 },
          { "x": 3.936497897, "y": 171.811333914 },
          { "x": -0.254123178, "y": 144.22847 },
          { "x": 3.936497897, "y": 116.645606086 },
          { "x": 16.125825616, "y": 91.531977192 },
          { "x": 35.112302572, "y": 72.761789223 },
          { "x": 59.908625417, "y": 60.711818819 },
          { "x": 87.514531739, "y": 56.507946771 },
          { "x": 115.120438062, "y": 60.711818819 },
          { "x": 139.916760907, "y": 72.761789223 },
          { "x": 158.903237863, "y": 91.531977192 },
          { "x": 171.092565582, "y": 116.645606086 }
        ]
      ],
      "quantity": 1
    }
  ],
  "parts": [
    { "path": "tests/assets/zvaigzneSVG.svg", "quantity": 10 },
    { "path": "tests/assets/henny-penny.svg", "quantity": 1 }
  ],
  "autoStart": true,
  "output": {
    "resultJson": "result.json"
  }
}
```

---

## `settings` – detailed option reference

> `units` affects how GUI-style numeric values are interpreted in JSON (for example spacing/tolerance-like values).

### Nesting configuration

- `units`: `"mm"` or `"inch"`
  - Unit system for GUI-style values in JSON.

- `spacing`: `number`
  - Minimum distance between parts.
  - Higher value = safer cut gap, lower packing density.
  
- `partToSheet`: `number`
  - Minimum real distance between a part and the sheet outer boundary or an
    internal sheet-hole boundary.
  - Uses the same unit system as `spacing`.
  - When `units` is `"mm"`, specify this value in millimeters.
  - A value of `0` allows parts to use the complete working sheet area while
    still accounting for the `spacing` compensation.

- `partToHole`: `number` *(optional)*
  - Minimum real distance between a part and an internal sheet-hole boundary.
  - Uses the same unit system as `spacing`.
  - When omitted, `partToSheet` is used for internal sheet holes as well.
  - Set this to `0` when parts may approach internal holes without additional clearance.

- `curveTolerance`: `number`
  - Tolerance used when approximating curved geometry.
  - Lower = more precise, slower.
  - Higher = faster, less precise.

- `rotations`: `integer` (optional, recommended `1..32`)
  - Number of allowed rotation positions for this part.
  - `1` = no rotation.
  - `2` = `0°` and `180°`.
  - `4` = `0°`, `90°`, `180°`, and `270°`.
  - `8` = 45-degree increments.
  - If omitted, the default is `1`.

- `placementType`: `"gravity"` | `"box"` | `"convexhull"`
  - `gravity`: general purpose strategy.
  - `box`: bounding-box based strategy.
  - `convexhull`: squeeze strategy (often better for irregular layouts).

- `simplify`: `boolean`
  - Enables rough approximation mode for faster processing.

- `threads`: `integer` (typically `1..8`)
  - Number of CPU worker threads.

---

### Import / export related

- `useSvgPreProcessor`: `boolean`
  - Enables SVG pre-cleanup before import.

- `scale`: `number`
  - SVG scale value (GUI-style):
    - if `units = "inch"` => units/inch
    - if `units = "mm"` => units/mm

- `endpointTolerance`: `number`
  - Endpoint matching tolerance for shape cleanup.

- `dxfImportScale`: `number`
  - DXF import unit mapping.
  - GUI common values:
    - `1` = Points
    - `12` = Picas
    - `72` = Inches
    - `2.83465` = mm
    - `28.3465` = cm

- `dxfExportScale`: `number`
  - DXF export unit mapping.
  - GUI common values:
    - `72` = Points
    - `6` = Picas
    - `1` = Inches
    - `25.4` = mm
    - `2.54` = cm

- `exportWithSheetBoundboarders`: `boolean`
  - Include sheet outlines in exported files.

- `exportWithSheetsSpace`: `boolean`
  - Add spacing between multiple sheets in exported SVG.

- `exportWithSheetsSpaceValue`: `number`
  - Distance between exported sheets.

---

### Laser options

- `mergeLines`: `boolean`
  - Merge common/overlapping collinear lines.
  - Usually useful for laser/plasma to reduce duplicate cuts.

- `timeRatio`: `number` (`0..1`)
  - Optimization bias:
    - `0` = material utilization priority
    - `1` = cut-time/path efficiency priority

---

### Meta-heuristic tuning

- `populationSize`: `integer` (recommended `>= 3`)
  - Genetic algorithm population size.

- `mutationRate`: `integer` (recommended `>= 1`)
  - Genetic algorithm mutation rate/intensity.

---

### Other

- `useQuantityFromFileName`: `boolean`
  - Parses quantity from filename pattern like:
  - `part.3.svg` => quantity `3`

---

## `sheets` – sheet definitions

`sheets` is an array. Each entry can be one of:

### 1) Rectangle sheet

```json
{
  "type": "rect",
  "width": 500,
  "height": 500,
  "quantity": 1
}
```

- `width`: sheet width
- `height`: sheet height
- `quantity`: optional, defaults to `1`

### 2) Polygon sheet (without holes)

```json
{
  "type": "polygon",
  "outer": [
    { "x": 0, "y": 0 },
    { "x": 500, "y": 0 },
    { "x": 500, "y": 300 },
    { "x": 0, "y": 300 }
  ],
  "quantity": 1
}
```

- `outer`: closed contour points (implicit closure)
- `quantity`: optional, defaults to `1`

### 3) Polygon sheet with holes

```json
{
  "type": "polygon",
  "outer": [ ... ],
  "holes": [
    [ ... ],
    [ ... ]
  ],
  "quantity": 1
}
```

- `holes`: array of hole contours, each hole is its own point array.

---

## `parts` – part definitions

```json
[
  { "path": "tests/assets/part1.svg", "quantity": 5 },
  { "path": "tests/assets/part2.dxf", "quantity": 2 }
]
```

- `path`: file path to importable part file
- `quantity`: optional (if omitted, default behavior applies)

---

## `autoStart`

- `true` (default behavior) → nesting starts automatically after loading.
- `false` → data is loaded, but nesting does not start until user action.

---

## `output`

- `output.resultJson`: output file path for writing selected/best nesting result payload.

Example:

```json
"output": {
  "resultJson": "result.json"
}
```

---

## Practical tips

- Start with:
  - `placementType: "gravity"` or `"convexhull"`
  - `rotations: 4`
  - `spacing`: realistic machine kerf/safety gap
- For speed on complex files:
  - reduce `rotations`
  - increase `curveTolerance`
  - set `simplify: true`
- For better packing quality:
  - increase `populationSize`
  - keep `simplify: false`

## License

The main license is the MIT.

- [LICENSE](LICENSE)

Further Licenses:

- [LICENSES](LICENSES.md)

## Fork History

- https://github.com/Jack000/SVGnest (Academic Work References)
- https://github.com/Jack000/Deepnest
  - https://github.com/Dogthemachine/Deepnest
    - https://github.com/cmidgley/Deepnest
      - https://github.com/deepnest-io/Deepnest 
      
        (Not available anymore. ⚠️ don't should be trusted anymore: [readme](https://github.com/deepnest-next/.github/blob/main/profile/why-we-forked-into-a-new-organisation.md))
        - https://github.com/deepnest-next/deepnest

