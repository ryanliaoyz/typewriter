import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { evaluationCases } from './evaluation-cases.mjs'

const hash = text => createHash('sha256').update(text).digest('hex')
const nonempty = value => typeof value === 'string' && value.trim().length > 0

/** Validate annotations before any server requests; never send them as model input. */
export function parseBenchmarkCases(text) {
  const cases = text.trim().split(/\r?\n/).map((line, index) => {
    try { return JSON.parse(line) } catch { throw new Error(`Invalid benchmark JSON on line ${index + 1}.`) }
  })
  const ids = new Set()
  const inputs = new Set()
  const intents = { grammar: 'repair', compression: 'compress', 'valid-prose': 'preserve', fidelity: 'preserve' }
  for (const item of cases) {
    const fail = reason => { throw new Error(`Invalid benchmark case ${item?.id ?? '(missing ID)'}: ${reason}`) }
    if (!item || typeof item !== 'object' || Array.isArray(item)) fail('expected an object.')
    for (const key of ['id', 'family', 'input', 'source', 'reviewStatus']) {
      if (!nonempty(item[key])) fail(`missing ${key}.`)
    }
    if (ids.has(item.id)) fail('duplicate ID.')
    if (inputs.has(item.input)) fail('duplicate input.')
    ids.add(item.id)
    inputs.add(item.input)
    if (!Object.hasOwn(intents, item.category) || item.intent !== intents[item.category]) fail('category/intent mismatch.')
    if (!['draft', 'reviewed'].includes(item.reviewStatus)) fail('unknown review status.')
    for (const key of ['requiredImprovements', 'mustPreserve', 'mustNotImply', 'referenceExamples']) {
      if (!Array.isArray(item[key]) || !item[key].every(nonempty)) fail(`expected a string array for ${key}.`)
    }
    if (!item.mustPreserve.length) fail('at least one meaning constraint is required.')
    if (item.intent !== 'preserve' && (!item.requiredImprovements.length || !item.referenceExamples.length)) {
      fail('repair/compression cases need required improvements and illustrative references.')
    }
    if (item.intent === 'preserve' && item.requiredImprovements.length) fail('preserve cases cannot require an edit.')
    if (item.category === 'valid-prose' ? item.expectUnchanged !== true : item.expectUnchanged !== undefined) {
      fail('only valid-prose controls must declare expectUnchanged: true.')
    }
    if (item.category === 'fidelity') {
      if (!nonempty(item.pairId) || !nonempty(item.pairDistinction) || !['A', 'B'].includes(item.variant)) fail('incomplete contrast-pair metadata.')
      if (item.id !== `${item.pairId}${item.variant}`) fail('pair ID and variant must identify the case.')
    } else if (['pairId', 'variant', 'pairDistinction'].some(key => item[key] !== undefined)) fail('pair metadata on a non-pair case.')
  }
  for (const [id, pair] of Map.groupBy(cases.filter(item => item.pairId), item => item.pairId)) {
    if (pair.length !== 2 || new Set(pair.map(item => item.variant)).size !== 2 ||
      pair[0].family !== pair[1].family || pair[0].pairDistinction !== pair[1].pairDistinction) {
      throw new Error(`Invalid contrast pair ${id}: expected distinct A/B variants with matching family and distinction.`)
    }
  }
  return cases
}

export async function loadEvaluationSuite(name = 'legacy') {
  if (name === 'legacy') {
    const tests = await readFile(new URL('../tests.txt', import.meta.url), 'utf8')
    return { name, version: 1, cases: evaluationCases(tests), testsSha256: hash(tests) }
  }
  if (name !== 'editing-v1') throw new Error(`Unknown EVALUATION_SUITE: ${name}. Choose legacy or editing-v1.`)
  const base = new URL('../benchmarks/editing-v1/', import.meta.url)
  const text = await readFile(new URL('cases.jsonl', base), 'utf8')
  const rubric = await readFile(new URL('rubric.md', base), 'utf8')
  return { name, version: 1, cases: parseBenchmarkCases(text), datasetSha256: hash(text), rubricSha256: hash(rubric) }
}
