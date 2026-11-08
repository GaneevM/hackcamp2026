\# Voice companion prototype



Synthetic demonstration only. No vision integration yet.



\## What works



\- Prepared Gemini speech for simulated session events.

\- Quiet, concise, and encouraging speaking modes.

\- Gemini follow-up questions based on saved session statistics.

\- Browser speech with a selectable voice.

\- Gemini follow-up audio with browser fallback in the test page.

\- Questions and user answers stored separately from measurements.

\- Reports include labeled user-reported context.

\- Reports preserve a snapshot of the answers they used.



\## Setup



Use Node.js 24.15.0 or newer in the Node 24 LTS line.



From the server folder:



```powershell

npm.cmd ci

```



Create .env from .env.example if it does not already exist.

Do not overwrite an existing .env containing your key.



Set GEMINI\_API\_KEY locally.



Tested models:

\- Text: gemini-3.5-flash-lite

\- Speech: gemini-2.5-flash-preview-tts



Speech requests explicitly use API version v1beta.



Never commit .env or share API keys.



\## Start



```powershell

npm.cmd start

```



Pages:

\- http://localhost:3001/voice-demo.html

\- http://localhost:3001/follow-up-demo.html



The server listens only on the local computer.



\## Prepared event audio



Run these separately, respecting your actual speech quota:



```powershell

node src/prepare-voice.js concise

node src/prepare-voice.js quiet

node src/prepare-voice.js encouraging

```



These commands make speech API requests for missing clips.

Completed clips are cached by text, model, voice, and script version.



Generated audio and manifests live in server/data/voice/.

This directory is ignored by Git.



Each teammate must generate or separately obtain the demonstration

assets. Pulling the repository does not include audio or database files.



The event demo requires all three mode manifests.



\## Quotas and playback



During testing, this project's speech model reported limits of

3 requests per minute and 10 requests per day.



Check the current project limits in AI Studio; do not assume these

limits apply to every account or remain unchanged.



Playing a saved clip makes no Gemini request.

Generating a new question uses the text model.

Generating its audio uses the speech model.



Use browser speech during development to conserve speech quota.

Browser voices depend on the browser and operating system.



\## Follow-up test page



The page currently uses concise-mode questions.



Enter a saved synthetic session ID, then load its question.

An existing question for that session and mode is reused.



Choose browser speech or Gemini audio with browser fallback.

The page labels the speech source.



Browser voice selection is remembered locally when browser storage

is available.



Optional explanations are saved as user-reported context.

The first saved answer is preserved; conflicting replacements are

rejected.



\## Follow-up endpoints



POST /api/follow-ups



JSON body:



```json

{

&#x20; "sessionId": "demo-001",

&#x20; "mode": "concise"

}

```



Returns an existing question or generates and saves a new one.

This endpoint uses Gemini text generation regardless of REPORT\_MODE.



GET /api/follow-ups/:followUpId



Retrieves the saved question and answer without Gemini.



POST /api/follow-ups/:followUpId/answer



JSON body:



```json

{

&#x20; "answer": "Someone came to the door, so I stopped."

}

```



Saves locally without Gemini.



POST /api/follow-ups/:followUpId/audio



Generates or reuses cached Gemini audio.

Returns an audioUrl.



Quiet-mode questions are text-only through this endpoint.

Older questions rejected by the wording check cannot generate audio.

Speech failures leave the saved text available.



\## Report context



POST /api/reports automatically collects up to five recent answered

follow-ups for each included session.



Answers are labeled user\_reported and kept separate from facts.

A report snapshots the exact context included at generation time.

New answers do not modify old reports.



Saved answers are untrusted input, not instructions to the model.

Generated reports still require factual review.



\## Verification



Offline automated tests:



```powershell

npm.cmd test

```



The test command runs only tests/\*.test.js.

Do not include live diagnostic scripts in automated test discovery.



Optional live scenario review:



```powershell

node src/test-follow-up-scenarios.js

```



This saves four fictional session scenarios and generates missing

questions. Existing questions are reused.



Manual testing confirmed:

\- Prepared clips play in all three modes.

\- Browser speech and voice selection work.

\- Follow-up answers save and reload.

\- Questions respond to different fictional session statistics.

\- A generated report attributes an explanation to the user.



Dynamic Gemini audio generation was subsequently blocked by the

project's daily speech quota. Browser speech provides a fallback.



\## Limitations



\- Event playback is a button-based simulation.

\- No actual camera-event integration.

\- No microphone input or speech recognition.

\- No continuous real-time voice conversation.

\- Follow-up questions use one session, not longitudinal history.

\- Wording checks catch common unsupported timing claims, not all

&#x20; possible hallucinations.

\- Existing saved questions are not rewritten by prompt updates.

\- No authentication or patient separation.

\- No clinical validation, treatment advice, or recovery assessment.

