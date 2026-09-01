# Screen recording ingest map

This file records how the anonymous Screen Studio exports in
`/Users/marcus/Desktop/video` were identified and converted into the canonical
HyperFrames assets. Raw sources were not moved, renamed, or modified.

All derivatives are silent H.264 MP4, 30 fps, `yuv420p`, with a one-second
keyframe interval and `faststart` enabled. Browser recordings remain 1920×1080.
Terminal recordings use content-sized canvases so HyperFrames can place and
scale the evidence without baked-in black padding.

| Canonical asset | Anonymous source | Output size | Selected source ranges | Edited duration | Evidence |
|---|---|---:|---|---:|---|
| `01-delegate-inventory.mp4` | `0c6e16adc3a86800f0e42b4754fa07da_raw.mp4` | 1920×1080 | 9.5–15.0, 18.5–21.0, 24.5–28.0 | 11.50 s | Task entry, Advisor suggestion, explicit per-Run delegation |
| `02-allow-run.mp4` | `4a3e23df73ab97ee9f2adc013ea20623_raw.mp4` | 1920×1080 | 2.2–14.5, 44.5–53.5 | 21.30 s | Real completed Run, answer, and Delegated → Decided → Executed proof chain |
| `03a-advisor-no-match.mp4` | `ac940f09ef5d4ebfc9fa05b1cb50b902_raw.mp4` | 1920×1080 | 6.5–9.5, 11.5–14.0 | 5.50 s | Payments task produces no eligible Resource suggestion |
| `03b-deny-payments.mp4` | `e9d845753c686f7ccf827353372aadc1_raw.mp4` | 1600×158 | 8.0–15.2 | 7.20 s | Direct request denied with `entitlement_missing` before a Runner starts |
| `04-revoke-retry.mp4` | `782d906f437f7f96b2868aba3b89fe8f_raw.mp4` | 1600×384 | 8.5–13.0, 21.5–26.5, 29.5–32.1 | 12.10 s | Revoke succeeds, retry fails closed, earlier allow Receipt still exists |
| `05-container-gate.mp4` | `b592302233dee890fdcf795968d375fb_raw.mp4` | 1800×142 | 7.5–11.5, 20.5–28.8 | 12.30 s | Real container integration test passes for delegated read-only Resource and unchanged host fixtures |
| `06-unsupported-runtime.mp4` | `18822c7198285d11915ab22a4f43d8ef_raw.mp4` | 1600×138 | 9.5–15.5 | 6.00 s | `local-process` Capsule request denied with `runtime_profile_unsupported` |

`01-delegate-hold.png` is the final frame of Clip 01. Frame 03 uses it after
the 11.5-second recording ends so the remaining narration has a deterministic
visual hold instead of asking the renderer to seek beyond the source duration.

## Edit decisions

- Long provider and container waits were removed with straight jump cuts; no
  result text or UI state was fabricated.
- Browser captures preserve their entire window and are padded to 16:9.
- Terminal captures are reframed as content-sized evidence strips without
  baked-in black padding.
- Absolute Windows repository paths visible in the raw terminal recordings are
  outside the final crop. Decision fields, IDs, test names, and pass/fail
  results remain unaltered.
- The source clips contain no audio stream, which is intentional: narration is
  supplied separately from `assets/voice/`.

## QA notes

- Clip 02 is a genuine completed live model Run, not a mock or static screen.
- Clip 04 includes the historical allow-Receipt check (`exists`, `decision:
  allow`, `runnerStarted: true`).
- Clip 05's visible Vitest reporter gives one aggregate passing test whose name
  states the delegated read-only and host-fixture guarantees. It does not print
  every internal assertion as a separate line; use the existing animated proof
  labels in Frame 07 to enumerate those assertions without claiming they were
  individually printed by the reporter.
- No API key, bearer token, `.env` contents, raw Agent JSON, or Resource body is
  visible in the edited derivatives.
