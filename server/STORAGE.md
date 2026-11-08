\# Local SQLite storage



\## Requirements



Use Node.js 24.15.0 or newer in the Node 24 LTS line.

Storage uses the built-in node:sqlite module.



\## Database location



server/data/motion.sqlite



The directory is created automatically when the backend starts.

Database files are local and ignored by Git.



Pulling the repository does not download another teammate's database.

Each computer starts with its own database.



\## Session endpoints



POST /api/sessions



Accepts the same request format as fixtures/synthetic-session.json.

Saves all sessions in the request and returns { sessions: \[...] }.



Submitting an identical session again does not create a duplicate.

Reusing an ID with different data returns 409.

Duplicate IDs within one request return 400.

A conflicting batch is rolled back.



GET /api/sessions



Returns the latest 50 sessions, ordered by session start time.



GET /api/sessions?limit=100



Allows a limit from 1 to 100. No pagination is implemented yet.



GET /api/sessions/:sessionId



Returns one saved session, or 404 if it does not exist.



\## Report endpoints



POST /api/reports



Accepts the same fixture format.

Saves source sessions before generating the report.

Returns 201 with the saved report, including:

\- reportId

\- createdAt

\- model

\- mode

\- dataSource

\- facts

\- narrative



Gemini mode makes an API request.

Mock mode generates a local template.



If Gemini generation fails, source sessions remain saved.

The endpoint returns 502 with session IDs and no new report.



Each successful POST creates a new report.

Repeated POST requests are not deduplicated and may use Gemini quota.



GET /api/reports



Returns metadata for the latest 50 saved reports.



GET /api/reports/:reportId



Returns the complete saved report, or 404 if it does not exist.

Retrieval does not call Gemini.



\## Persistence



Sessions and reports survive backend restarts.

Reports retain their source-session links and original narrative.



\## Tests



From the server folder:



```powershell

npm.cmd test

```



Storage tests use in-memory databases and do not call Gemini.



Manual verification also confirmed session and report retrieval

after restarting the server.



\## Current boundaries



\- Synthetic demonstration data only.

\- One local dataset; no accounts or patient separation.

\- No update or delete endpoints.

\- No authentication or automatic backups.

\- No schema migration framework yet.

\- No automatic progress comparisons.

\- No voice companion or user-context storage yet.

\- No clinical validation.



The server currently listens only on the local computer.

