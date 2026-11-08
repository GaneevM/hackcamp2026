import "dotenv/config";

async function main() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing.");
  }

  let pageToken;
  let count = 0;

  do {
    const url = new URL(
      "https://generativelanguage.googleapis.com/v1beta/models"
    );

    url.searchParams.set("pageSize", "100");

    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const response = await fetch(url, {
      headers: {
        "x-goog-api-key": apiKey
      },
      signal: AbortSignal.timeout(30000)
    });

    if (!response.ok) {
      throw new Error(
        `Model listing returned HTTP ${response.status}.`
      );
    }

    const body = await response.json();

    if (!Array.isArray(body.models)) {
      throw new Error(
        "Unexpected response fields: " + Object.keys(body).join(", ")
      );
    }

    for (const model of body.models) {
      console.log("Model:", model.name);
      console.log(
        "Methods:",
        (model.supportedGenerationMethods || []).join(", ")
      );
      console.log();
      count++;
    }

    pageToken = body.nextPageToken;
  } while (pageToken);

  console.log(`Total models listed: ${count}`);
}

main().catch((error) => {
  console.error("Error type:", error.name);

  // Only show our own diagnostic messages.
  if (
    error.message.startsWith("Model listing returned") ||
    error.message.startsWith("Unexpected response fields") ||
    error.message === "GEMINI_API_KEY is missing."
  ) {
    console.error(error.message);
  }

  process.exitCode = 1;
});