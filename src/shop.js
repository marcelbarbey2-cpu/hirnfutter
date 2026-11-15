// ── Hirnfutter-Laden ─────────────────────────────────────────────────────────
//
// Krümel verdient man durch ehrliches Üben (siehe `leitner.js`), ausgeben kann
// man sie **nur für Aussehen**. Nichts hier verändert das Lernen: keine
// übersprungenen Karten, keine kürzeren Intervalle, kein grösseres Tagespensum.
//
// Drei Regeln, die den Laden fair halten:
//   • Basisartikel sind immer erhältlich. Saisonartikel kehren jährlich zurück; Besitz bleibt.
//     Sonst wird aus einem Tempo ein Wettbewerb, und den verliert, wer das
//     kleinere Set hat.
//   • In jedem Platz gibt es etwas Kostenloses. Wer nichts kauft, sieht nicht
//     «unfertig» aus.
//   • Auszeichnungen (durchgefüttert, Serie) liegen NICHT im Laden.

import { fnv } from './storage.js'
import { saisonKaufbar } from './saison.js'

// ── Geometrie ────────────────────────────────────────────────────────────────
//
// Zubehör wird **anatomisch** verankert, nicht an der Bounding Box des PNG.
// Die sieben Kopfvarianten unterscheiden sich in Grösse und Lage; einziges
// gemeinsames Merkmal sind die Augen. Sie bilden daher das Koordinatensystem:
// aus ihnen kommen Mittelpunkt, Massstab (`eyeDistance`) und Neigung.
//
// ⚠️ Alle Zubehörwerte sind **Vielfache des Augenabstands**, keine festen Pixel-
// oder Prozentwerte. Wird ein Kopfbild grösser gerendert, wandert und skaliert
// alles automatisch mit.
//
// Einheiten: `links`/`breite` in % der Leinwandbreite, `oben`/`hoehe` in % der
// Leinwandhöhe. Für Rechnungen wird alles in Breiten-% geführt und erst zum
// Schluss zurückgerechnet — `VERH` ist der Umrechnungsfaktor.

export const SEITENVERHAELTNIS = 0.846
const VERH = SEITENVERHAELTNIS

/** Debug: zeichnet die Landmarken ein. Auch per `?anker=1` einschaltbar. */
export const SHOW_ANCHORS = (() => {
  try { return new URLSearchParams(location.search).has('anker') } catch { return false }
})()

/**
 * Je Kopf: Lage des Bildes auf der Leinwand und die beiden Augen als Anteil der
 * Bildbreite/-höhe. Die Augenwerte sind gemessen (dunkle Flecken im Rosa), nicht
 * abgelesen — ein früher abgelesener Wert lag 0,5 % daneben und die Augen schauten
 * unten aus den Gläsern.
 */
const KOEPFE = {
  hexenhut: {"bild": {"links": -4.391697021313458, "oben": 11.699028225818047, "breite": 93.94973582349617, "hoehe": 63.60785780348962}, "augeLinks": {"x": 0.26389, "y": 0.65909}, "augeRechts": {"x": 0.43056, "y": 0.67914}},
  matschbirne: {"bild": {"links": -1.7517169810676414, "oben": 19.476010526280255, "breite": 80.99007801687685, "hoehe": 54.83363333420521}, "augeLinks": {"x": 0.2735, "y": 0.62299}, "augeRechts": {"x": 0.46688, "y": 0.64572}},
  denklaus: {"bild": {"links": 4.597885722752537, "oben": 16.148277223207863, "breite": 87.08608065611801, "hoehe": 58.96087930938309}, "augeLinks": {"x": 0.18162, "y": 0.63369}, "augeRechts": {"x": 0.36111, "y": 0.65909}},
  rudihirn: {"bild": {"links": -6.43084083536586, "oben": 11.194425532401219, "breite": 92.29723151068704, "hoehe": 62.48904402048664}, "augeLinks": {"x": 0.2906, "y": 0.68048}, "augeRechts": {"x": 0.46047, "y": 0.69786}},
  basis: {
    bild: { links: 4.279, oben: 28.464, breite: 69.272, hoehe: 46.883 },
    augeLinks:  { x: 0.2322, y: 0.5380 }, augeRechts: { x: 0.4593, y: 0.5624 },
  },
  muetze: {
    bild: { links: 5.192, oben: 3.454, breite: 69.882, hoehe: 71.826 },
    augeLinks:  { x: 0.2171, y: 0.6975 }, augeRechts: { x: 0.4422, y: 0.7173 },
  },
  cap: {
    bild: { links: 5.794, oben: 15.371, breite: 66.990, hoehe: 60.248 },
    augeLinks:  { x: 0.2175, y: 0.6359 }, augeRechts: { x: 0.4523, y: 0.6551 },
  },
  schulmuetze: {
    bild: { links: 6.028, oben: 10.693, breite: 68.113, hoehe: 64.639 },
    augeLinks:  { x: 0.2105, y: 0.6640 }, augeRechts: { x: 0.4415, y: 0.6840 },
  },
  kochmuetze: {
    bild: { links: 3.433, oben: 2.131, breite: 69.939, hoehe: 73.000 },
    augeLinks:  { x: 0.2421, y: 0.7061 }, augeRechts: { x: 0.4670, y: 0.7221 },
  },
  kopfhoerer: {
    bild: { links: 2.519, oben: 17.030, breite: 75.788, hoehe: 59.185 },
    augeLinks:  { x: 0.2354, y: 0.6160 }, augeRechts: { x: 0.4430, y: 0.6421 },
  },
  krone: {
    bild: { links: 5.287, oben: 10.545, breite: 68.239, hoehe: 65.306 },
    augeLinks:  { x: 0.2209, y: 0.6583 }, augeRechts: { x: 0.4515, y: 0.6806 },
  },
}

/**
 * Brillen, relativ zum Augenabstand. `widthFactor` ist so gewählt, dass der
 * **Glasabstand** dem Augenabstand entspricht — nicht die Bildbreite.
 *
 * Die Werte sind einzeln eingemessen und einzeln geprüft. **Nur ändern, was nicht
 * sitzt** — die übrigen Zeilen dabei nicht anfassen, auch wenn ein neues Messverfahren
 * "besser" erscheint.
 *
 * `herzen` ist die Ausnahme: Dort ist der Anker der **eingezeichnete Augenbogen im
 * Zubehör selbst**, weil jedes geometrische Ersatzmass (Bildmitte, Schwerpunkt,
 * höchste Spalte) beim Herz danebenliegt — die Wölbungen verziehen es. Die übrigen
 * Brillen sitzen mit dem geometrischen Mass und bleiben deshalb dabei.
 */
const BRILLEN_GEO = {
  nachtblick: { widthFactor: 2.71, xOffset: 0, yOffset: 0.045 },
  lamettaalarm: { widthFactor: 2.29, xOffset: 0, yOffset: -0.060 },
  rund:          { widthFactor: 2.2812, xOffset: -0.0052, yOffset: 0.0220 },
  sonnenbrille:  { widthFactor: 2.2371, xOffset:  0.0155, yOffset: 0.0181 },
  blau:          { widthFactor: 2.2176, xOffset:  0.0181, yOffset: 0.0371 },
  sterne:        { widthFactor: 2.0976, xOffset:  0.0024, yOffset: 0.0392 },
  herzen:        { widthFactor: 2.1600, xOffset:  0.0024, yOffset: 0.0392 },
  // Nur ein Glas bzw. etwas, das herausragt (Kette, Schnorchel) — dort trägt die
  // automatische Messung nicht, die Werte sind von Hand eingestellt.
  monokel:       { widthFactor: 1.6443, xOffset:  0.0524, yOffset: 0.1763 },
  taucherbrille: { widthFactor: 2.9092, xOffset:  0.2536, yOffset: 0.0448 },
}

/** Halsanker: unterhalb der Augen, ebenfalls in Augenabständen. */
const NECK_X_FACTOR = 0.2377
const NECK_Y_FACTOR = 1.8948

/**
 * Halsteile, relativ zum **Halsanker**.
 *
 * ⚠️ Die Bilder zeigen nur den **vorderen** sichtbaren Teil — keine geschlossene
 * Schlaufe. Der Stoff endet links und rechts dort, wo er hinter dem Hirn läge.
 * Ein Asset mit gezeichneter Rückseite sieht hier immer falsch aus, egal wie gut
 * es gezeichnet ist: eine flache Ebene kann sich nicht um etwas wickeln.
 */
const HALS_STANDARD = { widthFactor: 3.1862, xOffset: 0, yOffset: 0 }
const HALS_GEO = {
  kette:    { widthFactor: 2.5490, xOffset: 0,      yOffset: 0.2787 },
  halstuch: { widthFactor: 2.9870, xOffset: 0.0797, yOffset: -0.1195 },
}

/** Begleiter steht neben dem Hirn — ebenfalls aus den Augen abgeleitet. */
const BEGLEITER_GEO = { widthFactor: 1.7524, xOffset: 3.5035, yOffset: 0.6203 }

/**
 * Augen-Koordinatensystem eines Kopfes, in Leinwand-Einheiten.
 * `abstand` und alle Offsets rechnen in Breiten-%; `mitteY` ist Höhen-%.
 */
function augenSystem(kopfId) {
  const k = KOEPFE[kopfId] ?? KOEPFE.basis
  const b = k.bild
  const l = { x: b.links + k.augeLinks.x  * b.breite, y: b.oben + k.augeLinks.y  * b.hoehe }
  const r = { x: b.links + k.augeRechts.x * b.breite, y: b.oben + k.augeRechts.y * b.hoehe }
  const mitteX = (l.x + r.x) / 2
  const mitteY = (l.y + r.y) / 2
  const dx = r.x - l.x
  const dyBreite = (r.y - l.y) / VERH        // Höhen-% in Breiten-% umrechnen
  return {
    links: l, rechts: r, mitteX, mitteY,
    abstand: Math.hypot(dx, dyBreite),
    winkel: Math.atan2(dyBreite, dx) * 180 / Math.PI,
  }
}

/** Platzierung eines Zubehörs aus Faktoren, die in Augenabständen angegeben sind. */
function platziere(sys, faktoren, ankerX = sys.mitteX, ankerY = sys.mitteY) {
  const breite = sys.abstand * faktoren.widthFactor
  return {
    breite,
    links: ankerX + sys.abstand * faktoren.xOffset,
    oben:  ankerY + sys.abstand * faktoren.yOffset * VERH,
  }
}

// ── Katalog ──────────────────────────────────────────────────────────────────
//
// Preise sind Schätzungen: eine erste Lerneinheit bringt rund 50 Krümel, ein
// vollständig ehrlich gelerntes 84-Karten-Set höchstens 924, ein Semester mit
// zwei Sets realistisch 1200–1800. Das billigste vollständige Outfit kostet 470 —
// gut zwei Wochen. Alles zu besitzen ist ein Jahresziel, kein Wochenziel.

export const PLAETZE = [
  {
    id: 'kopf', titel: 'Kopf', standard: 'basis',
    teile: [
      { id: 'basis',       titel: 'Ohne',        preis: 0 },
      { id: 'muetze',      titel: 'Zipfelmütze', preis: 120 },
      { id: 'cap',         titel: 'Käppi',       preis: 200 },
      { id: 'schulmuetze', titel: 'Doktorhut',   preis: 350 },
      { id: 'kochmuetze',  titel: 'Kochmütze',   preis: 450 },
      { id: 'kopfhoerer',  titel: 'Kopfhörer',   preis: 550 },
      { id: 'krone',       titel: 'Krone',       preis: 900 },
    ],
  },
  {
    id: 'augen', titel: 'Augen', standard: 'rund',
    teile: [
      { id: 'rund',          titel: 'Runde Brille', preis: 0 },
      { id: 'sonnenbrille',  titel: 'Sonnenbrille', preis: 150 },
      { id: 'blau',          titel: 'Blaue Brille', preis: 200 },
      { id: 'sterne',        titel: 'Sternbrille',  preis: 350 },
      { id: 'herzen',        titel: 'Herzbrille',   preis: 350 },
      { id: 'monokel',       titel: 'Monokel',      preis: 500 },
      { id: 'taucherbrille', titel: 'Taucherbrille',preis: 600 },
    ],
  },
  {
    id: 'hals', titel: 'Hals', standard: null,
    teile: [
      { id: null,           titel: 'Ohne',         preis: 0 },
      { id: 'schal-rot',    titel: 'Roter Schal',  preis: 100 },
      { id: 'schal-blau',   titel: 'Blauer Schal', preis: 100 },
      { id: 'schal-gruen',  titel: 'Grüner Schal', preis: 150 },
      { id: 'fliege-navy',  titel: 'Fliege blau',  preis: 250 },
      { id: 'fliege-rot',   titel: 'Fliege rot',   preis: 250 },
      { id: 'halstuch',     titel: 'Halstuch',     preis: 350 },
      { id: 'kette',        titel: 'Kette',        preis: 700 },
    ],
  },
  {
    id: 'begleiter', titel: 'Begleiter', standard: null,
    teile: [
      { id: null,            titel: 'Ohne',          preis: 0 },
      { id: 'wurm',          titel: 'Bücherwurm',    preis: 150 },
      { id: 'papierflieger', titel: 'Papierflieger', preis: 250 },
      { id: 'buecher',       titel: 'Bücherstapel',  preis: 350 },
      { id: 'flamme',        titel: 'Flämmchen',     preis: 400 },
      { id: 'gluehbirne',    titel: 'Glühbirne',     preis: 400 },
      { id: 'keks',          titel: 'Keksdieb',      preis: 450 },
      { id: 'tasse',         titel: 'Tasse',         preis: 450 },
      { id: 'beere',         titel: 'Hirnbeere',     preis: 550 },
      { id: 'pflanze',       titel: 'Pflanze',       preis: 600 },
      { id: 'geist',         titel: 'Gespenst',      preis: 800 },
      // Nicht käuflich — nur verdient. Damit bleibt Können von der Währung getrennt.
      { id: 'goldkarte',        titel: 'Goldene Karte', bedingung: 'set1' },
      { id: 'flammenabzeichen', titel: 'Feuerabzeichen', bedingung: 'serie30' },
      { id: 'eule',             titel: 'Eule',          bedingung: 'set3' },
    ],
  },
]

/**
 * Hintergründe liegen **nur hinter dem Hirn**, nie hinter dem Kartentext.
 * Damit dürfen sie dunkel und bunt sein, ohne dass die App unlesbar wird.
 * Die ersten drei sind Farben statt Bilder — kostet nichts und sieht immer gut aus.
 */
export const HINTERGRUENDE = [
  { id: 'creme',         titel: 'Creme',         preis: 0,   farbe: '#FAE9D7' },
  { id: 'nachtblau',     titel: 'Nachtblau',     preis: 100, farbe: '#0A213B' },
  { id: 'waldgruen',     titel: 'Waldgrün',      preis: 180, farbe: '#3B5B47' },
  { id: 'sonnenaufgang', titel: 'Sonnenaufgang', preis: 350, bild: true },
  { id: 'sternenhimmel', titel: 'Sternenhimmel', preis: 500, bild: true },
  { id: 'pausenplatz',   titel: 'Pausenplatz',   preis: 800, bild: true },
]

PLAETZE.find(p => p.id === 'kopf').teile.push({"id": "hexenhut", "titel": "Hexenhut", "preis": 180, "saison": "halloween"})
PLAETZE.find(p => p.id === 'kopf').teile.push({"id": "matschbirne", "titel": "Matschbirne", "preis": 150, "saison": "halloween"})
PLAETZE.find(p => p.id === 'augen').teile.push({"id": "nachtblick", "titel": "Nachtblick", "preis": 120, "saison": "halloween"})
PLAETZE.find(p => p.id === 'begleiter').teile.push({"id": "buhbert", "titel": "Buhbert", "preis": 160, "saison": "halloween"})
PLAETZE.find(p => p.id === 'begleiter').teile.push({"id": "knurps", "titel": "Knurps", "preis": 100, "saison": "halloween"})
PLAETZE.find(p => p.id === 'begleiter').teile.push({"id": "flatterkeks", "titel": "Flatterkeks", "preis": 180, "saison": "halloween"})
HINTERGRUENDE.push({"id": "mitternachtspause", "titel": "Spinnenecke", "preis": 200, "saison": "halloween", "bild": true})
PLAETZE.find(p => p.id === 'kopf').teile.push({"id": "denklaus", "titel": "Denklaus", "preis": 150, "saison": "weihnachten"})
PLAETZE.find(p => p.id === 'kopf').teile.push({"id": "rudihirn", "titel": "Rudihirn", "preis": 180, "saison": "weihnachten"})
PLAETZE.find(p => p.id === 'augen').teile.push({"id": "lamettaalarm", "titel": "Lamettaalarm", "preis": 120, "saison": "weihnachten"})
PLAETZE.find(p => p.id === 'begleiter').teile.push({"id": "kruemelmann", "titel": "Krümelmann", "preis": 160, "saison": "weihnachten"})
PLAETZE.find(p => p.id === 'begleiter').teile.push({"id": "flocki", "titel": "Flocki", "preis": 100, "saison": "weihnachten"})
PLAETZE.find(p => p.id === 'begleiter').teile.push({"id": "paeckli", "titel": "Päckli", "preis": 180, "saison": "weihnachten"})
HINTERGRUENDE.push({"id": "winterpause", "titel": "Guetzlidose", "preis": 200, "saison": "weihnachten", "bild": true})

// ── Besitz und Ausrüstung ────────────────────────────────────────────────────

const KEY_BESITZ = 'zk:besitz'
const KEY_LOOK   = 'zk:look'

/** Was von Anfang an da ist — damit die App aussieht wie das Logo. */
const GRATIS = ['kopf:basis', 'augen:rund', 'hg:creme']

function ladeJson(key, ersatz) {
  try {
    const roh = localStorage.getItem(key)
    return roh ? JSON.parse(roh) : ersatz
  } catch { return ersatz }
}
function speichere(key, wert) {
  try { localStorage.setItem(key, JSON.stringify(wert)) } catch {}
}

export function getBesitz() {
  const liste = ladeJson(KEY_BESITZ, [])
  const alle = new Set(Array.isArray(liste) ? liste : [])
  for (const g of GRATIS) alle.add(g)
  // Alles Kostenlose gehört automatisch — niemand soll für «Ohne» zahlen.
  for (const platz of PLAETZE) {
    for (const t of platz.teile) if (t.preis === 0) alle.add(schluessel(platz.id, t.id))
  }
  for (const h of HINTERGRUENDE) if (h.preis === 0) alle.add(`hg:${h.id}`)
  return alle
}

export function besitzt(platzId, teilId) {
  return getBesitz().has(schluessel(platzId, teilId))
}

export function kaufen(platzId, teilId) {
  const teil = (platzId === 'hg' ? HINTERGRUENDE : PLAETZE.find(p => p.id === platzId)?.teile || []).find(t => t.id === teilId)
  if (!teil || (!besitzt(platzId, teilId) && !saisonKaufbar(teil))) return false
  const alle = getBesitz()
  alle.add(schluessel(platzId, teilId))
  speichere(KEY_BESITZ, [...alle])
  return true
}

export function schluessel(platzId, teilId) {
  return `${platzId}:${teilId ?? 'ohne'}`
}

/** Was gerade getragen wird. Fehlendes fällt auf den Standard zurück. */
export function getLook() {
  const l = ladeJson(KEY_LOOK, {})
  const look = {
    kopf:        l?.kopf ?? 'basis',
    augen:       l?.augen ?? 'rund',
    hals:        l?.hals ?? null,
    begleiter:   l?.begleiter ?? null,
    hintergrund: l?.hintergrund ?? 'creme',
  }
  // Nur tragen, was auch gehört — sonst bliebe ein Teil nach einem Reset hängen.
  const besitz = getBesitz()
  for (const platz of PLAETZE) {
    if (look[platz.id] && !besitz.has(schluessel(platz.id, look[platz.id]))) {
      look[platz.id] = platz.standard
    }
  }
  if (!besitz.has(`hg:${look.hintergrund}`)) look.hintergrund = 'creme'
  return look
}

export function setLook(platzId, teilId) {
  const look = getLook()
  look[platzId] = teilId
  speichere(KEY_LOOK, look)
  return look
}

// ── Darstellung ──────────────────────────────────────────────────────────────

function bildPfad(platzId, teilId) {
  return `/shop/${platzId}/${teilId}.png`
}

function hintergrundStil(id) {
  const h = HINTERGRUENDE.find(x => x.id === id) ?? HINTERGRUENDE[0]
  return h.bild
    ? `background-image:url(/shop/hintergrund/${h.id}.png);background-size:cover;background-position:center`
    : `background:${h.farbe}`
}

/**
 * Der Avatar als geschichtete Bilder.
 * Reihenfolge: Hintergrund → Hirn → Hals → Brille → Begleiter.
 * Der Hals liegt **vor** dem Hirn; die Bilder zeigen nur die Vorderseite.
 */
export function avatarHtml(look = getLook(), klasse = '') {
  const kopf = KOEPFE[look.kopf] ? look.kopf : 'basis'
  const k = KOEPFE[kopf]
  // Ohne Begleiter braucht es rechts keinen reservierten Platz.
  // Die ganze Figur verschieben: Augenanker und Zubehör bleiben unverändert.
  const versatzX = look.begleiter ? 0 : 50 - (k.bild.links + k.bild.breite / 2)
  const sys = augenSystem(kopf)
  // Das Monokel sitzt auf dem rechten Auge im Bild; alle Brillen bleiben mittig.
  const brillenAnker = look.augen === 'monokel'
    ? sys.rechts
    : { x: sys.mitteX, y: sys.mitteY }

  const ebene = (platzId, teilId, faktoren, ankerX, ankerY, dreht) => {
    if (!teilId) return ''
    const p = platziere(sys, faktoren, ankerX, ankerY)
    const dreh = dreht ? ` rotate(${sys.winkel.toFixed(2)}deg)` : ''
    const umriss = SHOW_ANCHORS ? ' dbg-umriss' : ''
    return `<img class="av-teil av-mitte${umriss}" src="${bildPfad(platzId, teilId)}" alt=""
      style="left:${p.links.toFixed(3)}%;top:${p.oben.toFixed(3)}%;width:${p.breite.toFixed(3)}%;
             transform:translate(-50%,-50%)${dreh}" />`
  }

  const halsAnker = {
    x: sys.mitteX + sys.abstand * NECK_X_FACTOR,
    y: sys.mitteY + sys.abstand * NECK_Y_FACTOR * SEITENVERHAELTNIS,
  }

  return `
    <div class="avatar ${klasse}" style="aspect-ratio:${SEITENVERHAELTNIS};${hintergrundStil(look.hintergrund)}">
      <div class="av-figur" style="position:absolute;inset:0;transform:translateX(${versatzX.toFixed(3)}%)">
      <img class="av-teil" src="${bildPfad('kopf', kopf)}" alt=""
        style="left:${k.bild.links}%;top:${k.bild.oben}%;width:${k.bild.breite}%" />
      ${ebene('hals', look.hals, HALS_GEO[look.hals] ?? HALS_STANDARD, halsAnker.x, halsAnker.y, true)}
      ${ebene('augen', look.augen, BRILLEN_GEO[look.augen] ?? { widthFactor: 2.2, xOffset: 0, yOffset: 0 }, brillenAnker.x, brillenAnker.y, true)}
      ${ebene('begleiter', look.begleiter, ["buhbert", "knurps", "flatterkeks", "kruemelmann", "flocki", "paeckli"].includes(look.begleiter) ? { ...BEGLEITER_GEO, widthFactor: 2.15 } : BEGLEITER_GEO, sys.mitteX, sys.mitteY, false)}
      ${SHOW_ANCHORS ? ankerHtml(sys, look, halsAnker) : ''}
      </div>
    </div>
  `
}

/**
 * Debug-Overlay (`?anker=1`): zeigt, ob ein Sitzfehler aus der Augenerkennung,
 * der Skalierung oder dem Asset selbst kommt.
 */
function ankerHtml(sys, look, halsAnker) {
  const punkt = (x, y, farbe) =>
    `<i class="dbg-punkt" style="left:${x}%;top:${y}%;background:${farbe}"></i>`
  const dx = sys.rechts.x - sys.links.x
  const dy = sys.rechts.y - sys.links.y
  const laenge = Math.hypot(dx, dy)
  return `
    <div class="dbg">
      <i class="dbg-linie" style="left:${sys.links.x}%;top:${sys.links.y}%;width:${laenge}%;
        transform:rotate(${sys.winkel.toFixed(2)}deg)"></i>
      ${punkt(sys.links.x, sys.links.y, '#ff2d55')}
      ${punkt(sys.rechts.x, sys.rechts.y, '#ff2d55')}
      <i class="dbg-kreuz" style="left:${sys.mitteX}%;top:${sys.mitteY}%"></i>
      <i class="dbg-hals" style="left:${halsAnker.x}%;top:${halsAnker.y}%;
        width:${sys.abstand * 2}%"></i>
    </div>
  `
}

/** Kleines Vorschaubild eines einzelnen Teils für die Laden-Kacheln. */
export function teilVorschauHtml(platzId, teilId) {
  if (platzId === 'hg') {
    const h = HINTERGRUENDE.find(x => x.id === teilId)
    return `<div class="laden-hg" style="${hintergrundStil(teilId)}" title="${h?.titel ?? ''}"></div>`
  }
  if (!teilId) return `<div class="laden-ohne">ohne</div>`
  if (platzId === 'kopf') {
    return `<img class="laden-bild" src="${bildPfad('kopf', teilId)}" alt="" />`
  }
  return `<img class="laden-bild laden-bild-klein" src="${bildPfad(platzId, teilId)}" alt="" />`
}

// ── Auszeichnungen ───────────────────────────────────────────────────────────
//
// Nicht im Laden zu haben, sondern verdient. Sie liegen im selben Platz wie die
// Begleiter, damit sie keine eigene Oberfläche brauchen — nur eine andere
// Beschriftung: statt eines Preises steht dort die Bedingung.

export const BEDINGUNGEN = {
  set1:    { text: 'Ein Set durchgefüttert',    pruef: st => st.durchgefuettert >= 1 },
  set3:    { text: 'Drei Sets durchgefüttert',  pruef: st => st.durchgefuettert >= 3 },
  serie30: { text: '30 Tage Serie',             pruef: st => st.serieRekord >= 30 },
}

/** Ist ein Teil verfügbar? Gekaufte über den Besitz, verdiente über den Stand. */
export function verdient(teil, stand) {
  if (!teil.bedingung) return null
  const b = BEDINGUNGEN[teil.bedingung]
  return !!b && b.pruef(stand)
}
