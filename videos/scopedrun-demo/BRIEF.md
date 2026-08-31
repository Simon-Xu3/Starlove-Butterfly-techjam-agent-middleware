---
workflow: general-video
flow: companion
storyboard: yes
message: "Prompts ask. Mounts enforce: SLB-ScopedRun delegates one resource to one Agent Run, read-only, and nothing else."
destination: youtube
aspect: 1920x1080
language: en
audience: "Hackathon judges and technical product evaluators"
length: "2m50s-3m00s"
angle: "20% story, 80% executable security proof"
narration: yes
---

## Intent

Create a concise technical demo that proves SLB-ScopedRun enforces a real
resource boundary instead of relying on prompts or UI hiding. The story moves
from the security problem to the mount-time design, then demonstrates approval,
denial, revocation, and filesystem evidence in the running product. The tone is
confident, precise, and honest about the POC's limitations.

## Assets

- Screen Studio recordings to be supplied — edited product captures for the allow, deny, revoke, and isolation-proof sequences.
- User-recorded English narration to be supplied after script approval — primary voice-over track.

## Customizations

- Hybrid structure: HyperFrames motion-design explanation around real product footage.
- English burned-in captions designed for silent autoplay as well as narrated viewing.
- Dark security/control-plane visual system: teal for allowed, red for denied, amber for admission or pending state.
- Sparse electronic ambience and restrained system sound marks under the narration.
- Designed opening line: “Prompts ask. Mounts enforce.”
- Designed closing line: “One resource. One run. Nothing else.”
- Product footage uses editorial crops and punch-ins so dense UI evidence remains legible at 1920×1080.

## Notes

- Keep the final duration under three minutes.
- Do not show the API key, local secret files, or unrelated host paths.
- Show Delegated → Decided → Executed as visible evidence, not as an unsupported claim.
- State limitations plainly: local-process is not isolated; revocation blocks the next Run rather than terminating one already running; this POC is not tenant authentication or general RBAC.
- The video must be reviewed as a storyboard and then as a checked Studio preview before rendering.
