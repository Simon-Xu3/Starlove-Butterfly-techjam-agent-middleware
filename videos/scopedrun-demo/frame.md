---
name: Scoped Boundary
colors:
  canvas: "#07110F"
  surface: "#101C19"
  surface-raised: "#172622"
  ink: "#F4F7F5"
  ink-muted: "#9BAEA7"
  hairline: "#294139"
  allow: "#2FC8A0"
  deny: "#FF5C57"
  admission: "#F2B84B"
typography:
  display:
    fontFamily: Oswald
    fontWeight: 700
    letterSpacing: "0.01em"
    textTransform: uppercase
  body:
    fontFamily: IBM Plex Mono
    fontWeight: 400
  label:
    fontFamily: IBM Plex Mono
    fontWeight: 700
    letterSpacing: "0.12em"
    textTransform: uppercase
rounded:
  none: 0px
  sm: 6px
  md: 12px
spacing:
  sm: 12px
  md: 24px
  lg: 48px
  xl: 88px
motion:
  energy: controlled
  easing:
    entry: "power3.out"
    exit: "power4.in"
  duration:
    entrance: 0.55
    transition: 0.4
  atmosphere:
    - boundary-grid
    - registration-marks
    - aperture-shadow
  transition: blur-crossfade
components:
  border: "2px solid #294139"
  focal-border: "3px solid currentColor"
  shadow: "0 28px 80px rgba(0, 0, 0, 0.48)"
---

## Overview

The access boundary is treated as a physical aperture in a dark control plane:
one selected resource crosses the threshold, while every unrelated path fades
out of existence. The look combines film-noir negative space with precise
operational metadata. It should feel provable, not futuristic for its own sake.

## The Frame

- Focal element: the resource capsule, receipt state, or real product window.
- Edge anchors: upper-left scene index and lower-right run/decision metadata.
- Supporting detail: hairline routes, mount labels, generation numbers, and concise status chips.
- Background: tinted near-black canvas with a sparse perspective grid, aperture shadow, and restrained grain; never a full-screen linear gradient.
- Caption keep-out: reserve the bottom 17% for burned-in captions.

## Color Roles

- `allow` is used only for entitlement-valid, delegated, and executed states.
- `deny` is used only for rejected access and absent mounts.
- `admission` is used for pending or re-check stages.
- All other information uses `ink`, `ink-muted`, and `hairline`; status colors are never decorative.

## Typography

- Oswald is the declarative voice for hooks and section statements.
- IBM Plex Mono is the evidence voice for UI labels, receipts, paths, and captions.
- Headlines occupy 60–80% of frame width at 72–120px equivalents.
- Body and captions remain at 28–36px equivalents; labels remain at 20–24px.
- Use tabular numerals for timestamps, generation values, and hashes.

## Motion

- Motion is mechanical and directional: draw, route, lock, reject, and clear.
- Reveals follow the narration; no frame dumps its full information at the start.
- Use long-tail settles, velocity-matched internal seams, and deliberate held reads.
- No bounce, endless loops, lazy breathing, or unrelated floating particles.

## Do

- Make absence visible by removing routes and mounts from the composition.
- Use real project vocabulary: Entitlement, Delegation, Admission, Runner, Receipt.
- Crop and enlarge product footage until one UI claim is unmistakable.
- Let one or two moments hold nearly still so the evidence can be read.

## Don't

- Do not resemble a generic cyber-security dashboard or neon AI interface.
- Do not use pure black, pure white, purple-blue gradients, glassmorphism, or identical card grids.
- Do not show secrets, API keys, host paths, or unrelated workspace content.
- Do not imply hot revocation, tenant authentication, or general RBAC.
