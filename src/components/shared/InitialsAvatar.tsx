interface Props {
  name: string
  size?: number
  color?: string
}

export default function InitialsAvatar({ name, size = 32, color = '#4b5563' }: Props) {
  const initials = name.substring(0, 2).toUpperCase()
  return (
    <div
      className="shrink-0 flex items-center justify-center text-white font-display font-bold"
      style={{ width: size, height: size, borderRadius: '50%', background: color, fontSize: size * 0.42 }}
    >
      {initials}
    </div>
  )
}
