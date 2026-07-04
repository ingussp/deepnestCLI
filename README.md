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

The JSON file can contain:

- `settings` – nesting configuration
- `sheets` – sheet definitions
- `parts` – files to import as parts
- `autoStart` – automatically start nesting
- `output.resultJson` – path for exporting the best nesting result as JSON

### Supported sheet types

The `sheets` array supports:

1. **Rectangular sheets**
2. **Polygon sheets**
3. **Polygon sheets with holes**

### Example `input.json`

```json
{
  "settings": {
    "mergeLines": true,
    "timeRatio": 0.5,
    "populationSize": 10,
    "mutationRate": 10,
    "rotations": 1,
    "spacing": 10,
    "placementType": "gravity",
    "units": "mm"
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
        { "x": 338, "y": 300 },
        { "x": 0, "y": 300 },
        { "x": 0, "y": 0 },
        { "x": 212.795013882, "y": 0 },
        { "x": 212.795013882, "y": 71 },
        { "x": 378.795013882, "y": 71 },
        { "x": 378.795013882, "y": 183 },
        { "x": 338, "y": 183 }
      ],
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
    {
      "path": "tests/assets/zvaigzneSVG.svg",
      "quantity": 10
    },
    {
      "path": "tests/assets/henny-penny.svg",
      "quantity": 1
    },
    {
      "path": "tests/assets/mrs-saint-delafield.svg",
      "quantity": 1
    }
  ],
  "autoStart": true,
  "output": {
    "resultJson": "result.json"
  }
}
```

### Notes

- `settings.units` defines the units used in sheet dimensions and polygon points.
- For `type: "rect"`, use `width` and `height`.
- For `type: "polygon"`, use `outer`.
- If the sheet has cutouts/holes, add them in `holes`.
- `quantity` is optional and defaults to `1`.
- `parts[].path` must point to importable SVG/DXF files.
- If `autoStart` is `true`, nesting starts automatically after loading the JSON file.
- If `output.resultJson` is set, the best nesting result is written to that file.


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

