export type GameBookRosterPlayer = {
  identifier: string
  displayName: string
}

type BuildPromptOptions = {
  context: string
  roster: GameBookRosterPlayer[]
}

export function buildGameBookPrompt({ context, roster }: BuildPromptOptions): string {
  const rosterLines = roster.length
    ? roster.map(player => `- ${player.identifier} — ${player.displayName}`).join('\n')
    : '- Ei rosteria annettu'

  return `You are processing one or more GameBook golf scorecard screenshots for the ${context} admin system.

Several screenshot files may be attached in the same request. Read every attached scorecard and return exactly one result block for each scorecard. Never stop after the first card, merge cards together, or omit a card because another card was also attached.

Authoritative event roster. The value after "player:" must be copied exactly from the identifier column below:
${rosterLines}

GameBook name-matching aid. The name shown on a GameBook scorecard may be a short name. Use this map to match it to the authoritative roster identifier above:
- Brukke — Miikkae
- Jussi — Jussi
- Kankkunen — Jesse Kankkunen
- Lauri — Lauri
- Nyyssönen — Niko Nyyssönen
- Pauli — Pauli
- Pekka — Pekka
- Pete — Pete
- Tatu — Tatu
- Tero — Tero
- Tommi — Tommi
Only use the mapped value in "player:" when that exact identifier appears in the authoritative roster. If the match is not certain, use "player: UNKNOWN".

Return ONLY the result blocks, one after another, with no preamble, markdown code fences, explanation, or text between blocks.

---GC-RESULT---
player: <exact roster identifier from the list above>
hcp: [player HCP as number]
total_points: [total bogeypoint points as integer]
total_strokes: [total raw strokes as integer]
to_par: [strokes relative to par, e.g. -3 or +5]
summary: [Exactly 3 sentences in Finnish. Casual but sharp tone — like a knowledgeable friend reporting to a WhatsApp group. Use the roster display name for this card.]

Sentence 1: The overall result — total points and the general character of the round in one sentence.
Sentence 2: The most interesting specific moment — best hole, a collapse, front/back nine contrast, or a streak. Must reference a specific hole number or sequence.
Sentence 3: A punchy concluding verdict on the round. Factual — no opinion on tournament standings or what the result means for the competition.

Summary rules:
- Exactly 3 sentences, no more no less
- Never mention tournament position, standings, or rivals
- Never use filler without a specific fact attached — forbidden phrases: "vahva kokonaisuus", "tasainen kierros", "hieno suoritus"
- Emojis: only 📈 or ✍️ permitted, maximum one total, only if it genuinely adds something — default is no emoji
- No exclamation marks

CSV:
hole,par,stroke_index,strokes_played,hcp_strokes,points
1,[par],[stroke_index],[strokes],[hcp_strokes],[points]
[...one row for each visible and legible hole, in hole-number order...]
---END---

Rules for every block:
- Produce exactly one block per attached scorecard, even when several cards are attached.
- player: copy exactly one identifier from the authoritative roster list. The player name shown in the screenshot is not authoritative and must not be copied into this field unless it is exactly the roster identifier.
- Use the screenshot name only to match the card to one roster entry. If you cannot confidently match a card to exactly one roster entry, use player: UNKNOWN rather than guessing; the admin will hold that block.
- The roster identifier and the summary player name come from the roster list, not from an invented or corrected screenshot name.
- IMPORTANT: the screenshot must be from the "Pistebogey NET" tab in GameBook, not "Lyöntipeli NET". If the data appears to be stroke play (no points column, or points values that look like raw strokes), add this line before ---END---:
  warning: LYÖNTIPELI — tarkista välilehti
- to_par is calculated from RAW strokes, not handicap-adjusted strokes: total_strokes minus the par for the represented holes. For a complete card this is the full course par; for a partial card it is the visible-hole subtotal. Negative if under par and positive if over par.
- If a hole is cropped out or not present in the screenshot, omit that hole's row entirely. Never invent a row for a hole that is not visible.
- If a visible hole value is illegible, write NULL for that value. strokes_played may be NULL when raw strokes are not visible.
- The CSV may contain any non-empty subset of holes 1–18, in hole order. The admin will fill missing holes manually.
- total_points, total_strokes, and to_par are the visible subtotal when the screenshot does not show all 18 holes. Do not use them to invent missing rows.
- Do not add extra fields or change the field order.

IMPORTANT DEFINITIONS:
- strokes_played = the player's RAW/GROSS number of strokes actually played on the hole.
- stroke_index = the hole's handicap/stroke index shown in GameBook's "Handicap" row.
- points = the player's NET Stableford/bogeypoint points shown in GameBook's "Pisteet" row.
- hcp_strokes = the player's HANDICAP-ADJUSTED NET SCORE on that hole.
- hcp_strokes DOES NOT mean the number of handicap strokes received on the hole.
- Never put 0, 1, 2, etc. in hcp_strokes merely because that is how many handicap strokes the player receives.
- If the player scores 5 raw strokes and receives 1 handicap stroke, hcp_strokes is 4.
- If the player scores 6 raw strokes and receives 2 handicap strokes, hcp_strokes is 4.
- If the player scores 3 raw strokes and receives 1 handicap stroke, hcp_strokes is 2.

HCP_STROKES CALCULATION:
For net Stableford, the relationship is:

points = max(0, 2 + par - hcp_strokes)

Therefore, whenever points > 0:

hcp_strokes = par + 2 - points

This is the preferred way to derive hcp_strokes, because it uses the actual NET Stableford result shown by GameBook and does not require assuming that the displayed HCP equals the playing handicap.

Examples:
- Par 4 and 3 points → hcp_strokes = 4 + 2 - 3 = 3
- Par 4 and 2 points → hcp_strokes = 4 + 2 - 2 = 4
- Par 4 and 1 point → hcp_strokes = 4 + 2 - 1 = 5
- Par 5 and 4 points → hcp_strokes = 5 + 2 - 4 = 3
- Par 3 and 2 points → hcp_strokes = 3 + 2 - 2 = 3

You can independently cross-check it using:

handicap_strokes_received = strokes_played - hcp_strokes

and therefore:

hcp_strokes = strokes_played - handicap_strokes_received

Example:
- Raw score 5
- Player receives 1 handicap stroke
- Net score = 4
- Therefore strokes_played = 5 and hcp_strokes = 4

ZERO-POINT HOLES:
- A Stableford score of 0 does NOT uniquely determine the exact net score. For example, on a par 4, any net score of 6 or worse produces 0 points.
- Therefore, DO NOT calculate a zero-point hole as simply par + 2.
- For a 0-point hole, determine how many handicap strokes the player received on that hole from the handicap allocation pattern established by the other holes and their stroke indexes.
- Then calculate:
  hcp_strokes = strokes_played - handicap_strokes_received
- Use non-zero-point holes to establish the player's actual handicap-stroke allocation wherever possible.
- Handicap strokes are distributed according to stroke index: each hole receives one stroke before any hole receives a second stroke; lower stroke indexes receive additional strokes first.
- Example: an established playing handicap of 12 means SI 1–12 receive one handicap stroke and SI 13–18 receive zero.
- Example: an established playing handicap of 21 means every hole receives one handicap stroke and SI 1–3 receive a second handicap stroke.
- Do not automatically assume that the HCP displayed beside the player's name equals the playing handicap. Use the Stableford data to verify the actual allocation.

MANDATORY VALIDATION:
Before returning each result block, validate the extracted data.

1. For EVERY hole with points > 0, verify:
   hcp_strokes = par + 2 - points

2. Also verify for every hole with points > 0:
   handicap_strokes_received = strokes_played - hcp_strokes
   The resulting handicap-stroke allocation must make sense relative to the hole stroke indexes.

3. Verify Stableford points from the net score:
   expected_points = max(0, 2 + par - hcp_strokes)
   This MUST equal the visible points value for every hole with points > 0.

4. For zero-point holes, verify:
   2 + par - hcp_strokes <= 0

5. When all 18 holes are present, verify that all 18 points values sum exactly to total_points shown on the scorecard. For a partial screenshot, verify only the visible rows and treat total_points as a visible subtotal.

6. When all 18 raw scores are visible, verify that all 18 strokes_played values sum exactly to total_strokes shown on the scorecard. For a partial screenshot, verify only the visible rows and treat total_strokes as a visible subtotal.

7. When all 18 holes are present, verify:
   to_par = total_strokes - total course par

8. If any validation fails, re-read the screenshot and correct the extraction or calculation before returning the result.

MOST IMPORTANT:
Do not confuse these three different values:
- stroke_index = difficulty/allocation index of the hole
- handicap strokes received = strokes given to the player on that hole
- hcp_strokes = NET SCORE after subtracting those received strokes from the raw score

Only the NET SCORE belongs in the CSV hcp_strokes column.`
}
