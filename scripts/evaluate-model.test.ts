// @vitest-environment node
import { readFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { createServer } from 'node:http'
import { promisify } from 'node:util'
import { describe, expect, it, vi } from 'vitest'
// These scripts are also exercised directly by Node in the documented command.
// @ts-expect-error JavaScript CLI has no declaration file.
import { evaluationCases } from './evaluation-cases.mjs'
// @ts-expect-error JavaScript CLI has no declaration file.
import { evaluateCase } from './evaluate-model.mjs'
import { createOllamaChecker } from '../src/checking/ollamaCore'
// @ts-expect-error JavaScript CLI has no declaration file.
import { summarize } from './summarize-evaluation.mjs'

const sample = { id: 'test', input: 'They works.', category: 'grammar' }
function response(content: string, finish_reason = 'stop') {
  return Response.json({ choices: [{ finish_reason, message: { role: 'assistant', content } }] })
}
function checker(outputs: Response[]) {
  const fetch = vi.fn()
  for (const output of outputs) fetch.mockResolvedValueOnce(output)
  return { fetch, check: createOllamaChecker({ prompt: 'actual prompt', model: 'test', serverUrl: 'http://localhost', fetch }) }
}

describe('model evaluation uses the application checking contract', () => {
  it('keeps all 24 fixture occurrences and 13 additional cases with stable unique IDs', async () => {
    const tests = await readFile(new URL('../tests.txt', import.meta.url), 'utf8')
    const cases = evaluationCases(tests)
    expect(cases).toHaveLength(37)
    expect(new Set(cases.map((item: { id: string }) => item.id)).size).toBe(37)
    expect(cases.slice(0, 24).map((item: { input: string }) => item.input)).toEqual(tests.trim().split(/\n\s*\n/))
    expect(evaluationCases(tests.replaceAll('\n', '\r\n'))).toEqual(cases)
  })

  it('reports only a stable suggestion and retains every refinement request', async () => {
    const { check, fetch } = checker([response('They work.'), response('They work.')])
    await expect(evaluateCase(check, sample)).resolves.toMatchObject({ outcome: 'stable', status: 'suggestion', result: 'They work.', words: { input: 2, result: 2 } })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetch.mock.calls[0][1].body).messages[0].content).toBe('actual prompt')
  })

  it.each([
    ['invalid', ['Corrected sentence: They work.']],
    ['cycle', ['They work.', sample.input]],
    ['limit', ['One.', 'Two.', 'Three.', 'Four.', 'Five.']],
  ])('classifies %s without publishing intermediate text', async (outcome, outputs) => {
    const { check } = checker((outputs as string[]).map(text => response(text)))
    await expect(evaluateCase(check, sample)).resolves.toMatchObject({ outcome, result: null })
  })

  it('rejects truncated envelopes using the same validator as the browser', async () => {
    const { check } = checker([response('They work.', 'length')])
    await expect(evaluateCase(check, sample)).resolves.toMatchObject({ outcome: 'invalid', result: null })
  })

  it('reports clean results and transport errors separately', async () => {
    const { check } = checker([response(sample.input)])
    await expect(evaluateCase(check, sample)).resolves.toMatchObject({ outcome: 'stable', status: 'clean', result: sample.input })
    await expect(evaluateCase(async () => { throw new Error('offline') }, sample)).resolves.toMatchObject({ outcome: 'error', result: null, error: 'offline' })
  })

  it('runs the real Node CLI with two complete sequential repetitions and summarizes its JSONL', async () => {
    let active = 0
    let maxActive = 0
    const requests: Record<string, unknown>[] = []
    const server = createServer(async (request, response) => {
      let raw = ''
      for await (const chunk of request) raw += chunk
      const body = raw ? JSON.parse(raw) : {}
      response.setHeader('Content-Type', 'application/json')
      if (request.url === '/api/version') response.end(JSON.stringify({ version: 'test' }))
      else if (request.url === '/api/tags') response.end(JSON.stringify({ models: [{ name: 'test', digest: 'test-digest' }] }))
      else if (request.url === '/v1/chat/completions') {
        active += 1
        maxActive = Math.max(active, maxActive)
        requests.push(body)
        response.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: body.messages[1].content } }] }))
        active -= 1
      } else response.end('{}')
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    try {
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('Missing test server address')
      const env = { ...process.env, EVALUATION_SUITE: 'legacy', OLLAMA_MODEL: 'test', OLLAMA_SERVER_URL: `http://127.0.0.1:${address.port}`, EVALUATION_REPEATS: '2' }
      const { stdout } = await promisify(execFile)(process.execPath, ['--experimental-strip-types', 'scripts/evaluate-model.mjs'], { env, maxBuffer: 2_000_000 })
      const records = stdout.trim().split('\n').map(line => JSON.parse(line))
      expect(records[0]).toMatchObject({ type: 'run', model: 'test', digest: 'test-digest', repeats: 2, caseCount: 37 })
      expect(records[0].promptSha256).toMatch(/^[0-9a-f]{64}$/)
      expect(records[1].type).toBe('warmup')
      expect(requests).toHaveLength(74)
      expect(maxActive).toBe(1)
      expect(requests[0]).toMatchObject({ temperature: 0, max_tokens: 2048, reasoning_effort: 'none' })
      const summary = summarize(records)
      expect(summary).toMatchObject({ outcomes: { stable: 74, error: 0 }, clean: 74, requests: 74, repeatDifferences: [] })
      const oldManifest = records.map(record => record.type === 'run' ? { ...record, schemaVersion: 1, suite: undefined } : record)
      expect(summarize(oldManifest)).toMatchObject({ suite: { name: 'legacy', version: 1 }, caseCount: 37 })
      const changed = records.map(record => record.type === 'case' && record.repeat === 2 && record.id === 'sample-01'
        ? { ...record, outcome: 'cycle', status: undefined, result: null } : record)
      expect(summarize(changed)).toMatchObject({ outcomes: { stable: 73, cycle: 1 }, repeatDifferences: ['sample-01'] })
      expect(summary.latencyMs.median).toBeGreaterThanOrEqual(0)
      expect(summary.latencyMs.p95).toBeGreaterThanOrEqual(summary.latencyMs.median)
      expect(() => summarize(records.slice(0, -1))).toThrow('Incomplete')
      expect(() => summarize([...records, records[2]])).toThrow('duplicate')
      await expect(promisify(execFile)(process.execPath, ['--experimental-strip-types', 'scripts/evaluate-model.mjs'], { env: { ...env, EVALUATION_REPEATS: '0' } })).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('EVALUATION_REPEATS') })
      await expect(promisify(execFile)(process.execPath, ['--experimental-strip-types', 'scripts/evaluate-model.mjs'], { env: { ...env, OLLAMA_MODEL: 'missing' } })).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('not installed') })
      await expect(promisify(execFile)(process.execPath, ['--experimental-strip-types', 'scripts/evaluate-model.mjs'], { env: { ...env, OLLAMA_SERVER_URL: 'file:///tmp' } })).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('HTTP(S)') })
      await expect(promisify(execFile)(process.execPath, ['--experimental-strip-types', 'scripts/evaluate-model.mjs'], { env: { ...env, EVALUATION_SUITE: 'unknown' } })).rejects.toMatchObject({ code: 1, stderr: expect.stringContaining('EVALUATION_SUITE') })

      requests.length = 0
      const benchmark = await promisify(execFile)(process.execPath, ['--experimental-strip-types', 'scripts/evaluate-model.mjs'], { env: { ...env, EVALUATION_SUITE: 'editing-v1' }, maxBuffer: 4_000_000 })
      const benchmarkRecords = benchmark.stdout.trim().split('\n').map(line => JSON.parse(line))
      expect(benchmarkRecords[0]).toMatchObject({ schemaVersion: 2, caseCount: 60, repeats: 2, suite: { name: 'editing-v1', version: 1 } })
      expect(benchmarkRecords[0].suite.datasetSha256).toMatch(/^[0-9a-f]{64}$/)
      expect(benchmarkRecords[0].suite.rubricSha256).toMatch(/^[0-9a-f]{64}$/)
      expect(requests).toHaveLength(120)
      expect(maxActive).toBe(1)
      const prompt = await readFile(new URL('../prompt.txt', import.meta.url), 'utf8')
      for (const [index, request] of requests.entries()) {
        const messages = request.messages as { role: string, content: string }[]
        expect(messages.map(message => message.role)).toEqual(['system', 'user'])
        expect(messages[0].content).toBe(prompt)
        expect(messages[1].content).toBe(benchmarkRecords[index + 2].input)
        expect(Object.keys(messages[1])).toEqual(['role', 'content'])
      }
      expect(summarize(benchmarkRecords)).toMatchObject({ suite: { name: 'editing-v1', version: 1 },
        unchangedControls: { total: 24, stable: 24, unchanged: 24 },
        contrastPairs: { total: 24, comparable: 24, withheld: 0, collisions: [] } })
      const pairCollision = benchmarkRecords.map(record => record.type === 'case' && record.id === 'P01A' && record.repeat === 1
        ? { ...record, status: 'suggestion', result: 'The board has closed the branch.' } : record)
      expect(summarize(pairCollision).contrastPairs.collisions).toEqual([{ pairId: 'P01', repeat: 1 }])
      const changedControl = benchmarkRecords.map(record => record.type === 'case' && record.id === 'N01' && record.repeat === 1
        ? { ...record, status: 'suggestion', result: 'The equipment is prepared.' } : record)
      expect(summarize(changedControl).unchangedControls).toEqual({ total: 24, stable: 24, unchanged: 23 })
      const withheld = benchmarkRecords.map(record => record.type === 'case' && ['P01A', 'N01'].includes(record.id) && record.repeat === 1
        ? { ...record, outcome: 'cycle', status: undefined, result: null } : record)
      expect(summarize(withheld)).toMatchObject({ unchangedControls: { total: 24, stable: 23, unchanged: 23 },
        contrastPairs: { total: 24, comparable: 23, withheld: 1, collisions: [] } })
      const malformedPair = benchmarkRecords.map(record => record.type === 'case' && record.id === 'P01A' ? { ...record, variant: 'B' } : record)
      expect(() => summarize(malformedPair)).toThrow('Incomplete contrast pair')
      const invalidVariant = benchmarkRecords.map(record => record.type === 'case' && record.id === 'P01A' ? { ...record, variant: 'C' } : record)
      expect(() => summarize(invalidVariant)).toThrow('pair metadata')
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  })
})
