const GOLD = '#E8A820'

interface Section {
  title: string
  body: React.ReactNode
  gold?: boolean
}

const sections: Section[] = [
  {
    title: 'Yleistä',
    body: 'Golf Company Liekkipoika Kesäkisa 2026. Neljä kenttää, yksi kesä, yksi voittaja. Pistebogey. Keltainen boksi. Voittaja julkistetaan Tahkolla — jos olet siellä.',
  },
  {
    title: 'Pelimuoto',
    body: 'Pistebogey virallisella tasoituksella. Keltaisesta boksista, ei muualta. Kaikki neljä kenttää lasketaan yhteen. Eniten pisteitä voittaa. Yksinkertaista.',
  },
  {
    title: 'Kentät',
    body: (
      <>
        <p className="text-gray-300 text-sm leading-relaxed mb-3">
          Neljä kenttää. Yksi yritys per kenttä. Ei uusintoja. Ei tekosyitä.
        </p>
        <ul className="text-gray-300 text-sm space-y-1 mb-3 pl-1">
          {['Kajaani', 'Paltamo', 'Nuas', 'Tenetti'].map(k => (
            <li key={k} className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-gc-green shrink-0" />
              {k}
            </li>
          ))}
        </ul>
        <p className="text-gray-300 text-sm leading-relaxed">
          Aikaa elokuun loppuun. Käytä se.
        </p>
      </>
    ),
  },
  {
    title: 'Osallistuminen',
    body: (
      <>
        <p className="text-gray-300 text-sm leading-relaxed mb-3">
          Kisakierroksella on oltava vähintään 2 Golf Companyn miestä. Yksin pelaaminen ei kelpaa. Kaveri löytyy.
        </p>
        <p className="text-gray-300 text-sm leading-relaxed mb-3">
          Kierros merkataan GameBookiin:
        </p>
        <p className="text-sm font-mono text-gc-green bg-black/20 rounded px-3 py-2 mb-3">
          "GC kesäkisa, [kenttä]"
        </p>
        <p className="text-gray-300 text-sm leading-relaxed">
          Kierros pelataan tasoituskierroksena. Ei tasoituskierrosta — ei tulosta.
        </p>
      </>
    ),
  },
  {
    title: 'Ilmoittautuminen',
    body: (
      <>
        <p className="text-gray-300 text-sm leading-relaxed mb-3">
          Ennen kierroksen alkua viesti GC WhatsAppiin. Muoto:
        </p>
        <p className="text-sm font-mono text-gc-green bg-black/20 rounded px-3 py-2 mb-3">
          "Tänään [Nimi] ja [Nimi] pelaa [kenttä]n kisakiekan."
        </p>
        <p className="text-gray-300 text-sm leading-relaxed">
          Kierroksen jälkeen kuvakaappaus GameBook-tuloskortista M. Shutarille. Hän laskee pisteet. Älä unohda.
        </p>
      </>
    ),
  },
  {
    title: 'Palkinnot',
    body: (
      <>
        <p className="text-gray-300 text-sm leading-relaxed mb-3">
          Jokaisen kentän paras tulos voittaa tikkarin. Tikkari on ansaittu. Kannattaa osallistua vaikka ei kaikkia kenttiä ehtisikään — tikkarit eivät jaa itse itseään.
        </p>
        <p className="text-gray-300 text-sm leading-relaxed">
          Kauden kokonaisvoittaja julkistetaan Tahkolla. Paikalla kannattaa olla.
        </p>
      </>
    ),
  },
  {
    title: 'Handicap',
    body: 'Virallinen EGA-handicap kierroksen pelaushetkellä. Se mikä on järjestelmässä — se lasketaan. Ei neuvotteluja.',
  },
  {
    title: 'Tulosten syöttö',
    body: 'Tulokset syöttää turnauksen admin. Epäselvissä tilanteissa: ota yhteyttä GC:n porukalle. Selvissä tilanteissa: ei tarvitse ottaa yhteyttä.',
  },
  {
    title: '🔥👦 Liekkipaita',
    gold: true,
    body: (
      <p className="text-gray-300 text-sm leading-relaxed">
        Golf Companyn arvostetuin palkinto ratkaistaan vuosittaisessa Invitationalissa syyskuussa — erillisessä turnauksessa, jolla on oma historiansa. Kesäkisan voittaja kruunataan Tahkolla.
      </p>
    ),
  },
]

export default function RulesPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-8">Säännöt</h1>
      <div className="space-y-4">
        {sections.map(({ title, body, gold }) => (
          <div
            key={title}
            className="card p-5"
            style={{
              borderTop: gold ? `2px solid ${GOLD}` : undefined,
              marginTop: gold ? 32 : undefined,
            }}
          >
            <h2 className="font-bold mb-2" style={{ color: gold ? GOLD : undefined }}>
              {gold ? title : <span className="text-gc-gold">{title}</span>}
            </h2>
            {typeof body === 'string'
              ? <p className="text-gray-300 text-sm leading-relaxed">{body}</p>
              : body}
          </div>
        ))}
      </div>
    </div>
  )
}
