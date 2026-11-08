# Push-up demo implementation

Uses the existing MediaPipe Pose Landmarker on-device. Its image landmarks gate framing and visibility; its estimated world landmarks supply 3D angles. No video is uploaded. No extra AI API or account is needed.

## Guidance and limits

- [South Tees NHS physiotherapy: combined press ups](https://www.southtees.nhs.uk/resources/combined-press-ups/) describes wall and knee versions, keeping the trunk steady, and using the range the person can manage. Repetitions follow the physiotherapist's instruction.
- [ACE push-up technique](https://www.acefitness.org/resources/everyone/exercise-library/41/push-up/) describes a steady torso, avoiding sagging or raised hips, and bending then extending the elbows.
- [MediaPipe Pose Landmarker documentation](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker) documents image and world landmarks. World coordinates are model estimates; this app has no clinical angle accuracy validation.

These sources do not establish a universally correct rehabilitation elbow angle. Default flexion thresholds (25 degrees at the top, 65 degrees at the bottom), alignment tolerances, visibility gates, and hold times are prototype engineering choices. They are not clinical prescriptions. Quick calibration replaces rep thresholds with the person's comfortable top/bottom angles, separately for variation and side. Baselines outside the supported range use explicitly labeled demo defaults.

## Measurement

Elbow flexion = 180 minus shoulder–elbow–wrist angle. Body line = shoulder–hip–ankle, or shoulder–hip–knee with knees supported. Floor/wall versions also check hip–knee–ankle extension. A 10-degree dead band and gradual penalties generate an alignment match score. This measures only visible geometry, not probability of correct form, pain, safety, muscle activation, scapular motion, or recovery.

Whole required near-side chain must be visible and inside frame. A coarse side-view and body-orientation gate rejects obvious frontal/upright floor poses. Camera roll or oblique placement can still affect results; repeat with a level side camera. Both left and right choices are supported. Knee mode intentionally does not require ankle visibility.

Rep state: steady top (350 ms), bend past target (150 ms), return to top (250 ms), minimum 1 second per rep. Repeated top holds and shallow bends do not count. Missing pose, frame gaps over 500 ms, and attempts over 30 seconds discard the unfinished rep. Completed reps retain average alignment and peak bend; poor alignment is reflected in the score and cue, not silently labeled a correct rep.

Session records store variation, rep scores, peak bend and duration; progress and visit notes expose the summary. The angle trend measures depth and does not treat deeper as better recovery. Check-in ratings remain subjective user entries.

## Checks

Run `node pushup.test.mjs` for synthetic geometry and state-machine checks. This does not replace a real camera trial, clinician review, or validation across bodies, lighting and devices.
