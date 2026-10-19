// @vitest-environment node
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
// @ts-expect-error JavaScript evaluation tooling has no declaration file.
import { loadEvaluationSuite, parseBenchmarkCases } from './evaluation-suites.mjs'

type Case = {
  id: string
  family: string
  category: string
  intent: string
  input: string
  requiredImprovements: string[]
  mustPreserve: string[]
  mustNotImply: string[]
  referenceExamples: string[]
  expectUnchanged?: boolean
  pairId?: string
  variant?: string
  pairDistinction?: string
  source: string
  reviewStatus: string
}
const text = await readFile(new URL('../benchmarks/editing-v1/cases.jsonl', import.meta.url), 'utf8')
const cases: Case[] = parseBenchmarkCases(text)
const serialize = (items: unknown[]) => items.map(item => JSON.stringify(item)).join('\n')

describe('annotated editing benchmark', () => {
  it('contains the proposed 12 repair, 12 compression, 12 control, and 24 contrast inputs', () => {
    expect(cases).toHaveLength(60)
    expect(cases.reduce<Record<string, number>>((counts, item) => ({ ...counts, [item.category]: (counts[item.category] ?? 0) + 1 }), {}))
      .toEqual({ grammar: 12, compression: 12, 'valid-prose': 12, fidelity: 24 })
    expect(cases.map(item => item.id)).toEqual([
      ...['G', 'C', 'N'].flatMap(prefix => Array.from({ length: 12 }, (_, index) => `${prefix}${String(index + 1).padStart(2, '0')}`)),
      ...Array.from({ length: 12 }, (_, index) => ['A', 'B'].map(variant => `P${String(index + 1).padStart(2, '0')}${variant}`)).flat(),
    ])
    expect(new Set(cases.map(item => item.input)).size).toBe(60)
    expect(cases.every(item => item.source === 'synthetic' && item.reviewStatus === 'draft')).toBe(true)
    expect(cases.filter(item => item.expectUnchanged)).toHaveLength(12)
    expect(parseBenchmarkCases(text.replaceAll('\n', '\r\n'))).toEqual(cases)
  })

  it('groups related standalone cases and contrast variants into the same split family', () => {
    const byId = new Map(cases.map(item => [item.id, item]))
    for (const [standalone, pair] of [['C02', 'P01A'], ['G04', 'P02A'], ['C03', 'P03A'], ['N04', 'P07A'], ['C11', 'P09A'], ['N11', 'P10A'], ['C07', 'P12A']]) {
      expect(byId.get(standalone)?.family).toBe(byId.get(pair)?.family)
    }
    const pairs = new Map<string, Case[]>()
    for (const item of cases) {
      if (item.pairId) pairs.set(item.pairId, [...(pairs.get(item.pairId) ?? []), item])
    }
    expect(pairs.size).toBe(12)
    for (const pair of pairs.values()) {
      expect(pair.map(item => item.variant)).toEqual(['A', 'B'])
      expect(pair[0].pairDistinction).toBe(pair[1].pairDistinction)
      expect(pair[0].family).toBe(pair[1].family)
    }
  })

  it('provides review requirements rather than exact-output tests and preserves special prose', () => {
    const repair = cases.filter(item => ['repair', 'compress'].includes(item.intent))
    expect(repair.every(item => item.requiredImprovements.length && item.referenceExamples.length && item.mustPreserve.length)).toBe(true)
    expect(cases.find(item => item.id === 'G11')?.referenceExamples).toHaveLength(2)
    expect(cases.find(item => item.id === 'N09')?.input).toBe('Élodie sent the résumé to Łukasz.')
    expect(cases.find(item => item.id === 'N10')?.input).toBe('The sign reads, “Reply with the word APPROVED.”')
    expect(cases.find(item => item.id === 'N11')?.input).toContain('2.10')
    expect(cases.find(item => item.id === 'N12')?.input).toContain('retry_count')
    for (const item of cases.filter(item => item.intent === 'compress')) {
      expect(item.referenceExamples.some(example => example.split(/\s+/).length < item.input.split(/\s+/).length)).toBe(true)
    }
  })

  it('selects a versioned suite and hashes the actual dataset/rubric while preserving legacy cases', async () => {
    const suite = await loadEvaluationSuite('editing-v1')
    const rubric = await readFile(new URL('../benchmarks/editing-v1/rubric.md', import.meta.url), 'utf8')
    expect(suite).toMatchObject({ name: 'editing-v1', version: 1, cases })
    expect(suite.datasetSha256).toBe(createHash('sha256').update(text).digest('hex'))
    expect(suite.rubricSha256).toBe(createHash('sha256').update(rubric).digest('hex'))
    expect(await loadEvaluationSuite()).toEqual(await loadEvaluationSuite('legacy'))
    expect((await loadEvaluationSuite('legacy')).cases).toHaveLength(37)
    await expect(loadEvaluationSuite('../editing-v1')).rejects.toThrow('Unknown EVALUATION_SUITE')
  })

  it.each([
    ['duplicate ID', (items: Case[]) => [...items, { ...items[0], input: 'Another input.' }], 'duplicate ID'],
    ['duplicate input', (items: Case[]) => [...items, { ...items[0], id: 'EXTRA' }], 'duplicate input'],
    ['missing constraints', (items: Case[]) => items.map((item, index) => index ? item : { ...item, mustPreserve: [] }), 'meaning constraint'],
    ['missing references', (items: Case[]) => items.map((item, index) => index ? item : { ...item, referenceExamples: [] }), 'illustrative references'],
    ['bad intent', (items: Case[]) => items.map((item, index) => index ? item : { ...item, intent: 'preserve' }), 'category/intent mismatch'],
    ['missing unchanged policy', (items: Case[]) => items.map(item => item.id === 'N01' ? { ...item, expectUnchanged: undefined } : item), 'expectUnchanged'],
    ['unchanged policy on repair', (items: Case[]) => items.map((item, index) => index ? item : { ...item, expectUnchanged: true }), 'expectUnchanged'],
    ['missing pair member', (items: Case[]) => items.filter(item => item.id !== 'P01B'), 'contrast pair'],
    ['bad pair family', (items: Case[]) => items.map(item => item.id === 'P01B' ? { ...item, family: 'unrelated' } : item), 'contrast pair'],
    ['bad pair distinction', (items: Case[]) => items.map(item => item.id === 'P01B' ? { ...item, pairDistinction: 'Unrelated.' } : item), 'contrast pair'],
    ['bad pair identity', (items: Case[]) => items.map(item => item.id === 'P01B' ? { ...item, variant: 'A' } : item), 'pair ID'],
    ['pair metadata on grammar', (items: Case[]) => items.map((item, index) => index ? item : { ...item, pairId: 'P01' }), 'non-pair'],
  ])('rejects %s before evaluation', (_name, mutate, message) => {
    expect(() => parseBenchmarkCases(serialize(mutate(cases)))).toThrow(message)
  })

  it.each(['', '{', 'null', '[]', '"prose"'])('rejects malformed or non-object source %j', value => {
    expect(() => parseBenchmarkCases(value)).toThrow('benchmark')
  })
})
