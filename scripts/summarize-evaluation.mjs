import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b)
  if (fraction === 0.5 && sorted.length && sorted.length % 2 === 0) {
    return (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
  }
  return sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] : null
}

export function summarize(records) {
  const run = records.find(record => record.type === 'run')
  if (!run) throw new Error('Missing run manifest.')
  const cases = records.filter(record => record.type === 'case')
  const outcomes = Object.fromEntries(['stable', 'cycle', 'limit', 'invalid', 'error'].map(outcome => [outcome, cases.filter(item => item.outcome === outcome).length]))
  const grouped = Map.groupBy(cases, item => item.id)
  const repeatDifferences = [...grouped].filter(([, items]) => new Set(items.map(item => JSON.stringify([item.outcome, item.result]))).size > 1).map(([id]) => id)
  const expected = run.caseCount * run.repeats
  const identities = new Set(cases.map(item => `${item.id}:${item.repeat}`))
  if (cases.length !== expected || identities.size !== expected || grouped.size !== run.caseCount ||
    [...grouped.values()].some(items => items.length !== run.repeats || items.some(item => !Number.isInteger(item.repeat) || item.repeat < 1 || item.repeat > run.repeats))) {
    throw new Error(`Incomplete or duplicate run: expected ${expected} unique case/repeat records, got ${cases.length}.`)
  }
  const passes = cases.flatMap(item => item.passes)
  const stable = cases.filter(item => item.outcome === 'stable')
  return {
    model: run.model, digest: run.digest, caseCount: run.caseCount, repeats: run.repeats,
    outcomes, clean: cases.filter(item => item.status === 'clean').length,
    suggestions: cases.filter(item => item.status === 'suggestion').length,
    requests: passes.length, repeatDifferences,
    latencyMs: { median: percentile(cases.map(item => item.elapsedMs), 0.5), p95: percentile(cases.map(item => item.elapsedMs), 0.95),
      max: Math.max(...cases.map(item => item.elapsedMs)), stableMedian: percentile(stable.map(item => item.elapsedMs), 0.5),
      stableP95: percentile(stable.map(item => item.elapsedMs), 0.95) },
    passCounts: Object.fromEntries([1, 2, 3, 4, 5].map(count => [count, cases.filter(item => item.passes.length === count).length])),
    categories: Object.fromEntries([...Map.groupBy(cases, item => item.category)].map(([category, items]) => [category, {
      total: items.length, stable: items.filter(item => item.outcome === 'stable').length,
      unchanged: items.filter(item => item.status === 'clean').length,
    }])),
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length < 3) { console.error('Usage: npm run evaluate:summarize -- <run.jsonl> [<run.jsonl> ...]'); process.exitCode = 1 }
  for (const path of process.argv.slice(2)) {
    try {
      const records = (await readFile(path, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
      console.log(JSON.stringify(summarize(records)))
    } catch (error) { console.error(`${path}: ${error.message}`); process.exitCode = 1 }
  }
}
