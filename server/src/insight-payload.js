export function buildInsightPayload(records, includeUserContext = false) {
  return {
    dataSource:'actual_exercise_journal', useContext:'non_clinical_hackathon_demo',
    measurementLimitations:[
      'Camera-derived angles are unvalidated estimates, not clinical measurements.',
      'Minimum and maximum angles are observed extrema, not sustained holds.',
      'Completion intervals include pauses; they are not movement duration.',
      'Tracking losses and incomplete cycles are totals, not an event timeline.'
    ],
    sessions:records.map(({session:s, metrics:m, userReportedContext = []}, index) => ({
      sessionNumber:index + 1, exercise:s.exercise, movement:s.movement, side:s.side,
      recordedDate:s.date.slice(0,10), source:m.source,
      ...(s.variant?{variation:s.variant}:{}), ...(s.form?{alignmentMatch:s.form.average}:{}),
      completedReps:s.reps, targetReps:m.targetReps, durationSeconds:m.durationSeconds,
      angleConvention:m.angleConvention,
      minimumObservedAngleDeg:m.minimumObservedAngleDeg, maximumObservedAngleDeg:m.maximumObservedAngleDeg,
      trackingValidFraction:m.trackingValidFraction, trackingLossEvents:m.trackingLossEvents,
      incompleteCycles:m.incompleteCycles, medianCompletionIntervalSeconds:m.medianCompletionIntervalSeconds,
      ...(includeUserContext ? { userReported:{
        pain:s.pain, confidence:s.confidence, sessionNote:s.note,
        explanations:userReportedContext.map(item => item.answer)
      }} : {})
    }))
  };
}
