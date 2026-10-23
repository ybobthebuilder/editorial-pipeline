# Synthetic fixtures for contracts/

Invented data. No real paper, evidence, model output, database row or brand text. Every `job_id` is
`00000000-0000-4000-8000-0000000000NN`, and `model` is `synthetic-model-v0` or `not_reported`.

Per contract (`visual_spec`, `cover_spec`, `qa_result`, `image_assets`, `post_copy`), exactly four files:

| File | Meaning |
| --- | --- |
| `valid-01.json`, `valid-02.json` | Pass `contracts/<name>.schema.json` |
| `invalid-01-<cause>.json`, `invalid-02-<cause>.json` | Fail for the cause named in the file name and for no other |

`validators/contracts.test.js` checks all of this, including that nothing else sits in the folders.
A fixture passing the schema says nothing about the rules the schema cannot express (id existence,
`VERIFIED` evidence, unique `slot_id` and `gate_id`, `waived` never on `QA-CFM`, `passed` consistent
with the gates); those belong to code validators, see `docs/visual-layer/contracts-proposal.md` section 8.
