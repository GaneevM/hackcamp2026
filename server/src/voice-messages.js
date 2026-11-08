export const voiceMessages = {
  quiet: {
    session_started: null,
    rep_completed: null,
    tracking_lost:
      "Tracking paused. The camera cannot clearly see the joints needed for this movement.",
    tracking_restored: null,
    session_ended: null
  },

  concise: {
    session_started:
      "Session started.",
    rep_completed:
      null,
    tracking_lost:
      "Tracking paused. Keep your joints needed for this movement in view.",
    tracking_restored:
      "Tracking restored.",
    session_ended:
      "Session ended."
  },

  encouraging: {
    session_started:
      "Your session has started. You can pause whenever you need.",
    rep_completed:
      null,
    tracking_lost:
      "Tracking is paused. When you're ready, check that the camera can see your joints needed for this movement.",
    tracking_restored:
      "The joints for this movement are back in view.",
    session_ended:
      "Your session has ended."
  }
};

for (const mode of ['concise', 'encouraging']) Object.assign(voiceMessages[mode], {
  question_goal: 'Would you like to add context about ending below the repetition goal?',
  question_tracking: 'Would you like to add context about the tracking interruptions?',
  question_cycle: 'Would you like to add context about the incomplete movement cycles?',
  question_general: 'Would you like to add any context about this session?'
});

export function getVoiceMessage(event, mode = "concise") {
  if (!Object.hasOwn(voiceMessages, mode)) {
    throw new Error("Unknown speaking mode.");
  }

  if (!Object.hasOwn(voiceMessages[mode], event)) {
    throw new Error("Unknown session event.");
  }

  return voiceMessages[mode][event];
}