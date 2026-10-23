# assets/brand: template markup

Six SVG templates, one per `template_id` of `config/baseline/visual_library.json`. They are the markup
that the render (VL-5) fills; the geometry of every text lives in `visual_library.json` and a test
(`validators/visual_library.baseline.test.js`) keeps the two equal.

## Proveniência

Markup declarado de propriedade do autor em 22/10/2026, sob owned_brand_asset.

Registro da declaração do Fonseca (2026-10-22), aceita como nota de direitos e proveniência para a v0.1
(CP-VL1.6, U7; 2026-10-23). Se os originais `templates.json` e `tokens.css` aparecerem, um patch de correção
reconcilia as cópias (decisão de 2026-10-23).

## Rights and provenance

- **VERIFIED (decision of the project owner, Fonseca, 2026-10-22):** these SVGs may enter the public
  repository, and the markup is the project's own (`owned_brand_asset`).
- **UNVERIFIED by the assistant:** the package that the working copies came from describes itself as an
  unofficial reconstruction; nothing in this repository verifies who owns it. The owner's declaration
  (section "Proveniência" below) is what authorizes these files, and it is enough for CP-VL1.6 in v0.1
  (decision of 2026-10-23).
- Source: six working copies made outside the repository (XML fixed: a duplicated `text-anchor` removed in
  three files). The originals are no longer accessible, so equality with them was not re-checked.
  SHA-256 of those copies before the patch:

| Template | SHA-256 before the patch |
| --- | --- |
| `carousel-01-capa` | `b7a600500f874b440ab01f61042f1599792afffd0c215625d8174d069f6374f5` |
| `post-01-manifesto` | `187a8b4b084a4664608d5f4949aa0019d91830d3188cac79d45b880a6df85616` |
| `post-02-metrica` | `b2f5647921ab64a5b7e187d63003d4c2d51d1cfadf36ee80255bb535568492df` |
| `reel-01-capa` | `89f177e503d47029d5de973483a36d2958d9a119cf713f19f1b79c47c8d609ce` |
| `reel-02-overlay` | `4ca91ab2cd3a6ac7806b455e4dcb8502dcb00dd4fafd9bce01f5bca12252542f` |
| `story-01-convite` | `0f4b0eb453afecb968b5f028f2a604551b0a315bd726e99d8b48b69d457acdfe` |

The hash of each patched file is `svg_sha256` in `visual_library.json`.

## The patch (D-06)

1. **Ids.** Every `<text>` has an `id`: the `slot_id` for a one-line slot, `<slot_id>__<n>` (n from 0) for
   each line of a multi-line slot.
2. **Neutral placeholders.** The sample text of the package is gone. Each text holds `{{slot_id}}` or
   `{{slot_id.n}}`, which the render replaces. No sample text of the package is left in a `<text>`; the `aria-label` of each file keeps the template name.
3. **CFM footer.** Every template has `<text id="cfm_footer">`: 12 px, centred, white-ish (`#E7E6D9`, the
   `fg` token; PROPOSED, the decision says only "branco"), Arial 400 (family and weight PROPOSED). Baseline:
   1540 on 1080x1920, `height - 64 - 3` elsewhere (`geometry.cfmFooterBaseline`).
4. **Nothing in the cut bands of the 9:16 canvases** (decision of 2026-10-22: topo seguro a partir de
   y = 260, base segura até y = 1580; chrome is not exempt). The positions below are PROPOSED, a pragmatic
   rule: keep the original spacing and move the block.

| Template | Change |
| --- | --- |
| the three 9:16 | `label_top` baseline 125 -> 290, and the corner mark `y` 76 -> 266 (it sat in the top band as well) |
| `story-01-convite` | everything below `label_top` moves up 195 px, art group included (`translate(0 -195)`), so the button ends at y = 1500 and clears the footer; `cta_label` is centred in the button, because the CTA text now varies |
| `reel-02-overlay` | `chapter_label` and the headline move up 153 px (last baseline 1640 -> 1487); the rule under the headline (y = 1740, in the bottom band) moves to y = 1190, above the label |
| `reel-01-capa` | only `label_top` and the corner mark |
| 1:1 and 4:5 | no position changes; the footer is added |

## Known limits

- The buttons of `post-01-manifesto` (335 px) and `reel-01-capa` (580 px) are fixed in width for the sample
  text. A longer CTA or tag can overflow them; fitting the button to the text is the render's job (VL-5).
- The width of a text line is not checked by the library validator; `geometry.charBudget` and
  `geometry.checkSlot` do it per line at run time.
