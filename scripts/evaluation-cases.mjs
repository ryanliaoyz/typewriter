// Preserve tests.txt verbatim; assign occurrence-based IDs for repeatable review.
export function evaluationCases(tests) {
  const inputs = tests.trim().split(/\r?\n\s*\r?\n/)
  const cases = inputs.map((input, index) => ({
    id: `sample-${String(index + 1).padStart(2, '0')}`,
    category: index < 8 ? 'grammar' : index < 16 ? 'compression' : 'valid-prose',
    input,
  }))
  const extras = [
    ['long-redundancy', 'compression', 'Irregardless of the fact that we spent a substantial total amount of six whole hours discussing about the matter, little progress was actually made due to the reason that the internet connection was running slow.'],
    ['prerequisites', 'grammar', 'Although the team had all the necessary prerequesits in order to begin the task at hand, none of the managers were able to clearly define what the exact main objective was, which caused alot of confussion.'],
    ['meeting-original', 'fidelity', 'Furthermore, each and every person who participated in the meeting has given their own different opinion on how to best solve the pending issue.'],
    ['meeting-simple-past', 'fidelity', 'Furthermore, each person who participated in the meeting offered a different opinion on how best to solve the pending issue.'],
    ['meeting-present-perfect', 'fidelity', 'Furthermore, each person who participated in the meeting has given a different opinion on how best to solve the pending issue.'],
    ['workshop', 'fidelity', 'Every employee who attended the workshop has shared a separate proposal for resolving the outstanding problem.'],
    ['measurements', 'fidelity', 'The measurements were somewhat unusual, but they have remained approximately consistent.'],
    ['researcher', 'compression', 'Albeit the lead researcher along with his primary assistants was unaware of the new criterion, they managed to complete the assessment in a timely manner, which ultimately resulted in having a positive beneficial effect on the entire teams overall productivity.'],
    ['not-yet', 'fidelity', "The change may ultimately improve the entire team's overall productivity, but it has not yet done so."],
    ['attribution', 'fidelity', 'Only some participants have said that the change might improve overall productivity.'],
    ['negation', 'fidelity', 'The treatment did not reduce mortality, although it may have improved comfort.'],
    ['precision', 'fidelity', 'The new process reduced average latency by approximately 10%, but it did not improve overall throughput.'],
    ['software-update', 'compression', 'In spite of the fact that the software update was intended to make improvements to the systems security, a large number of users who are currently utilizing the platform has reported that it is causing a negative impact on their daily workflow at this point in time.'],
  ]
  return [...cases, ...extras.map(([id, category, input]) => ({ id, category, input }))]
}
