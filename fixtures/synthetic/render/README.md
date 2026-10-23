# Synthetic cover_specs for render/render.test.js

Six invented `cover_spec` documents, one per template, each with every slot of its template in
`config/baseline/visual_library.json` (claim and chrome), the CFM footer with a made-up name, and an
`alt_text`. No real paper, evidence, doctor or CRM number. `job_id` is `00000000-0000-4000-8000-0000000000NN`
and `model` is `synthetic-model-v0`. The `kind` of each slot is the library's (`cta_label` is a `claim`,
decision D-17). They pass `contracts/cover_spec.schema.json`, and `renderCover` renders each one.
