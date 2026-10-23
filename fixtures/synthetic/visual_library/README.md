# Synthetic fixtures for contracts/visual_library.schema.json

Invented colors, ids and geometry. No brand file, no brand text and no number copied from the real
templates. `svg_sha256` values are placeholders. The template ids are the real ones because the
validator compares them with the `cover_spec` enum; the contents are not.

| File | Meaning |
| --- | --- |
| `valid-01.json` | Two grammars, a 4:5 and a 9:16 template; passes the schema and `validators/visual_library.js` |
| `valid-02.json` | One grammar, one 1:1 template |
| `invalid-01-slot-kind-out-of-enum.json` | Fails the schema only: `kind` is not `claim` or `chrome` |
| `invalid-02-missing-svg_sha256.json` | Fails the schema only: a template without `svg_sha256` |

The rules that the schema cannot express (references, uniqueness, contrast, geometry, footer) are tested
in `validators/visual_library.test.js` by mutating a valid fixture.
