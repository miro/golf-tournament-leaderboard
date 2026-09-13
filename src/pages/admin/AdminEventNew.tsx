import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getActivePlayers, getCourses } from '../../lib/queries'
import { createEvent, getActiveQuestionTypes, type QuestionType } from '../../lib/eventQueries'
import type { Course, Player } from '../../lib/database.types'

type PickedQuestion = QuestionType & { parameters: Record<string, unknown> }

export default function AdminEventNew() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [courseId, setCourseId] = useState('')
  const [participantCode, setParticipantCode] = useState('')
  const [players, setPlayers] = useState<Player[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [types, setTypes] = useState<QuestionType[]>([])
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([])
  const [questions, setQuestions] = useState<PickedQuestion[]>([])
  const [dragged, setDragged] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { Promise.all([getActivePlayers(), getCourses(), getActiveQuestionTypes()]).then(([p, c, q]) => { setPlayers(p); setCourses(c); setTypes(q) }).catch(e => setError(e.message)) }, [])
  const valid = name.trim() && selectedPlayers.length >= 2 && questions.length >= 4 && questions.length <= 8 && (!participantCode.trim() || (participantCode.trim().length >= 2 && participantCode.trim().length <= 20)) && questions.every(q => !q.requires_target_player || (q.parameters.player_id && selectedPlayers.includes(String(q.parameters.player_id))))
  const selectedSet = useMemo(() => new Set(questions.map(q => q.id)), [questions])
  function toggleQuestion(type: QuestionType) {
    setQuestions(current => current.some(q => q.id === type.id) ? current.filter(q => q.id !== type.id) : current.length >= 8 ? current : [...current, { ...type, parameters: {} }])
  }
  function move(from: number, to: number) { if (to < 0 || to >= questions.length) return; setQuestions(current => { const next = [...current]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next }) }
  async function submit() {
    if (!valid) return
    setSaving(true); setError(null)
    try { const id = await createEvent({ name: name.trim(), event_date: date, course_id: courseId || null, participant_code: participantCode.trim() || null, playerIds: selectedPlayers, questions: questions.map((q, i) => ({ question_type_id: q.id, question_type_key: q.key, display_order: i + 1, parameters: q.parameters })) }); navigate(`/admin/events/${id}`) } catch (e: any) { setError(e.message ?? 'Tapahtuman luonti epäonnistui') } finally { setSaving(false) }
  }
  return <div className="max-w-5xl space-y-7">
    <div><h1 className="text-2xl font-bold text-white">Luo uusi tapahtuma</h1><p className="text-sm text-gray-500 mt-1">Rakenna tapahtuman veikkauspaketti.</p></div>
    {error && <div className="rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 p-3 text-sm">{error}</div>}
    <section className="card p-5 space-y-4">
      <h2 className="text-white font-bold">Perustiedot</h2>
      <label className="block"><span className="label block mb-1">Tapahtuman nimi *</span><input value={name} onChange={e => setName(e.target.value)} placeholder="GC Invitational 2026 — Liekki-Major" className="w-full input" /></label>
      <div className="grid sm:grid-cols-2 gap-4"><label><span className="label block mb-1">Päivämäärä *</span><input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full input" /></label><label><span className="label block mb-1">Kenttä</span><select value={courseId} onChange={e => setCourseId(e.target.value)} className="w-full input"><option value="">Ei valittu</option>{courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label></div>
      <label className="block"><span className="label block mb-1">Osallistujakoodi</span><input value={participantCode} onChange={e => setParticipantCode(e.target.value.slice(0, 20))} placeholder="Esim. GC2026" maxLength={20} className="w-full input" /><span className="text-xs text-gray-500">Vapaaehtoinen, 2–20 merkkiä. Tapahtuman pelaajat syöttävät tämän koodin veikkaussivulla.</span></label>
    </section>
    <section className="card p-5 space-y-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-white font-bold">Pelaajat *</h2><span className="text-xs text-gray-500">{selectedPlayers.length} valittu · vähintään 2</span></div><div className="flex gap-2"><button type="button" onClick={() => setSelectedPlayers(players.map(player => player.id))} className="btn-ghost px-2.5 py-1 text-xs">Valitse kaikki</button><button type="button" onClick={() => setSelectedPlayers([])} className="btn-ghost px-2.5 py-1 text-xs">Ei yhtään</button></div></div><div className="flex flex-wrap gap-2">{players.map(player => { const active = selectedPlayers.includes(player.id); return <button key={player.id} type="button" onClick={() => setSelectedPlayers(current => active ? current.filter(id => id !== player.id) : [...current, player.id])} className={`px-3 py-2 rounded-full border text-sm transition-colors ${active ? 'border-gc-green bg-gc-green/15 text-white' : 'border-white/10 text-gray-400 hover:text-white'}`}>{active && '✓ '}{player.full_name}</button> })}</div></section>
    <section className="space-y-4"><div className="flex items-center justify-between"><div><h2 className="text-white font-bold">Kysymykset *</h2><p className="text-xs text-gray-500 mt-1">Valitse kysymysgalleriasta 4–8 kysymystä.</p></div><span className="text-sm text-gray-400">{questions.length} / 8 kysymystä valittu</span></div><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{types.map(type => <button key={type.id} type="button" onClick={() => toggleQuestion(type)} className={`relative text-left rounded-xl p-4 min-h-32 transition-colors ${selectedSet.has(type.id) ? 'border-2 border-gc-green bg-gc-green/10' : 'border border-white/10 bg-gc-card'}`}><div className="font-bold text-white pr-6">{type.display_name}</div><div className="text-xs text-gray-400 mt-2">{type.description}</div><span className="absolute bottom-3 right-3 text-[10px] text-gc-green">max {type.max_points}p</span>{selectedSet.has(type.id) && <span className="absolute top-2 right-2 rounded-full bg-gc-green text-gc-dark w-5 h-5 text-center text-xs leading-5">✓</span>}</button>)}</div></section>
    <section className="card p-5 space-y-2"><h2 className="text-white font-bold mb-3">Valitut kysymykset</h2>{questions.map((q, i) => <div key={q.id} draggable onDragStart={() => setDragged(i)} onDragOver={e => e.preventDefault()} onDrop={() => { if (dragged != null) move(dragged, i); setDragged(null) }} className="flex items-center gap-3 border-b border-white/5 py-3 last:border-0"><span className="text-gray-500 cursor-grab">⠿</span><span className="text-xs text-gray-500 w-5">{i + 1}</span><span className="text-white flex-1">{q.display_name}</span>{q.requires_target_player && <select value={String(q.parameters.player_id ?? '')} onChange={e => setQuestions(current => current.map((item, index) => index === i ? { ...item, parameters: { ...item.parameters, player_id: e.target.value } } : item))} className="input text-xs"><option value="">Valitse kohdepelaaja</option>{players.filter(p => selectedPlayers.includes(p.id)).map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select>}<button type="button" onClick={() => setQuestions(current => current.filter((_, index) => index !== i))} className="text-gray-500 hover:text-red-300">✕</button></div>)}{questions.length === 0 && <div className="text-sm text-gray-500">Valitse kysymyksiä yllä.</div>}</section>
    <div className="flex justify-end gap-3"><button type="button" onClick={() => navigate('/admin/events')} className="btn-ghost px-4 py-2">Peruuta</button><button type="button" disabled={!valid || saving} onClick={submit} className="btn-primary px-5 py-2 disabled:opacity-40">{saving ? 'Luodaan...' : 'Luo tapahtuma'}</button></div>
  </div>
}
