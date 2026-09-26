import assert from 'node:assert/strict'
import test from 'node:test'
import { parseBlocks, validateBlock, type CourseForValidation } from '../src/lib/gamebookParser.ts'

const course: CourseForValidation = {
  holes: Array.from({ length: 18 }, (_, index) => ({ hole: index + 1, par: index % 3 === 0 ? 4 : 3 })),
}

const pars = course.holes.map(hole => hole.par)

function resultBlock(options: {
  player?: string
  holes?: Array<{ hole?: number; par?: number | null; strokes?: number | null; points?: number | null }>
  warning?: string
  close?: boolean
} = {}) {
  const rows = options.holes ?? Array.from({ length: 18 }, (_, index) => ({
    hole: index + 1,
    par: pars[index],
    strokes: 5,
    points: 2,
  }))
  const points = rows.reduce((sum, row) => sum + (row.points ?? 0), 0)
  const strokes = rows.reduce((sum, row) => sum + (row.strokes ?? 0), 0)
  return [
    '---GC-RESULT---',
    `player: ${options.player ?? 'alice'}`,
    'hcp: 12.4',
    `total_points: ${points}`,
    `total_strokes: ${strokes}`,
    'to_par: +18',
    'summary: Ensimmäinen lause. Toinen lause. Kolmas lause.',
    ...(options.warning ? [`warning: ${options.warning}`] : []),
    'CSV:',
    'hole,par,stroke_index,strokes_played,hcp_strokes,points',
    ...rows.map(row => `${row.hole ?? ''},${row.par ?? 'NULL'},1,${row.strokes ?? 'NULL'},1,${row.points ?? 'NULL'}`),
    ...(options.close === false ? [] : ['---END---']),
  ].join('\n')
}

const players = [{ id: 'p1', full_name: 'Alice Example', slug: 'alice' }]

test('parses and validates a clean block', () => {
  const parsed = parseBlocks(resultBlock())
  assert.equal(parsed.parseErrors.length, 0)
  assert.equal(parsed.blocks.length, 1)

  const findings = validateBlock(parsed.blocks[0], course, players)
  assert.deepEqual(findings, [])
})

test('reports a confirmable points sum mismatch', () => {
  const parsed = parseBlocks(resultBlock({ holes: Array.from({ length: 18 }, (_, index) => ({ hole: index + 1, par: pars[index], strokes: 5, points: 2 })) }).replace('total_points: 36', 'total_points: 35'))
  const findings = validateBlock(parsed.blocks[0], course, players)
  assert.ok(findings.some(finding => finding.severity === 'CONFIRMABLE' && finding.message === 'CSV summa 36, ilmoitettu 35'))
})

test('accepts a partial card and reports missing holes for manual completion', () => {
  const holes = Array.from({ length: 17 }, (_, index) => {
    const hole = index < 13 ? index + 1 : index + 2
    return { hole, par: pars[hole - 1], strokes: 5, points: 2 }
  })
  const parsed = parseBlocks(resultBlock({ holes }))
  const findings = validateBlock(parsed.blocks[0], course, players)
  assert.equal(findings.some(finding => finding.severity === 'BLOCKING'), false)
  assert.ok(findings.some(finding => finding.severity === 'INFO' && finding.message.includes('Puuttuvat väylät: 14')))
})

test('uses CSV par values when the course guide is unavailable', () => {
  const parsed = parseBlocks(resultBlock({
    holes: [
      { hole: 1, par: 5, strokes: 7, points: 3 },
      { hole: 2, par: 4, strokes: 6, points: 3 },
    ],
  }))
  const findings = validateBlock(parsed.blocks[0], { holes: [] }, players)
  assert.equal(findings.some(finding => finding.severity === 'BLOCKING'), false)
})

test('reports an unknown player as blocking', () => {
  const parsed = parseBlocks(resultBlock({ player: 'nobody' }))
  const findings = validateBlock(parsed.blocks[0], course, players)
  assert.ok(findings.some(finding => finding.severity === 'BLOCKING' && finding.message.includes('nobody')))
})

test('keeps parsing after one malformed block', () => {
  const malformed = resultBlock().replace('hcp: 12.4', 'hcp: ei-tämä-ole-numero')
  const parsed = parseBlocks(`${malformed}\n${resultBlock()}`)
  assert.equal(parsed.blocks.length, 1)
  assert.equal(parsed.parseErrors.length, 1)
  assert.match(parsed.parseErrors[0].reason, /hcp/)
})

test('accepts NULL strokes and reports an incomplete stroke card', () => {
  const holes = Array.from({ length: 18 }, (_, index) => ({ hole: index + 1, par: pars[index], strokes: index === 7 ? null : 5, points: 2 }))
  const parsed = parseBlocks(resultBlock({ holes }))
  const findings = validateBlock(parsed.blocks[0], course, players)
  assert.ok(findings.some(finding => finding.severity === 'INFO' && finding.message.includes('has_complete_strokes = false')))
})
