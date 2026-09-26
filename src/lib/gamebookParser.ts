export type FindingSeverity = 'BLOCKING' | 'CONFIRMABLE' | 'INFO'

export type Finding = {
  severity: FindingSeverity
  message: string
}

export type ParseError = {
  raw: string
  reason: string
}

export type ParsedHole = {
  hole: number
  par: number | null
  stroke_index: number | null
  strokes_played: number | null
  hcp_strokes: number | null
  points: number | null
}

export type ParsedBlock = {
  raw: string
  player: string
  hcp: number
  total_points: number
  total_strokes: number
  to_par: number
  summary: string
  warning: string | null
  holes: ParsedHole[]
}

export type CourseHole = {
  hole: number
  par: number
}

export type CourseForValidation = {
  holes: readonly CourseHole[]
}

export type RosterPlayer = {
  id: string
  full_name: string
  slug?: string | null
  name?: string | null
}

const START_MARKER = '---GC-RESULT---'
const END_MARKER = '---END---'
const CSV_HEADER = 'hole,par,stroke_index,strokes_played,hcp_strokes,points'
const METADATA_KEYS = new Set(['player', 'hcp', 'total_points', 'total_strokes', 'to_par', 'summary', 'warning'])

// Chat UIs and smart punctuation often turn "---" into en/em dashes, so accept any
// dash run around a marker line and rewrite it to the canonical form before parsing.
const DASH = '[-\\u2010-\\u2015\\u2212\\uFE58\\uFE63\\uFF0D]'
const MARKER_LINE = new RegExp(`^[ \\t]*${DASH}+[ \\t]*(GC${DASH}RESULT|END)[ \\t]*${DASH}+[ \\t\\r]*$`, 'gimu')

function normalizeMarkers(text: string): string {
  return text.replace(MARKER_LINE, (_line, name: string) =>
    name.toUpperCase() === 'END' ? END_MARKER : START_MARKER)
}

class BlockParseError extends Error {}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase('fi-FI')
}

function parseRequiredNumber(value: string, field: string, integer = false): number {
  const parsed = Number(value.trim())
  if (!value.trim() || !Number.isFinite(parsed) || (integer && !Number.isInteger(parsed))) {
    throw new BlockParseError(`${field} ei ole kelvollinen ${integer ? 'kokonaisluku' : 'numero'}`)
  }
  return parsed
}

function parseNullableInteger(value: string, field: string): number | null {
  const trimmed = value.trim()
  if (trimmed.toLocaleUpperCase('fi-FI') === 'NULL') return null
  if (!trimmed || !/^[+-]?\d+$/.test(trimmed)) {
    throw new BlockParseError(`${field} ei ole kelvollinen kokonaisluku tai NULL`)
  }
  return Number(trimmed)
}

function isCsvHeader(line: string): boolean {
  return normalize(line).replace(/ /g, '') === CSV_HEADER
}

function parseBody(body: string, raw: string): ParsedBlock {
  const lines = body.replace(/\r/g, '').split('\n')
  const csvHeaderIndex = lines.findIndex(isCsvHeader)
  if (csvHeaderIndex === -1) throw new BlockParseError('CSV-otsikko puuttuu')

  const values: Record<string, string> = {}
  let summaryLines: string[] = []
  let readingSummary = false

  for (const line of lines.slice(0, csvHeaderIndex)) {
    const trimmed = line.trim()
    if (!trimmed) {
      if (readingSummary) summaryLines.push('')
      continue
    }
    if (normalize(trimmed) === 'csv:') continue

    const field = trimmed.match(/^([a-z_]+):\s*(.*)$/i)
    if (!field) {
      if (readingSummary) {
        summaryLines.push(trimmed)
        continue
      }
      throw new BlockParseError(`Tunnistamaton metatietorivi: ${trimmed}`)
    }

    const key = field[1].toLocaleLowerCase('en-US')
    if (!METADATA_KEYS.has(key)) {
      if (readingSummary) {
        summaryLines.push(trimmed)
        continue
      }
      throw new BlockParseError(`Tunnistamaton kenttä: ${field[1]}`)
    }

    if (key === 'summary') {
      readingSummary = true
      summaryLines = [field[2].trim()]
    } else {
      readingSummary = false
      values[key] = field[2].trim()
    }
  }

  const player = values.player?.trim()
  if (!player) throw new BlockParseError('player-kenttä puuttuu')
  if (!values.summary?.trim() && summaryLines.length === 0) throw new BlockParseError('summary-kenttä puuttuu')

  const summary = summaryLines.join('\n').trim()
  if (!summary) throw new BlockParseError('summary-kenttä puuttuu')

  const holes: ParsedHole[] = []
  for (const [index, line] of lines.slice(csvHeaderIndex + 1).entries()) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const cells = trimmed.split(',')
    if (cells.length !== 6) {
      throw new BlockParseError(`CSV-rivillä ${index + 1} on ${cells.length} saraketta, odotettu 6`)
    }

    const hole = parseNullableInteger(cells[0], `CSV-rivin ${index + 1} väylä`)
    if (hole === null) throw new BlockParseError(`CSV-rivin ${index + 1} väylä ei voi olla NULL`)

    holes.push({
      hole,
      par: parseNullableInteger(cells[1], `Väylä ${hole} par`),
      stroke_index: parseNullableInteger(cells[2], `Väylä ${hole} stroke_index`),
      strokes_played: parseNullableInteger(cells[3], `Väylä ${hole} strokes_played`),
      hcp_strokes: parseNullableInteger(cells[4], `Väylä ${hole} hcp_strokes`),
      points: parseNullableInteger(cells[5], `Väylä ${hole} points`),
    })
  }

  return {
    raw,
    player,
    hcp: parseRequiredNumber(values.hcp ?? '', 'hcp'),
    total_points: parseRequiredNumber(values.total_points ?? '', 'total_points', true),
    total_strokes: parseRequiredNumber(values.total_strokes ?? '', 'total_strokes', true),
    to_par: parseRequiredNumber(values.to_par ?? '', 'to_par', true),
    summary,
    warning: values.warning?.trim() || null,
    holes,
  }
}

export function parseBlocks(input: string): { blocks: ParsedBlock[]; parseErrors: ParseError[] } {
  const text = normalizeMarkers(input)
  const blocks: ParsedBlock[] = []
  const parseErrors: ParseError[] = []
  const starts = [...text.matchAll(new RegExp(START_MARKER, 'g'))]

  if (starts.length === 0) {
    if (text.trim()) parseErrors.push({ raw: text.trim(), reason: `Lohkon aloitusmerkki ${START_MARKER} puuttuu` })
    return { blocks, parseErrors }
  }

  starts.forEach((startMatch, index) => {
    const start = startMatch.index ?? 0
    const bodyStart = start + START_MARKER.length
    const nextStart = starts[index + 1]?.index ?? text.length
    const end = text.indexOf(END_MARKER, bodyStart)
    const hasEnd = end !== -1 && end < nextStart
    const bodyEnd = hasEnd ? end : nextStart
    const rawEnd = hasEnd ? end + END_MARKER.length : nextStart
    const raw = text.slice(start, rawEnd).trim()
    const body = text.slice(bodyStart, bodyEnd)

    if (!hasEnd) {
      parseErrors.push({ raw, reason: `Lohkon lopetusmerkki ${END_MARKER} puuttuu` })
      return
    }

    try {
      blocks.push(parseBody(body, raw))
    } catch (error) {
      parseErrors.push({ raw, reason: error instanceof Error ? error.message : 'Lohkon jäsentäminen epäonnistui' })
    }
  })

  return { blocks, parseErrors }
}

function coursePar(course: CourseForValidation, hole: number): number | null {
  return course.holes.find(item => item.hole === hole)?.par ?? null
}

function resolvedPlayer(block: ParsedBlock, players: readonly RosterPlayer[]): RosterPlayer | undefined {
  const identifier = normalize(block.player)
  return players.find(player => [player.id, player.slug, player.full_name, player.name]
    .filter((value): value is string => Boolean(value))
    .some(value => normalize(value) === identifier))
}

export function validateBlock(
  block: ParsedBlock,
  course: CourseForValidation,
  eventPlayers: readonly RosterPlayer[],
): Finding[] {
  const findings: Finding[] = []
  const counts = new Map<number, number>()

  for (const hole of block.holes) counts.set(hole.hole, (counts.get(hole.hole) ?? 0) + 1)

  if (block.holes.length === 0) {
    findings.push({ severity: 'BLOCKING', message: 'CSV:stä ei löytynyt yhtään väylää' })
  }

  for (const [hole, count] of counts) {
    if (hole < 1 || hole > 18) {
      findings.push({ severity: 'BLOCKING', message: `Väylä ${hole} ei kuulu kierrokseen 1–18` })
    } else if (count > 1) {
      findings.push({ severity: 'BLOCKING', message: `Väylä ${hole} esiintyy ${count} kertaa` })
    }
  }

  const missingHoles = Array.from({ length: 18 }, (_, index) => index + 1)
    .filter(hole => !counts.has(hole))
  if (missingHoles.length > 0) {
    findings.push({ severity: 'INFO', message: `Puuttuvat väylät: ${missingHoles.join(', ')} — täydennä manuaalisesti` })
  }

  if (!resolvedPlayer(block, eventPlayers)) {
    findings.push({ severity: 'BLOCKING', message: `Pelaajaa "${block.player}" ei löydy rosterista` })
  }

  for (const row of block.holes) {
    const expectedPar = coursePar(course, row.hole)
    if (row.par === null) {
      findings.push({ severity: 'BLOCKING', message: `Väylä ${row.hole} par puuttuu` })
    } else if (expectedPar !== null && row.par !== expectedPar) {
      findings.push({ severity: 'BLOCKING', message: `Väylä ${row.hole}: CSV par ${row.par}, kurssin par ${expectedPar}` })
    }
    if (row.points === null) {
      findings.push({ severity: 'BLOCKING', message: `Väylä ${row.hole} pisteet puuttuvat` })
    }
  }

  const csvPoints = block.holes.reduce((sum, hole) => sum + (hole.points ?? 0), 0)
  const hasAllHoles = missingHoles.length === 0 && block.holes.length === 18
  if (hasAllHoles && csvPoints !== block.total_points) {
    findings.push({ severity: 'CONFIRMABLE', message: `CSV summa ${csvPoints}, ilmoitettu ${block.total_points}` })
  }

  const csvStrokes = block.holes.reduce((sum, hole) => sum + (hole.strokes_played ?? 0), 0)
  const hasAllStrokes = hasAllHoles && block.holes.every(hole => hole.strokes_played !== null)
  if (hasAllStrokes && csvStrokes !== block.total_strokes) {
    findings.push({ severity: 'CONFIRMABLE', message: `CSV lyöntisumma ${csvStrokes}, ilmoitettu ${block.total_strokes}` })
  }

  if (block.warning && block.warning.toLocaleUpperCase('fi-FI').includes('LYÖNTIPELI')) {
    findings.push({ severity: 'INFO', message: `LYÖNTIPELI-varoitus: ${block.warning}` })
  }

  if (!hasAllHoles || block.holes.some(hole => hole.strokes_played === null)) {
    findings.push({ severity: 'INFO', message: 'Kaikilla 18 väylällä ei ole lyöntimäärää (has_complete_strokes = false)' })
  }

  return findings
}
