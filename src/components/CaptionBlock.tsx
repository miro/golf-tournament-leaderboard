import { useState } from 'react'

interface Props {
  caption: string
  color: string
}

export default function CaptionBlock({ caption, color }: Props) {
  const [captionCopied, setCaptionCopied] = useState(false)

  return (
    <div style={{ marginTop: 16, borderLeft: `2px solid ${color}66`, paddingLeft: 12 }}>
      <div className="label mb-2">Kuvateksti</div>
      <p className="font-sans" style={{ color: '#9ca3af', fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-line', margin: 0 }}>
        {caption}
      </p>
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(caption)
          setCaptionCopied(true)
          setTimeout(() => setCaptionCopied(false), 800)
        }}
        className="font-sans mt-3 px-3 py-1.5 rounded-md text-xs border border-white/12 bg-white/5 hover:bg-white/10 transition-colors"
        style={{ color: captionCopied ? '#4ade80' : 'white' }}
      >
        {captionCopied ? 'Kopioitu!' : 'Kopioi kuvateksti'}
      </button>
    </div>
  )
}
