# Connected care pages

Run the complete app from `server` with `npm.cmd start`, then open
http://localhost:3001. Restart the server after backend edits and refresh the
browser with Ctrl+F5. A static-only server does not provide the SQLite or AI APIs.

## User flow

1. Practice: complete a camera session or a manual log. Counts come from the
   actual tracking/manual-entry system; wave framing checks remain excluded.
2. Check-in: save an optional pain rating, confidence rating, or note. A zero
   pain rating is distinct from an unanswered rating. Check-ins save to browser
   storage and synchronize to the local SQLite database when available.
3. Progress: filter by exercise, side, and period. Repetition totals include
   camera and manual logs; angle charts require one exercise and side and exclude
   manual logs. Export the selected history as CSV. Plan, document, and photo tools
   remain available under the expandable section.
4. Visit note: choose 1–10 sessions. The local note works without an AI request.
   Review it, copy it, or print/save PDF.
5. Optional Gemini assistance: review the exact data preview, optionally include
   selected sessions' notes/ratings/explanations, and explicitly agree to share.
   One selected session enables an AI follow-up. Save a response as user-reported
   context, review sharing again with context included, then generate a draft.

## Gemini and demo data

This is a NON-CLINICAL HACKATHON DEMO. Actual camera-generated statistics are
preserved; they are not relabeled as synthetic data or replaced by fixtures.
The separate fictional demo and its synthetic-only endpoints remain unchanged.

Use only non-clinical, non-sensitive demo information. Free-text demo notes must
not contain real patient, confidential, or identifying information. Google's
unpaid-service terms prohibit sensitive/confidential/personal submissions:
https://ai.google.dev/gemini-api/terms
Paid-service settings, clinical use, authentication, and compliance require
separate review before any patient deployment. Nothing here enables billing.

`GEMINI_API_KEY` and `GEMINI_MODEL` remain server-side in the existing ignored
`.env`. The actual-session routes use the configured text model only when the
user chooses an AI action. This is independent of the old synthetic report's
`REPORT_MODE` toggle. Previewing data and rendering local notes never call Gemini.

The backend resolves IDs against canonical SQLite records, strips account/session
identifiers from provider content, and requires a fingerprint of the reviewed
payload plus explicit consent. If context changes, the preview must be reviewed
again. Matching requests reuse a saved result. Drafts retain immutable input and
output snapshots, including model and creation time. Provider errors never return
request details. Clearing local history also clears check-ins and AI snapshots in
that profile. Browser scopes are NOT backend authentication.

`/api/journal/ai/preview`, `/question`, `/report`, and `/history` serve this flow.
`/api/journal/checkins` synchronizes check-ins. The app remains loopback-only and
is not ready for public multi-user hosting. The Cloudflare workflow publishes
the new frontend modules but does not deploy this Express/SQLite backend.

## Validation

Run `npm.cmd test` from `server`. Tests stub the AI provider and use in-memory
databases. They do not use the API key, spend quota, or transmit user data.
Browser QA uses an isolated process with fictional seeded measurements and a
clearly labeled stub model; a live Gemini report was also validated with a fictional statistics fixture.
Sharing a current camera session requires explicit in-app consent.
