\# Exercise session report contract — v1.0



\## Endpoint



POST /api/reports

Content-Type: application/json



Local backend: http://localhost:3001



The backend currently accepts synthetic demonstration data only.

Actual camera-data integration requires an explicit update.



\## Request



Use server/fixtures/synthetic-session.json as the complete example.



Top-level fields:



\- schemaVersion: "1.0"

\- dataSource: "synthetic"

\- exerciseId: "seated\_elbow\_bend"

\- side: "left" or "right"

\- angleConvention: "inner\_joint\_angle\_deg\_straight\_is\_180"

\- sessions: array containing 1–30 sessions



Each session requires:



| Field | Value |

| --- | --- |

| sessionId | Nonempty string, maximum 100 characters |

| startedAt | UTC timestamp, such as 2026-11-07T20:00:00Z |

| durationSeconds | Nonnegative number, seconds |

| targetReps | Positive integer or null |

| completedReps | Nonnegative integer |

| medianRepDurationSeconds | Positive number, seconds, or null |

| estimatedExtensionHoldAngleDeg | Number from 0 to 180, or null |

| estimatedFlexionHoldAngleDeg | Number from 0 to 180, or null |

| trackingValidFraction | Number from 0 to 1, or null |

| trackingLossEvents | Nonnegative integer |

| incompleteCycles | Nonnegative integer |

| stopReason | user\_ended, goal\_reached, tracking\_lost, or unknown |



All fields must be present.

Nullable measurements use null when unavailable.

Zero must not be substituted for an unknown value.

Additional fields are currently rejected.



\## Measurement meaning



\- Angles are estimated inner joint angles.

\- A straight elbow corresponds to 180 degrees.

\- An incomplete cycle is not automatically a clinical failure.

\- Tracking loss does not establish why a movement stopped.

\- Do not infer pain, fatigue, or weakness from tracking statistics.



Before connecting actual tracking, document the tracker’s exact rules

for completed cycles, rep timing, sustained-hold angles, and the

denominator used for trackingValidFraction.



Do not silently substitute a raw frame maximum for a hold estimate.



\## Successful response



\- mode: mock or gemini

\- dataSource: synthetic

\- facts: exerciseId, side, sessionCount, completedReps

\- narrative:

&#x20; - summary: string

&#x20; - observations: array of strings

&#x20; - limitations: array of strings

&#x20; - questionsForReview: array of strings



The frontend should display exact totals from facts.

Generated narrative requires review.



\## Errors



\- 400: invalid input or malformed JSON

\- 413: request body exceeds the size limit

\- 502: Gemini generation failed; calculated facts are included

\- 500: unexpected server error



\## Integration boundaries



The frontend sends session statistics, not an API key.

The Gemini API key stays on the backend.

Do not send video, patient identifiers, or sensitive information.

The current server listens only on the computer running it.



This prototype is not clinically validated and does not establish

recovery or recommend treatment.

