# Recording drop zone

The seven canonical files below are now edited, render-safe derivatives of the
anonymous raw captures delivered in `/Users/marcus/Desktop/video`. The raw
captures remain untouched. See [`INGEST.md`](INGEST.md) for the exact source
mapping, selected time ranges, and QA notes.

Place untrimmed Screen Studio exports here with these names:

- `01-delegate-inventory.mp4`
- `02-allow-run.mp4`
- `03a-advisor-no-match.mp4`
- `03b-deny-payments.mp4`
- `04-revoke-retry.mp4`
- `05-container-gate.mp4`
- `06-unsupported-runtime.mp4`

Place narration under `assets/voice/` as:

- `01-boundary.wav`
- `02-control-plane.wav`
- `03-delegate.wav`
- `04-allow-proof.wav`
- `05-deny-proof.wav`
- `06-revoke.wav`
- `07-namespace-proof.wav`
- `08-honest-close.wav`

For a new take, raw captures are preferred. Leave two seconds of stillness at
the beginning and end, and do not expose `.env`, API keys, absolute host paths,
or shell history. Do not overwrite the edited canonical files without updating
`INGEST.md`.
