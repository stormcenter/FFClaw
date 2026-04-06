# GL Transitions Vendor Bundle

This directory contains the GLSL shader source files for [gl-transitions/gl-transitions](https://github.com/gl-transitions/gl-transitions).

## Directory Structure

```
gl-transitions/
├── transitions/        # 121 .glsl shader files
├── textures/          # Default textures for sampler2D parameters
│   └── default-noise.png   # 256×256 procedural noise texture
└── README.md
```

## Default Textures

Two transitions require external textures (`sampler2D` parameters):

| Transition | Parameter | Default |
|------------|-----------|---------|
| `luma` | `luma` | `textures/default-noise.png` |
| `displacement` | `displacementMap` | `textures/default-noise.png` |

Users can override with `--texture luma:/path/to/texture.png`.

## Updating Shaders

Run the fetch script to sync with the upstream repository:

```bash
node scripts/fetch-gl-transitions.js
```

## License

The GLSL shaders in `transitions/` are licensed under each shader's respective license in the upstream [gl-transitions](https://github.com/gl-transitions/gl-transitions) repository.
