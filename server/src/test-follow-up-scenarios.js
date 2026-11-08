import "dotenv/config";
import { readFile, mkdir, writeFile } from "node:fs/promises";

const baseUrl = `http://localhost:${Number(process.env.PORT || 3001)}`;

async function post(path, body) {
  const response = await fetch(baseUrl + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000)
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}: ${result.error || "Request failed."}`
    );
  }

  return result;
}

async function main() {
  const baseline = JSON.parse(
    await readFile(
      new URL("../fixtures/synthetic-session.json", import.meta.url),
      "utf8"
    )
  );

  const scenarios = JSON.parse(
    await readFile(
      new URL("../fixtures/follow-up-scenarios.json", import.meta.url),
      "utf8"
    )
  );

  const results = [];
  const directory = new URL("../data/", import.meta.url);
  await mkdir(directory, { recursive: true });

  for (const scenario of scenarios) {
    const input = structuredClone(baseline);

    input.sessions = [{
      ...baseline.sessions[0],
      ...scenario.sessionOverrides
    }];

    await post("/api/sessions", input);

    const followUp = await post("/api/follow-ups", {
      sessionId: input.sessions[0].sessionId,
      mode: "concise"
    });

    const result = {
      scenario: scenario.name,
      expectedBehavior: scenario.expectedBehavior,
      question: followUp.question,
      followUpId: followUp.followUpId,
      sessionId: followUp.sessionId
    };

    results.push(result);

    console.log("\nSCENARIO:", result.scenario);
    console.log("REVIEW CRITERION:", result.expectedBehavior);
    console.log("GEMINI QUESTION:", result.question);

    await writeFile(
      new URL("follow-up-scenario-results.json", directory),
      JSON.stringify(results, null, 2)
    );
  }

  console.log("\nFinished. Review the questions for relevance.");
  console.log("Results saved to data/follow-up-scenario-results.json.");
}

main().catch((error) => {
  console.error("Scenario run stopped:", error.message);
  console.error(
    "Completed sessions and questions remain saved for the next run."
  );
  process.exitCode = 1;
});