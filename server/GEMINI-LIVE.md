# Gemini Live demo operations

No public paid/free switch. Billing is controlled in Google AI Studio / Google Cloud; the Worker controls whether this feature is enabled.

Before enabling paid use, set a Gemini API spend cap BELOW your $10 ceiling in Google Cloud Billing. A spend cap is delayed and cannot guarantee zero overage. Live is consumption-billed from the first input/output; two minutes is not free.

Cloudflare Worker settings (and server/.env for local development):

GEMINI_LIVE_ENABLED=true
GEMINI_DEMO_EXPIRES_AT=2026-11-10T08:00:00Z
GEMINI_LIVE_MODEL=gemini-3.8-live
GEMINI_TTS_MODEL=gemini-2.5-flash-preview-tts
GEMINI_API_KEY must remain a secret.

These are owner configuration only. Disable after the event with GEMINI_LIVE_ENABLED=false and remove paid billing from the Google project if desired. This also disables new on-demand speech generation; previously deployed Gemini clips still play.

Limits: 180 seconds per browser Live connection, short-lived provider token (210 seconds), 20 lifetime Live token grants globally / 5 per account, 80 lifetime uncached TTS requests globally / 30 per account. Counters persist in demo_usage with day='gemini-demo-v1' and deliberately do not reset. They are usage limits, not dollar accounting. Other existing Gemini report routes consume the same Google project budget too. No automatic reconnect.

Live starts only after camera-sharing consent and Start session. Microphone help is optional and starts only after the user chooses Enable microphone help and grants browser permission. While Gemini is speaking, microphone input is paused. Detected spoken questions are sent as 16 kHz PCM with explicit speech start/end signals; audio is not saved by Physipeak. Silence closes a question after about 0.9 seconds, with a 12-second maximum per question. Disable microphone help, end the session, or leave the tab to release the microphone. Up to one 512px JPEG/second is sent directly to Google; Physipeak does not save frames. An occasional prompt requests brief visible-form feedback during movement for sit-to-stand, overhead reach, elbow bend, and cross-body stretch. After at least 15 seconds without a counted rep, Gemini may offer a concrete next step when tracking is ready, without inferring the cause. Spoken requests for help receive a short answer based on the selected exercise and recent images. Wave is excluded. Local rep counting remains authoritative. Gemini can miss or misinterpret form; this is a hackathon demo.

Context compression is enabled for the three-minute demo. Leaving the tab, ending/cancelling a session, or unchecking sharing closes the connection. Gemini Live audio is played directly. Routine event/question speech uses matching deployed Gemini clips first, then cached Gemini TTS; there is no browser speech synthesis fallback. Missing paid configuration/quota produces an on-screen status.

Before deploying, run the build and relevant existing tests. Then test on the actual HTTPS site: consent off sends no camera frames, consent on connects, each exercise receives feedback mid-movement, session end/tab hide closes the socket, and voice start/tracking/end/question audio plays. Inspect Network for the constrained WebSocket and confirm no long-term API key is in responses. Provider integration needs real credentials and has not been exercised by the coding agent.

GitHub Actions must deploy with wrangler.connected.jsonc and --keep-vars, after installing server dependencies. The root wrangler.jsonc publishes only static assets. The release smoke check now requires a JSON /health response with the D1 backend and Gemini secret configured.
