# PhysiPeak UI Rebuild — Implementation Spec

## Source and phase boundary

This spec consolidates the user-provided screenshot and follow-up requirements. Phase 1 is a UI rebuild of the existing app. Keep its framework, Auth0 session, routes, exercise and camera logic, storage keys, data structures, and user records. Do not introduce new computer-vision, exercise-tracking, or photo-storage behavior in Phase 1. Existing manual photo capture, stored diagnosis papers, angle calibration, check-ins, hand controls, session history, and report generation must remain usable.

## Visual direction

Use the supplied desktop PhysiPeak screenshot as the visual target at 1536 × 864 (the supplied image is 1672 × 942 and may be scaled for comparison). The page should feel like a clear, motivating rehabilitation app, with a persistent deep-navy sidebar, warm white workspace, bright yellow actions, a custom mountain climb illustration, and one consistent sans-serif family. Keep the layout calm, legible, accessible, responsive, and data-honest; do not invent clinical progress when data is unavailable.

### Screenshot palette

Values below are sampled from flat regions in the supplied target screenshot. Assign them to these roles:

| Element | Sampled color |
| --- | --- |
| Sidebar and dark plan panel | `#011C3A` |
| Main heading / primary ink | `#011D3E` |
| Primary action and active navigation | `#FEC604` |
| Main workspace | `#F9FAFC` |
| Surface / goal and progress panels | `#FEFEFE` |
| Muted labels and supporting copy | `#7D8797` |
| Improvement accent | `#DBF1EA` |

Maintain accessible contrast for small text, controls, active states, and focus indicators. Minor antialiasing variation in screenshot pixels is expected.

## Information architecture and behavior

1. **Home** is the post-auth landing page. Replace the current generic recovery banner with a mountain-route hero using the user’s slogan, **“The peak of physiotherapy.”** Present a simple, friendly climb with named ranks/checkpoints. Derive completed steps from saved sessions and show an honest empty state when there are none. Include the goal card, yellow Start Session action, a dark navy Today’s Plan panel, Your Progress and Last Session panels, and a visible upload-diagnosis entry point.
2. **Practice** is the single exercise/camera workspace. Keep all existing exercise and camera functionality. Put Push-up first in the exercise choices. Do not show a second duplicate movement selector below the camera. A Home Start Session action routes to Practice and brings the camera/exercise setup into view; preserve the existing permission prompt and five-second positioning countdown.
3. **My Plan** is the third primary tab. Put the diagnosis-paper upload/scan and editable extracted plan here, and make the existing therapist report preview/download/copy controls easy to find on this page.
4. **Progress** keeps the existing movement chart, metrics, and session history. The existing optional photo gallery is surfaced on Home. Render only saved data and descriptive empty states.
5. **Profile** shows the signed-in user and account actions. Place Sign out and the existing Enable hand controls setting here rather than in a standalone navigation item.

Use the same navigation on desktop and mobile. Remove obsolete duplicate Check-in and Visit-note navigation items while retaining their check-in and report functionality in the appropriate screens.

## Voice and camera controls

- Rename the visible “Your companion”/AI-companion framing to a plain **Voice controls** label.
- Offer only **Normal** and **Quiet** voice styles; keep the voice on/off control and map Normal to the existing ordinary short spoken cues. Do not remove the existing optional saved reflection/report behavior.
- Keep live video local and unsaved unless the user uses the existing photo action. The request for automatic per-session photos is explicitly deferred to Phase 2 because Phase 1 prohibits new photo-storage behavior.
- Preserve a clear camera permission step. Starting from Home must land on the Practice camera view and continue through the existing session-start countdown.

## Layout and implementation constraints

- Reuse existing Auth0, DOM screens, camera components, chart, plan form/OCR, report generator, IndexedDB media, and local per-user journal data. Keep auth callback/return behavior intact.
- Build the mountain art with an in-repository, dependency-free asset or inline SVG/CSS. Do not depend on remote images.
- Responsive desktop/mobile layouts; navigation, text, controls, focus, and empty states must remain accessible. Respect reduced-motion preferences.
- Preserve existing exercise/session semantics, hand-control behavior, camera shutdown privacy, check-ins, user-scoped data, and report content.

## Validation and deliverables

- Build the frontend and run relevant existing tests.
- Inspect the UI at 1536 × 864 and at a narrow mobile width. Compare layout, hierarchy, palette mapping, and spacing to the supplied screenshot.
- Commit the Phase 1 implementation.
- Phase 2 (not to be started here): automatically capture and store one photo per completed practice session, plus any new computer-vision or tracking behavior.
