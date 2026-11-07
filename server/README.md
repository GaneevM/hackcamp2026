\# Motion report backend



Local hackathon prototype that turns synthetic exercise statistics

into a structured report using Gemini.



\## Setup



Install Node.js LTS, then open PowerShell in the server folder.



Install dependencies:



```powershell

npm.cmd ci

```



Create your local configuration:



```powershell

Copy-Item .env.example .env

notepad .env

```



Keep REPORT\_MODE=mock to run without Gemini.



To enable Gemini, add your own GEMINI\_API\_KEY and set

REPORT\_MODE=gemini. The tested model is gemini-3.5-flash-lite.

Model availability and free-tier quotas depend on your Google project.



Never commit .env or share API keys.



\## Start



```powershell

npm.cmd start

```



Health endpoint: http://localhost:3001/health



Restart the server after changing configuration or source files.



\## Generate a report



With the server running, open another PowerShell tab in the server

folder and run:



```powershell

$sessionJson = Get-Content -Raw fixtures\\synthetic-session.json

Invoke-RestMethod -Uri 'http://localhost:3001/api/reports' -Method Post -ContentType 'application/json' -Body $sessionJson | ConvertTo-Json -Depth 10

```



POST /api/reports accepts the format shown in the fixture.

Validation rules are in src/validate-session.js.



Successful responses include mode, dataSource, facts, and narrative.

Mock mode uses templates. Gemini mode makes an external API request.



\## Tests



```powershell

npm.cmd test

```



Tests run locally without Gemini requests.



Optional live diagnostic, which makes one Gemini request:



```powershell

node src/check-gemini.js

```



\## Current limitations



\- Accepts synthetic data only.

\- Supports seated elbow bends, left or right side.

\- Inner joint angle convention: straight elbow = 180 degrees.

\- Unknown measurements must be null.

\- Numerical totals are calculated in code.

\- Generated narrative is schema-validated, but factual accuracy

&#x20; still requires review.

\- No clinical validation, treatment advice, or recovery assessment.

\- No vision-system integration yet.

\- No persistent storage, authentication, caching, or app-level rate limiting.

\- Server listens on this computer only.

\- Gemini failures return an error and the calculated facts.

\- Do not submit real patient or sensitive information.

\- This is a demonstration, not a clinical service.

