import { useState } from 'react'
import type { Player } from '../../../lib/database.types'
import { CATEGORY_META, CATEGORY_ORDER, type BetAnswers, compositionCounts, compositionPoints } from './types'

interface Props {
  name: string
  emojis: string[]
  answers: BetAnswers
  playerA: Player
  pairA: Player
  pairB: Player
  playerById: Map<string, Player>
}

export default function CompletionScreen({ name, emojis, answers, playerA, pairA, pairB, playerById }: Props) {
  const [copied, setCopied] = useState(false)

  const h2hWinner = answers.q7HeadToHead ? playerById.get(answers.q7HeadToHead) : null
  const podiumNames = answers.q9Podium.map(id => (id ? playerById.get(id)?.full_name ?? '?' : '?'))

  const q2Counts = compositionCounts(answers.q2Composition)
  const q2Top3 = [...CATEGORY_ORDER]
    .sort((a, b) => q2Counts[b] - q2Counts[a])
    .slice(0, 3)
    .map(key => `${CATEGORY_META[key].emoji}${q2Counts[key]}`)
    .join(' ')

  const summary = [
    `${playerA.full_name} pisteet → ${answers.q1Score}p`,
    `Kierroksen kokoonpano → ${compositionPoints(answers.q2Composition)}p (${q2Top3})`,
    `Paras tulos → ${answers.q3BestGroup ? playerById.get(answers.q3BestGroup)?.full_name : '–'}`,
    `Paras etuyhdeksän → ${answers.q4BestFront9 ? playerById.get(answers.q4BestFront9)?.full_name : '–'}`,
    `Paras takayhdeksän → ${answers.q5BestBack9 ? playerById.get(answers.q5BestBack9)?.full_name : '–'}`,
    `Paras scratch → ${answers.q6BestScratch ? playerById.get(answers.q6BestScratch)?.full_name : '–'}`,
    `${pairA.full_name} vs ${pairB.full_name} → ${h2hWinner?.full_name ?? '–'}`,
    `Birdie kierroksella → ${answers.q8Birdie === 'yes' ? 'Kyllä' : 'Ei'}`,
    `Podium → 1. ${podiumNames[0]}, 2. ${podiumNames[1]}, 3. ${podiumNames[2]}`,
  ]

  async function handleShare() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/proto/bet`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard API unavailable — no-op for prototype
    }
  }

  return (
    <div className="text-center">
      <div className="animate-bet-reveal" style={{ animationDelay: '0ms' }}>
        <span className="text-gc-green" style={{ fontSize: 64 }}>✓</span>
      </div>
      <h1 className="font-display font-extrabold text-white mb-6 animate-bet-reveal" style={{ fontSize: 28, animationDelay: '100ms' }}>
        Veikkaukset lähetetty!
      </h1>

      <div className="animate-bet-reveal mb-8" style={{ animationDelay: '200ms' }}>
        <div className="inline-flex items-center gap-3 card px-5 py-3">
          <span style={{ fontSize: 28 }}>{emojis.join('')}</span>
          <span className="font-display font-bold text-white text-lg">{name}</span>
        </div>
      </div>

      <div className="animate-bet-reveal text-left space-y-2 mb-6" style={{ animationDelay: '300ms' }}>
        {summary.map((line, i) => {
          const [label, rest] = line.split(' → ')
          return (
            <div key={i} className="card px-3 py-2 flex justify-between gap-3 text-sm">
              <span className="text-gc-muted">{label}</span>
              <span className="text-white font-semibold text-right">{rest}</span>
            </div>
          )
        })}
      </div>

      <p className="text-gc-muted text-sm mb-6 animate-bet-reveal" style={{ animationDelay: '400ms' }}>
        Tulokset julkaistaan kierroksen jälkeen
      </p>

      <button
        onClick={handleShare}
        className="btn-ghost w-full mb-6 animate-bet-reveal"
        style={{ animationDelay: '500ms' }}
      >
        {copied ? 'Kopioitu ✓' : 'Kutsu kaveri veikkaamaan 📋'}
      </button>

      <p className="text-gc-muted text-xs italic opacity-60 animate-bet-reveal" style={{ animationDelay: '600ms' }}>
        Tämä on prototyyppi — veikkauksia ei tallenneta
      </p>
    </div>
  )
}
