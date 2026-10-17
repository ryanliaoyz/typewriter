import { readFile } from 'node:fs/promises'

const base = (process.env.OLLAMA_SERVER_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '')
const model = process.env.OLLAMA_MODEL || 'gemma2:9b-instruct-q4_K_M'
const maxPasses = 5
const prompt = await readFile(new URL('../prompt.txt', import.meta.url), 'utf8')
const samples = (await readFile(new URL('../tests.txt', import.meta.url), 'utf8')).trim().split(/\n\s*\n/)
samples.push(
  'Irregardless of the fact that we spent a substantial total amount of six whole hours discussing about the matter, little progress was actually made due to the reason that the internet connection was running slow.',
  'Although the team had all the necessary prerequesits in order to begin the task at hand, none of the managers were able to clearly define what the exact main objective was, which caused alot of confussion.',
  'Furthermore, each and every person who participated in the meeting has given their own different opinion on how to best solve the pending issue.',
  'Furthermore, each person who participated in the meeting offered a different opinion on how best to solve the pending issue.',
  'Furthermore, each person who participated in the meeting has given a different opinion on how best to solve the pending issue.',
  'Every employee who attended the workshop has shared a separate proposal for resolving the outstanding problem.',
  'The measurements were somewhat unusual, but they have remained approximately consistent.',
  'Albeit the lead researcher along with his primary assistants was unaware of the new criterion, they managed to complete the assessment in a timely manner, which ultimately resulted in having a positive beneficial effect on the entire teams overall productivity.',
  'The change may ultimately improve the entire team\'s overall productivity, but it has not yet done so.',
  'Only some participants have said that the change might improve overall productivity.',
  'The treatment did not reduce mortality, although it may have improved comfort.',
  'The new process reduced average latency by approximately 10%, but it did not improve overall throughput.',
  'In spite of the fact that the software update was intended to make improvements to the systems security, a large number of users who are currently utilizing the platform has reported that it is causing a negative impact on their daily workflow at this point in time.',
)

function wordCount(text) {
  return typeof text === 'string' && text.trim() ? text.trim().split(/\s+/).length : null
}

async function check(text) {
  const response = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({
      model, messages: [{ role: 'system', content: prompt }, { role: 'user', content: text }],
      stream: false, temperature: 0, max_tokens: 2048, reasoning_effort: 'none',
    }),
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

// Print the refinement trace for manual output-contract and linguistic review.
// Equality measures stability; word counts measure size. Neither proves fidelity.
for (const [index, input] of samples.entries()) {
  const passes = []
  try {
    let candidate = input
    const seen = new Set([input])
    let outcome = 'limit'
    for (let pass = 0; pass < maxPasses; pass += 1) {
      const body = await check(candidate)
      passes.push(body)
      const next = body.choices?.[0]?.message?.content?.trim()
      if (body.choices?.[0]?.finish_reason !== 'stop' || !next) {
        outcome = 'invalid'
        break
      }
      if (next === candidate) {
        outcome = 'stable'
        break
      }
      if (seen.has(next)) {
        outcome = 'cycle'
        break
      }
      seen.add(next)
      candidate = next
    }
    const result = outcome === 'stable' ? candidate : null
    const words = { input: wordCount(input), result: wordCount(result) }
    console.log(JSON.stringify({ index: index + 1, model, input, outcome, words, result, passes }))
  } catch (error) {
    console.log(JSON.stringify({ index: index + 1, model, input, passes, error: error.message }))
    process.exitCode = 1
  }
}
