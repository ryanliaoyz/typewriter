import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { createOllamaChecker, MAX_EDIT_PASSES, REQUEST_TIMEOUT_MS, UnusableResponseError } from '../src/checking/ollamaCore.ts'
import { loadEvaluationSuite } from './evaluation-suites.mjs'

export async function evaluateCase(check, sample) {
  const started = performance.now()
  try {
    const result = await check({ id: sample.id, version: 1, text: sample.input })
    const text = result.status === 'clean' ? sample.input : result.suggestion
    return { ...sample, outcome: 'stable', status: result.status, result: text, elapsedMs: performance.now() - started,
      words: { input: wordCount(sample.input), result: wordCount(text) } }
  } catch (error) {
    return { ...sample, outcome: error instanceof UnusableResponseError ? error.outcome : 'error',
      result: null, elapsedMs: performance.now() - started, error: error.message, details: error.details ?? null }
  }
}

function wordCount(text) { return text.trim().split(/\s+/).length }
function hash(text) { return createHash('sha256').update(text).digest('hex') }

async function main() {
  const serverUrl = (process.env.OLLAMA_SERVER_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '')
  const url = new URL(serverUrl)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('OLLAMA_SERVER_URL must be an HTTP(S) base URL without credentials, query, or fragment.')
  }
  const model = process.env.OLLAMA_MODEL || 'gemma2:9b-instruct-q4_K_M'
  const repeats = Number(process.env.EVALUATION_REPEATS || 1)
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > 3) throw new Error('EVALUATION_REPEATS must be 1, 2, or 3.')
  const prompt = await readFile(new URL('../prompt.txt', import.meta.url), 'utf8')
  const { cases, ...suite } = await loadEvaluationSuite(process.env.EVALUATION_SUITE || 'legacy')
  async function metadata(path, body, timeoutMs = 10_000) {
    const response = await fetch(`${serverUrl}${path}`, {
      ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) throw new Error(`Metadata ${path}: HTTP ${response.status}`)
    return response.json()
  }
  const version = await metadata('/api/version')
  const tags = await metadata('/api/tags')
  const installed = tags.models?.find(item => item.name === model || item.model === model)
  if (!installed) throw new Error(`Model ${model} is not installed. Pull it explicitly before evaluation.`)
  const show = await metadata('/api/show', { model })
  console.log(JSON.stringify({ type: 'run', schemaVersion: 2, suite, startedAt: new Date().toISOString(),
    model, digest: installed.digest, modelDetails: installed.details, modelParameters: show.parameters,
    node: process.version, platform: process.platform, ollamaVersion: version.version,
    promptSha256: hash(prompt), ...(suite.testsSha256 ? { testsSha256: suite.testsSha256 } : {}), casesSha256: hash(JSON.stringify(cases)),
    settings: { temperature: 0, maxTokens: 2048, reasoningEffort: 'none', maxPasses: MAX_EDIT_PASSES, timeoutMs: REQUEST_TIMEOUT_MS },
    repeats, caseCount: cases.length }))

  // Warm-up is reported separately and excluded from sentence latency summaries.
  const warmupStart = performance.now()
  await metadata('/api/generate', { model, prompt: '', stream: false, keep_alive: '30m' }, REQUEST_TIMEOUT_MS)
  console.log(JSON.stringify({ type: 'warmup', elapsedMs: performance.now() - warmupStart, residency: await metadata('/api/ps') }))
  let passes = []
  const check = createOllamaChecker({ prompt, model, serverUrl, fetch: async (url, init) => {
    const start = performance.now()
    const response = await fetch(url, init)
    const raw = await response.clone().text()
    let body
    try { body = JSON.parse(raw) } catch { body = raw }
    passes.push({ input: JSON.parse(init.body).messages[1].content, elapsedMs: performance.now() - start,
      httpStatus: response.status, body })
    return response
  } })
  for (let repeat = 1; repeat <= repeats; repeat += 1) {
    for (const sample of cases) {
      passes = []
      const result = await evaluateCase(check, sample)
      console.log(JSON.stringify({ type: 'case', model, repeat, ...result, passes }))
      if (result.outcome === 'error') process.exitCode = 1
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
