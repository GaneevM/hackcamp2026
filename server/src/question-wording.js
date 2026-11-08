const fallbackQuestion='Would you like to add any context about this session?';
export function checkQuestion(question) {
  const unsupportedTiming =
    /\b(today|yesterday|tomorrow|tonight|final|finally|last|first|earlier|later|initially|eventually)\b|\bat the (end|start|beginning)\b|\bmost recent\b/i;

  if (
    unsupportedTiming.test(question) ||
    question.split(/\s+/).length > 40
  ) {
    return fallbackQuestion;
  }

  return question;
}
