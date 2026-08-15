import type { InvitationalScheduleEvent } from '../../lib/database.types'

export const AMBER = '#E8A820'
export const GREEN = '#2D6A4F'

const WEEKDAYS_FI = ['Sunnuntai', 'Maanantai', 'Tiistai', 'Keskiviikko', 'Torstai', 'Perjantai', 'Lauantai']

/** `new Date('2026-09-25')` is parsed as UTC midnight, which lands on the previous
 * evening in western time zones. Build the date in local time instead. */
export function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** 'Perjantai 25.9.' — the weekday is derived so this holds for any year. */
export function formatDayHeading(iso: string): string {
  const date = parseLocalDate(iso)
  return `${WEEKDAYS_FI[date.getDay()]} ${date.getDate()}.${date.getMonth() + 1}.`
}

/** Postgres `time` arrives as 'HH:MM:SS'; only hours and minutes are shown. */
export function formatTime(time: string): string {
  return time.slice(0, 5)
}

export interface ScheduleDay {
  date: string
  events: InvitationalScheduleEvent[]
}

/** Rows arrive already ordered by date then display_order, so a single pass groups them. */
export function groupByDay(events: InvitationalScheduleEvent[]): ScheduleDay[] {
  const days: ScheduleDay[] = []
  for (const event of events) {
    const last = days[days.length - 1]
    if (last && last.date === event.event_date) last.events.push(event)
    else days.push({ date: event.event_date, events: [event] })
  }
  return days
}

export type SchedulePhase =
  | { status: 'before'; days: number }
  | { status: 'ongoing' }
  | { status: 'past' }

/** Whole calendar days from `now` to `target`, counted midnight to midnight so the
 * number matches how people count days off a calendar. */
function calendarDaysUntil(now: Date, target: Date): number {
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const to = new Date(target.getFullYear(), target.getMonth(), target.getDate())
  return Math.round((to.getTime() - from.getTime()) / 86_400_000)
}

/** The weekend runs from the first event's start until the end of the last day. */
export function schedulePhase(days: ScheduleDay[], now: Date): SchedulePhase | null {
  if (days.length === 0) return null

  const firstDay = days[0]
  const start = parseLocalDate(firstDay.date)
  const firstTime = firstDay.events.find(e => e.start_time)?.start_time
  if (firstTime) {
    const [h, m] = firstTime.split(':').map(Number)
    start.setHours(h, m, 0, 0)
  }

  const end = parseLocalDate(days[days.length - 1].date)
  end.setHours(23, 59, 59, 999)

  if (now < start) return { status: 'before', days: calendarDaysUntil(now, start) }
  if (now <= end) return { status: 'ongoing' }
  return { status: 'past' }
}

/** 'päivä' vs 'päivää' — the singular only applies to exactly one. */
export function countdownText(days: number): string {
  if (days === 0) return 'Invitational alkaa tänään'
  return `${days} ${days === 1 ? 'päivä' : 'päivää'} Invitationaliin`
}
