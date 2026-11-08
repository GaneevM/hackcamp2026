# Rep counting review

## Definitions in the current app

- Sit-to-stand: one controlled rise from a stable seated starting pose counts once at standing. Sitting back down rearms the next rise. Holding a standing pose cannot add another rep.
- Overhead reach and elbow bend: stable start, sufficient travel to the endpoint, then a controlled return to the starting range counts once.
- Across-torso stretch: reach the endpoint, hold briefly, then return to the starting range. Saved hold time counts time at the endpoint, excluding the return movement.
- Wave check: one deliberate out-and-back hand movement relative to the same shoulder counts one demo cycle. These cycles are not saved as physiotherapy sessions.
- Manual: plus/minus controls only change the count during an active manual session. Counts cannot go below zero.

## Changes

Calibrated start, endpoint, and return zones are proportional to the recorded range and remain separate even for a 10-degree range. Invalid calibration falls back to demo thresholds. Demo thresholds are implementation settings, not prescribed rehabilitation angles; valid personal calibration takes precedence.

Tracking gaps longer than 400 ms, invalid angles/positions, lost landmarks, model exceptions, changes in movement/calibration, and non-monotonic timestamps discard unfinished cycles. Previous completed reps remain intact. The cycle timer starts when motion begins rather than while waiting at rest, so a brief angle spike after a long idle cannot become a rep.

Initial arming requires a steady pose. Following a completed rep, a shorter rearming interval supports consecutive natural movements. Sit-to-stand uses thigh orientation to reject standing starts and permits the expected vertical torso movement during a real rise. Upper-body movements use a consistent selected shoulder anchor; changing visibility of unrelated body points cannot shift that anchor.

## Verification

`tests/all-movement-counting.test.mjs` covers exact repeated counts, incomplete movement, static jitter, missing anchors, walking/body translation, small calibrated ranges, invalid calibration, tracking gaps, clock resets, endpoint holds, session reset, and continuous cycles at 10, 15, and 30 FPS. Existing natural elbow and wave tests remain in place.

`tests/rep-counting-browser-smoke.mjs` sends synthetic image/world landmarks through the app's actual angle calculation, smoothing, selected-side logic, rep counter, and visible count. It checks both sides for all four saved camera movements, rejects standing/walking starts, and verifies manual controls cannot change camera or inactive sessions.

These tests verify logic and integration with simulated observations. They do not certify pose-model accuracy on every real camera, lighting condition, viewpoint, or person. The app cannot prove chair contact or clinically correct form from these landmarks alone. Keep the selected joints visible, start still, and compare a short live demonstration against a human count.
