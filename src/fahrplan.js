// Prüfungsfahrplan: Ist eine Prüfung gesetzt, verteilt die App die nötige Übung gleichmässig
// auf die Tage bis dahin. So sitzt am Prüfungstag möglichst viel, ohne Büffeln am Vorabend.
//
// «Arbeit» einer Karte = richtige Wiederholungen, bis sie sitzt (Stufe 4). Eine neue Karte braucht 3.
// Das Tagesziel wird einmal pro Tag festgelegt und gespeichert, damit es beim Üben nicht springt.
import { getProgress, getSetSettings, fnv, getSessionCount } from './storage.js'
import { today, isDue, SITZT_AB } from './leitner.js'

const VORLAUF = 21 // ab drei Wochen vor der Prüfung
const KEY = name => 'zk:plan:' + fnv(name)

/** Ganze Tage von heute bis zum Datum (morgen = 1). */
export function tageBis(datum) {
  return Math.round((new Date(datum + 'T00:00:00Z') - new Date(today() + 'T00:00:00Z')) / 86400000)
}

/**
 * Plan für ein Set, oder null (kein Termin, Termin vorbei oder heute, oder noch mehr als drei Wochen entfernt).
 * @returns {{datum, tage, ziel, erledigt, offen, queue, allesSitzt}}
 */
export function fahrplan(deck) {
  if (!deck || deck.virtuell) return null
  const datum = getSetSettings(deck.name).pruefung
  if (!datum) return null
  const tage = tageBis(datum)
  if (tage < 1 || tage > VORLAUF) return null
  const p = getProgress(deck.name), heute = today()
  const stand = c => p[c.id] ?? { box: 1, lastReviewed: null }
  const arbeit = c => Math.max(0, SITZT_AB - stand(c).box)
  const heuteGeuebt = deck.cards.filter(c => stand(c).lastReviewed === heute)
  const offeneKarten = deck.cards.filter(c => stand(c).lastReviewed !== heute)
  const rest = offeneKarten.reduce((s, c) => s + arbeit(c), 0)

  // Tagesziel: einmal pro Tag (und neu, wenn sich der Termin ändert) festlegen
  let plan = null
  try { plan = JSON.parse(localStorage.getItem(KEY(deck.name)) || 'null') } catch {}
  if (!plan || plan.tag !== heute || plan.datum !== datum) {
    // Arbeit zu Tagesbeginn ≈ heutige Restarbeit + was heute schon geübt wurde
    const gesamt = rest + heuteGeuebt.length
    // `start`: erster Tag des Fahrplans (für die Tagesleiste), bleibt, solange der Termin gleich ist
    const start = plan && plan.datum === datum && plan.start ? plan.start : heute
    plan = { tag: heute, datum, start, ziel: Math.min(deck.cards.length, Math.ceil(gesamt / tage)) }
    try { localStorage.setItem(KEY(deck.name), JSON.stringify(plan)) } catch {}
  }

  // Heute dran: zuerst fällige, dann tiefste Stufe, dann am längsten nicht geübt. Keine Karte zweimal am Tag.
  const kandidaten = offeneKarten.filter(c => arbeit(c) > 0).sort((a, b) =>
    (isDue(stand(b)) - isDue(stand(a))) || (stand(a).box - stand(b).box) || String(stand(a).lastReviewed || '').localeCompare(String(stand(b).lastReviewed || '')))
  const offen = Math.min(Math.max(0, plan.ziel - heuteGeuebt.length), kandidaten.length)

  // Tagesleiste: vom Start des Fahrplans bis zum Prüfungstag. Ausgelassene Tage sind neutral, nie rot.
  const leiste = []
  for (let t = new Date((plan.start || heute) + 'T00:00:00Z'); ; t.setUTCDate(t.getUTCDate() + 1)) {
    const tag = t.toISOString().slice(0, 10)
    const status = tag === datum ? 'pruefung' : tag === heute ? (offen === 0 && plan.ziel > 0 ? 'heute-fertig' : 'heute') : tag > heute ? 'kommt' : getSessionCount(deck.name, tag).studied > 0 ? 'geuebt' : 'aus'
    leiste.push({ tag, status })
    if (tag >= datum || leiste.length > 40) break
  }
  // Ausblick: Wie viele Karten sitzen am Prüfungstag, wenn man jeden Tag das Pensum macht?
  // Eine Karte steigt höchstens eine Stufe pro Tag; verfügbar sind die Tage bis zum Vortag der Prüfung.
  const tageFuerKarte = c => tage - (stand(c).lastReviewed === heute ? 1 : 0)
  const sitzenDann = deck.cards.filter(c => arbeit(c) <= tageFuerKarte(c)).length
  return { datum, tage, ziel: plan.ziel, erledigt: heuteGeuebt.length, offen, queue: kandidaten.slice(0, offen), allesSitzt: rest === 0, leiste, sitzenDann, total: deck.cards.length }
}
