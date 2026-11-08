export const voiceMessages = {
  quiet: {
    session_started: null,
    rep_completed: null,
    tracking_lost:
      "Tracking paused. The camera cannot clearly see the selected arm.",
    tracking_restored: null,
    session_ended: null
  },

  concise: {
    session_started:
      "Session started.",
    rep_completed:
      "Repetition recorded.",
    tracking_lost:
      "Tracking paused. Keep your selected shoulder, elbow, and wrist in view.",
    tracking_restored:
      "Tracking restored.",
    session_ended:
      "Session ended."
  },

  encouraging: {
    session_started:
      "Your session has started. You can pause whenever you need.",
    rep_completed:
      "Another repetition recorded.",
    tracking_lost:
      "Tracking is paused. When you're ready, check that the camera can see your selected arm.",
    tracking_restored:
      "Your selected arm is back in view.",
    session_ended:
      "Your session has ended. Would you like to add any context about how it went?"
  }
};

export function getVoiceMessage(event, mode = "concise") {
  if (!Object.hasOwn(voiceMessages, mode)) {
    throw new Error("Unknown speaking mode.");
  }

  if (!Object.hasOwn(voiceMessages[mode], event)) {
    throw new Error("Unknown session event.");
  }

  return voiceMessages[mode][event];
}