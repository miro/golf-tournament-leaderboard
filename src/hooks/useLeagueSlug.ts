const DOMAIN_SLUG_MAP: Record<string, string> = {
  'liekkipoika.com': 'gc',
  'www.liekkipoika.com': 'gc',
  localhost: 'gc',
}

export function resolveLeagueSlug(hostname: string): string {
  const normalized = hostname.toLowerCase()
  if (DOMAIN_SLUG_MAP[normalized]) return DOMAIN_SLUG_MAP[normalized]
  if (normalized.includes('.localhost')) return normalized.split('.localhost')[0]
  const parts = normalized.split('.')
  return parts.length >= 3 ? parts[0] : 'gc'
}

export function useLeagueSlug(): string {
  return resolveLeagueSlug(window.location.hostname)
}
