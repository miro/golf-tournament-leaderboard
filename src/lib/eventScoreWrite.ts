import { scopedTable } from './leagueClient'

type EventScoreValues = {
  id?: string
  event_id: string
  player_id: string
  hcp: number | null
  total_points: number
  total_strokes: number | null
  is_corrected: boolean
}

// Supabase returns plain { message, details, hint, code } objects rather than Error instances.
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  if (error && typeof error === 'object') {
    const { message, details, hint, code } = error as Record<string, unknown>
    const parts = [message, details, hint].filter((part): part is string => typeof part === 'string' && part.trim() !== '')
    if (parts.length) return `${parts.join(' · ')}${typeof code === 'string' && code ? ` (${code})` : ''}`
  }
  return fallback
}

function isMissingPlayedDateColumn(error: unknown): boolean {
  const { code, message } = (error ?? {}) as Record<string, unknown>
  return code === 'PGRST204' && typeof message === 'string' && message.includes('played_date')
}

// event_scores.played_date is NOT NULL in the committed schema, and an upsert checks the insert row
// even when it resolves to an update, so always send it. Retry without it if the live schema dropped it.
export async function upsertEventScore(values: EventScoreValues, eventDate: string): Promise<{ id: string }> {
  const write = (row: Record<string, unknown>) => scopedTable('event_scores')
    .upsert(row, { onConflict: 'event_id,player_id' })
    .select()
    .single()
  let result = await write({ ...values, played_date: eventDate })
  if (result.error && isMissingPlayedDateColumn(result.error)) result = await write(values)
  if (result.error || !result.data) throw new Error(errorMessage(result.error, 'Tuloskortin tallennus epäonnistui'))
  return result.data as { id: string }
}
