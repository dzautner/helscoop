## Dingcad

Dingcad is a live reloading program that is a replacement for openscad. Becuase openscad kind of really sucks. Try ./run.sh and then updating scene.js

This is dingcad. Dependencies: raylib, manifoldcad, and quickjs. Ask an LLM how to set up raylib on your system. For the quickjs and manifoldcad; you can 

```
git submodule update --init --recursive
```

This repository is mostly autonomously written by an LLM that I've lazily prompted while watching youtube and hanging out with my family.

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| P | Toggle PBR / Toon rendering |
| T | Toggle parameters panel |
| M | Toggle materials panel |
| H | Toggle thermal view |
| F3 | Toggle structural panel |
| F4 | Toggle assembly panel |
| F9 | Cycle debug views |
| R | Reload scene |
| Space | Reset camera |
| WASD/QE | Move camera |
| Ctrl+E | Export STL |
| Ctrl+I | Export IFC |

### Parametric Controls

Add `@param` annotations above `const` declarations to create UI sliders:

```javascript
// @param wall_height "Dimensions" Wall height in mm (1500-3000)
const wall_height = 2400;
```

Format: `// @param <name> "<section>" <label> (<min>-<max>)`

Architecture visual doc pipeline:

```
./scripts/generate-architecture-doc.sh
```

See `docs/ARCHITECTURE_DOC_PIPELINE.md` for shot presets and output structure.


