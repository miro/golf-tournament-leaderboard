import { useEffect, useState } from 'react'
import { getActivePlayers, getCourseBySlug } from '../../lib/queries'
import type { Course, Player } from '../../lib/database.types'
import IdentityScreen from './bet/IdentityScreen'
import QuestionShell from './bet/QuestionShell'
import SliderQuestion from './bet/SliderQuestion'
import CompositionQuestion from './bet/CompositionQuestion'
import PlayerPickQuestion from './bet/PlayerPickQuestion'
import HeadToHeadQuestion from './bet/HeadToHeadQuestion'
import YesNoQuestion from './bet/YesNoQuestion'
import PodiumQuestion from './bet/PodiumQuestion'
import CompletionScreen from './bet/CompletionScreen'
import { EMPTY_COMPOSITION, type BetAnswers, type RandomAssignment, compositionTotal } from './bet/types'

const TOTAL_QUESTIONS = 9

function pickRandom(players: Player[], exclude: Set<string>): Player | undefined {
  const pool = players.filter(p => !exclude.has(p.id))
  if (pool.length === 0) return undefined
  return pool[Math.floor(Math.random() * pool.length)]
}

function randomizeAssignment(players: Player[]): RandomAssignment | null {
  if (players.length === 0) return null
  const used = new Set<string>()
  const playerA = pickRandom(players, used) ?? players[0]
  used.add(playerA.id)
  const playerB = pickRandom(players, used) ?? playerA
  used.add(playerB.id)
  const pairA = pickRandom(players, used) ?? playerA
  used.add(pairA.id)
  const pairB = pickRandom(players, used) ?? playerB
  return { playerA, playerB, pairA, pairB, roster: players }
}

const EMPTY_ANSWERS: BetAnswers = {
  q1Score: null,
  q2Composition: EMPTY_COMPOSITION,
  q3BestGroup: null,
  q4BestFront9: null,
  q5BestBack9: null,
  q6BestScratch: null,
  q7HeadToHead: null,
  q8Birdie: null,
  q9Podium: [null, null, null],
}

export default function BetPage() {
  const [loading, setLoading] = useState(true)
  const [course, setCourse] = useState<Course | null>(null)
  const [assignment, setAssignment] = useState<RandomAssignment | null>(null)

  const [stage, setStage] = useState<'identity' | 'questions' | 'complete'>('identity')
  const [name, setName] = useState('')
  const [emojis, setEmojis] = useState<string[]>([])
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [transitioningOut, setTransitioningOut] = useState(false)
  const [answers, setAnswers] = useState<BetAnswers>(EMPTY_ANSWERS)

  useEffect(() => {
    async function load() {
      const [players, kajaani] = await Promise.all([getActivePlayers(), getCourseBySlug('kajaani')])
      setCourse(kajaani)
      setAssignment(randomizeAssignment(players))
    }
    load().catch(console.error).finally(() => setLoading(false))
  }, [])

  function commit() {
    setTransitioningOut(true)
    setTimeout(() => {
      setTransitioningOut(false)
      setCurrentQuestion(q => {
        if (q + 1 >= TOTAL_QUESTIONS) {
          setStage('complete')
          return q
        }
        return q + 1
      })
    }, 200)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gc-dark flex items-center justify-center">
        <span className="text-gc-muted">Latautuu…</span>
      </div>
    )
  }

  if (!assignment || !course) {
    return (
      <div className="min-h-screen bg-gc-dark flex items-center justify-center px-6 text-center">
        <span className="text-gc-muted">Pelaajia tai kenttätietoja ei löytynyt.</span>
      </div>
    )
  }

  const { playerA, playerB, pairA, pairB, roster } = assignment
  const playerById = new Map(roster.map(p => [p.id, p]))
  const q2Total = compositionTotal(answers.q2Composition)

  return (
    <div className="min-h-screen bg-gc-dark">
      <div className="max-w-[480px] mx-auto px-4 py-8">
        {stage === 'identity' && (
          <IdentityScreen
            onStart={(n, e) => {
              setName(n)
              setEmojis(e)
              setStage('questions')
            }}
          />
        )}

        {stage === 'questions' && currentQuestion === 0 && (
          <QuestionShell
            index={0}
            questionText={`Kuinka monta bogeypistettä ${playerA.full_name} tekee?`}
            context={`HCP ${playerA.hcp_current ?? '–'} · Kajaani Par ${course.par_total}`}
            lockDisabled={answers.q1Score === null}
            onLock={commit}
            transitioningOut={transitioningOut}
          >
            <SliderQuestion value={answers.q1Score} onChange={v => setAnswers(a => ({ ...a, q1Score: v }))} />
          </QuestionShell>
        )}

        {stage === 'questions' && currentQuestion === 1 && (
          <QuestionShell
            index={1}
            questionText={`Miten ${playerB.full_name}:n kierros menee?`}
            context={`HCP ${playerB.hcp_current ?? '–'} · Kajaani Par ${course.par_total}`}
            lockDisabled={q2Total !== 18}
            lockLabel={q2Total === 18 ? undefined : `Maalaa vielä ${Math.abs(18 - q2Total)} väylää`}
            onLock={commit}
            transitioningOut={transitioningOut}
          >
            <CompositionQuestion
              value={answers.q2Composition}
              onChange={v => setAnswers(a => ({ ...a, q2Composition: v }))}
            />
          </QuestionShell>
        )}

        {stage === 'questions' && currentQuestion === 2 && (
          <QuestionShell
            index={2}
            questionText="Kuka tekee ryhmän parhaan tuloksen?"
            context="Eniten stableford-pisteitä"
            lockDisabled={!answers.q3BestGroup}
            onLock={commit}
            transitioningOut={transitioningOut}
          >
            <PlayerPickQuestion
              players={roster}
              selectedId={answers.q3BestGroup}
              onSelect={id => setAnswers(a => ({ ...a, q3BestGroup: id }))}
            />
          </QuestionShell>
        )}

        {stage === 'questions' && currentQuestion === 3 && (
          <QuestionShell
            index={3}
            questionText="Kuka tekee parhaan etuyhdeksän?"
            context="Reijät 1-9, eniten pisteitä"
            lockDisabled={!answers.q4BestFront9}
            onLock={commit}
            transitioningOut={transitioningOut}
          >
            <PlayerPickQuestion
              players={roster}
              selectedId={answers.q4BestFront9}
              onSelect={id => setAnswers(a => ({ ...a, q4BestFront9: id }))}
            />
          </QuestionShell>
        )}

        {stage === 'questions' && currentQuestion === 4 && (
          <QuestionShell
            index={4}
            questionText="Kuka tekee parhaan takayhdeksän?"
            context="Reijät 10-18, eniten pisteitä"
            lockDisabled={!answers.q5BestBack9}
            onLock={commit}
            transitioningOut={transitioningOut}
          >
            <PlayerPickQuestion
              players={roster}
              selectedId={answers.q5BestBack9}
              onSelect={id => setAnswers(a => ({ ...a, q5BestBack9: id }))}
            />
          </QuestionShell>
        )}

        {stage === 'questions' && currentQuestion === 5 && (
          <QuestionShell
            index={5}
            questionText="Kuka pelaa scratch-tuloksella parhaiten?"
            context="Vähiten lyöntejä yhteensä (brutto)"
            lockDisabled={!answers.q6BestScratch}
            onLock={commit}
            transitioningOut={transitioningOut}
          >
            <PlayerPickQuestion
              players={roster}
              selectedId={answers.q6BestScratch}
              onSelect={id => setAnswers(a => ({ ...a, q6BestScratch: id }))}
            />
          </QuestionShell>
        )}

        {stage === 'questions' && currentQuestion === 6 && (
          <QuestionShell
            index={6}
            questionText="Kumpi tekee enemmän pisteitä?"
            context="Stableford-pisteet yhteensä"
            lockDisabled={!answers.q7HeadToHead}
            onLock={commit}
            transitioningOut={transitioningOut}
          >
            <HeadToHeadQuestion
              playerA={pairA}
              playerB={pairB}
              selectedId={answers.q7HeadToHead}
              onSelect={id => setAnswers(a => ({ ...a, q7HeadToHead: id }))}
            />
          </QuestionShell>
        )}

        {stage === 'questions' && currentQuestion === 7 && (
          <QuestionShell
            index={7}
            questionText="Tuleeko kierroksella birdie?"
            context={`${roster.length} pelaajaa kentällä · Kajaani Par ${course.par_total}`}
            lockDisabled={!answers.q8Birdie}
            onLock={commit}
            transitioningOut={transitioningOut}
          >
            <YesNoQuestion value={answers.q8Birdie} onChange={v => setAnswers(a => ({ ...a, q8Birdie: v }))} />
          </QuestionShell>
        )}

        {stage === 'questions' && currentQuestion === 8 && (
          <QuestionShell
            index={8}
            questionText="Laita top 3 järjestykseen"
            context="Paras stableford-tulos voittaa"
            lockDisabled={answers.q9Podium.some(s => s === null)}
            onLock={commit}
            transitioningOut={transitioningOut}
          >
            <PodiumQuestion
              players={roster}
              podium={answers.q9Podium}
              onChange={podium => setAnswers(a => ({ ...a, q9Podium: podium }))}
            />
          </QuestionShell>
        )}

        {stage === 'complete' && (
          <CompletionScreen
            name={name}
            emojis={emojis}
            answers={answers}
            playerA={playerA}
            pairA={pairA}
            pairB={pairB}
            playerById={playerById}
          />
        )}
      </div>
    </div>
  )
}
