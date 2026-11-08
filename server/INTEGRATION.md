# Local frontend/backend integration

From `server/`, run `npm.cmd ci` if needed, then `npm.cmd start`.
Open **http://localhost:3001/**. No Python server is needed for the integrated demo.
The root app, SQLite API, and companion now share the same origin.

## Actual camera/manual sessions

- Existing browser history still works. New completed practice sessions also sync to a separate SQLite `journal_sessions` table.
- The companion appears below the camera. Spoken feedback is opt-in. Browser voice is the default; cached Gemini event clips may be selected without generating new speech.
- Quiet mode speaks only tracking-loss notices. Concise and encouraging modes announce each normal camera/manual rep. If speech is busy, at most one pending rep notice is retained; tracking changes, stopping speech, and session completion discard it. Tracking messages name the joints for the selected exercise. Cached clips are used only when their transcript matches; otherwise browser speech supplies the updated wording without a Gemini request.
- Session completion shows a local template question. Saving an explanation stores it as user-reported context. Show local summary reads SQLite without external AI.
- Returning to the app restores up to 100 synchronized records for the current local profile scope. Browser-only older records are not automatically uploaded. Standalone check-ins, documents, plans, and photos continue using browser storage.
- Clear history clears the current scope's synchronized journal and the browser session list. Synthetic Gemini sessions/reports remain a separate demo dataset.

The local profile scope is **not authentication or encryption**. The server remains bound to loopback. Do not expose it publicly. Auth0 frontend login does not authenticate these APIs. If configuring Auth0 for this local origin, add `http://localhost:3001` to its callback/logout/origin settings.

## Measurement definitions

Elbow/knee values use flexion with straight = 0 degrees. Shoulder reach uses hip–shoulder–elbow with arm down approximately 0. Values are model estimates.

Minimum/maximum observed angles are extrema of the app's smoothed signal, **not sustained-hold angles**. They are not silently converted into the synthetic API's hold fields. Completion intervals include pauses and the interval from session start to the first rep; they are **not isolated movement durations**. Tracking-valid fraction is valid angle observations divided by all processed observations during the session. A loss requires 400 ms of invalid observations; incomplete cycles reset on such a loss.

Missing/nonfinite world depth is no longer replaced by image coordinates. Manual records have null camera metrics. The existing movement detector remains a prototype; integration does not validate its counting, calibration, or longitudinal accuracy.

## Fictional Gemini demonstration

The companion's **Load fictional Gemini demo** button sends a fixed fictional session to the existing synthetic APIs. No actual camera values, pain ratings, notes, photos, documents, or profile identifiers are included. It uses `integration-fictional-demo-v1`, allowing questions to be reused. The UI labels this path explicitly.

Read question uses browser speech by default. Selecting Gemini speech requests audio only for this fictional question and falls back to browser speech on failure. Generate fictional Gemini report is an explicit text-generation request; repeat clicks create new reports. Existing synthetic report mode configuration still applies.

This boundary preserves the existing unpaid Gemini/data-use restrictions. A real clinical/external-AI deployment needs a separately approved provider/data arrangement; it is not enabled here.

## Static Cloudflare deployment

The workflow includes `companion.js` and `session-metrics.js` in its explicit static asset list. The hosted frontend remains static: this Express/SQLite backend is **not deployed to Cloudflare**. When APIs are unavailable, the companion explains how to start the local backend and existing camera/browser features remain available. Online cross-device synchronization and authenticated API hosting remain future work.

## Verification

`npm.cmd test` includes offline integration tests using an in-memory database and a temporary loopback HTTP server. No Gemini requests are made. Actual camera accuracy and Auth0 configuration still require testing on the intended device.

## Voice troubleshooting

Enabling spoken feedback acknowledges it aloud. Preview voice tests the selected browser voice; Test rep sound tests the actual event playback path. The active-exercise line shows whether the companion is attached to a session. Exercise and body-side selection are locked until finishing a session. The camera-wave check now speaks but remains excluded from journal/progress records. Start a new session after changing exercises.

## Starting and camera-wave checks

Start becomes available once the camera and model are ready. It can be pressed before joints are visible; the session is active but counting waits for valid tracking. On-screen status explicitly distinguishes not started, active, and waiting for view. The wave check follows a raised wrist out and back relative to its initial shoulder-relative position, with short dwell and arm-switch/lowering/long-gap resets. It does not require crossing the shoulder line and does not enter journal/progress data.
