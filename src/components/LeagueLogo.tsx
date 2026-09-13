import type { ImgHTMLAttributes } from 'react'
import { useLeague } from '../contexts/LeagueContext'

export default function LeagueLogo(props: ImgHTMLAttributes<HTMLImageElement>) {
  const league = useLeague()
  return <img {...props} src={league.logo_url ?? '/gc-logo.png'} alt={props.alt ?? league.name} />
}
