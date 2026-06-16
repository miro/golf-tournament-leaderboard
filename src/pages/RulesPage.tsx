export default function RulesPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-8">Säännöt</h1>
      <div className="space-y-4">
        {[
          {
            title: 'Yleistä',
            body: 'Golf Company Liekkipoika Kesäkisa 2026 on ystäväryhmän golf-turnaus, jossa pelataan Stableford-pisteillä. Turnauksen voittaja on se, jolla on eniten pisteitä kauden päättyessä.',
          },
          {
            title: 'Kentät',
            body: 'Turnauksessa on neljä kenttää: Kajaani, Paltamo, Nuas ja Tenetti. Jokainen pelaaja voi pelata jokaisella kentällä enintään kerran kauden aikana.',
          },
          {
            title: 'Pisteytyys',
            body: 'Käytössä on Stableford-pisteytyys virallisella handicapilla. Kaikki neljän kentän pisteet lasketaan yhteen — mitä enemmän pisteitä, sen parempi.',
          },
          {
            title: 'Deadline',
            body: 'Kaikki kierrokset on pelattava ja syötettävä järjestelmään viimeistään 31.8.2026. Myöhässä syötetyt kierrokset eivät kuulu kilpailuun.',
          },
          {
            title: 'Handicap',
            body: 'Käytössä on virallinen EGA-handicap kierroksen pelaushetkellä. Handicap syötetään järjestelmään kierroksen yhteydessä.',
          },
          {
            title: 'Tulosten syöttö',
            body: 'Tulokset syöttää turnauksen admin. Epäselvissä tilanteissa ota yhteyttä Golf Companyn porukalle.',
          },
        ].map(({ title, body }) => (
          <div key={title} className="card p-5">
            <h2 className="font-bold text-gc-gold mb-2">{title}</h2>
            <p className="text-gray-300 text-sm leading-relaxed">{body}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
