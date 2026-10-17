import { readFile } from 'node:fs/promises'

const base = (process.env.OLLAMA_SERVER_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '')
const model = process.env.OLLAMA_MODEL || 'gemma2:9b-instruct-q4_K_M'
const prompt = await readFile(new URL('../prompt.txt', import.meta.url), 'utf8')
const samples = (await readFile(new URL('../tests.txt', import.meta.url), 'utf8')).trim().split(/\n\s*\n/)
samples.push(
  'Irregardless of the fact that we spent a substantial total amount of six whole hours discussing about the matter, little progress was actually made due to the reason that the internet connection was running slow.',
  'Although the team had all the necessary prerequesits in order to begin the task at hand, none of the managers were able to clearly define what the exact main objective was, which caused alot of confussion.',
)

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

// Print both raw envelopes for manual output-contract and linguistic review.
// Equality measures stability, not grammatical correctness.
for (const [index, input] of samples.entries()) {
  try {
    const first = await check(input)
    const candidate = first.choices?.[0]?.message?.content?.trim()
    const second = first.choices?.[0]?.finish_reason === 'stop' && candidate ? await check(candidate) : null
    const stable = second?.choices?.[0]?.finish_reason === 'stop' && second.choices[0].message.content?.trim() === candidate
    console.log(JSON.stringify({ index: index + 1, model, input, stable, first, second }))
  } catch (error) {
    console.log(JSON.stringify({ index: index + 1, model, input, error: error.message }))
    process.exitCode = 1
  }
}
