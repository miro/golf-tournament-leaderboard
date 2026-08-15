/** Player photos in /public/players are named after the player's full name with all
 * vowels stripped — Tero → tr.jpeg, Nyyssönen → nssnn.jpeg. Note `y` counts as a
 * vowel here (Finnish), which is what makes Nyyssönen resolve to nssnn. */
export function playerImagePath(fullName: string): string {
  const stem = fullName
    .toLowerCase()
    .replace(/[aeiouäöy]/g, '')
    .replace(/[^a-z0-9]/g, '')
  return `/players/${stem}.jpeg`
}
