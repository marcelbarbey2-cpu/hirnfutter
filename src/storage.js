// ── Ablage ───────────────────────────────────────────────────────────────────
//
// Decks kommen als Link herein (`#d=…`), nicht mehr als Datei. Damit ändert
// sich, woran der Fortschritt hängt:
//
//   früher:  zk_prog_<deckId>   →  { <card.id>: { box, lastReviewed } }
//   jetzt:   zk:p:<fnv(Name)>   →  { <fnv(Vorderseite)>: { b, r } }
//
// Beides ist Absicht:
//   • Der **Set-Name** ist der Schlüssel, nicht eine Import-ID. Ein überarbeitetes
//     Set mit gleichem Namen führt den Fortschritt weiter.
//   • Die **Vorderseite** identifiziert die Karte, denn Link-Decks haben keine IDs.
//     Folge: Vorderseite ändern = neue Karte. Rückseite ändern ist folgenlos.
//
// Dieses Format liest die Klassenseite (`karteikarten/index.html`, `statFor()`)
// bereits, um ihre Fortschrittsbalken zu füllen — es ist ein Vertrag, kein Detail.
// Nach aussen liefert dieses Modul weiterhin `{ box, lastReviewed }`, damit
// `leitner.js` unverändert bleibt.

/** FNV-1a, Basis 36 — identisch zur Klassenseite. Nicht ändern. */
export function fnv(str) {
  let h = 0x811c9dc5
  const s = String(str)
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return (h >>> 0).toString(36)
}

const KEY_PROG     = name => `zk:p:${fnv(name)}`
const KEY_SETTINGS = name => `zk:o:${fnv(name)}`
const KEY_SESSION  = (name, date) => `zk:s:${fnv(name)}:${date}`
const KEY_SETS     = 'zk:sets'

/** So viele zuletzt geöffnete Sets bleiben in der Liste. */

function load(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch { return fallback }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { speicherVoll() }
}

// ── Zuletzt geöffnete Sets ───────────────────────────────────────────────────
// Karten werden mitgespeichert, damit die App ohne Link und ohne Netz brauchbar
// bleibt: Icon antippen, Set wählen, weiterlernen.

/** @returns {Array<{name:string, cards:Array<[string,string]>, openedAt:string}>} */
export function getSets() {
  const list = load(KEY_SETS, [])
  return Array.isArray(list) ? list : []
}

/** Nach der Übernahme in die Bibliothek (linkSetsUebernehmen) ist die alte Liste leer. */
export function vergissAlleLinks() {
  try { localStorage.removeItem(KEY_SETS) } catch {}
}

// ── Fortschritt ──────────────────────────────────────────────────────────────

/** Rohform aus dem Speicher: { <fnv(front)>: { b, r } } */
function rawProgress(name) {
  const p = load(KEY_PROG(name), {})
  return p && typeof p === 'object' ? p : {}
}

/** Nach aussen im Format, das `leitner.js` erwartet. */
export function getProgress(name) {
  const raw = rawProgress(name)
  const out = {}
  for (const [cardId, v] of Object.entries(raw)) {
    out[cardId] = { box: v?.b ?? 1, lastReviewed: v?.r ?? null, belohnt: v?.h ?? v?.b ?? 1 }
  }
  return out
}

export function getCardState(name, cardId) {
  return getProgress(name)[cardId] ?? { box: 1, lastReviewed: null }
}

export function setCardState(name, cardId, state) {
  const raw = rawProgress(name)
  const vorher = raw[cardId]
  // `h` = bis zu welchem Fach für diese Karte schon Krümel vergeben wurden.
  // Bewusst NICHT automatisch mit `box` mitziehen: wer zusätzlich übt, ohne dass
  // die Karte fällig war, bekommt zwar keine Krümel — soll sich damit aber auch
  // nicht die späteren verbauen.
  const belohnt = state.belohntBis ?? vorher?.h ?? 1
  raw[cardId] = { b: state.box, r: state.lastReviewed, h: belohnt }
  save(KEY_PROG(name), raw)
}

/**
 * Setzt die Fächer zurück, **behält aber die Bestmarken**. Sonst wäre
 * «Zurücksetzen» eine Krümelmaschine: zurücksetzen, neu hochklettern, neu
 * kassieren. Der Fortschritt startet neu, die Belohnung bleibt vergeben.
 */
export function resetProgress(name) {
  const raw = rawProgress(name)
  const neu = {}
  for (const [id, v] of Object.entries(raw)) {
    const hoch = v?.h ?? v?.b ?? 1
    if (hoch > 1) neu[id] = { b: 1, r: null, h: hoch }
  }
  save(KEY_PROG(name), neu)
}

// ── Einstellungen je Set ─────────────────────────────────────────────────────
export function getSetSettings(name) {
  const s = load(KEY_SETTINGS(name), { reversed: false, tippen: false })
  return { reversed: !!s?.reversed, tippen: !!s?.tippen, pause: !!s?.pause, pruefung: /^\d{4}-\d{2}-\d{2}$/.test(s?.pruefung || '') ? s.pruefung : '' }
}
export function saveSetSettings(name, settings) {
  save(KEY_SETTINGS(name), { reversed: !!settings.reversed, tippen: !!settings.tippen, pause: !!settings.pause, pruefung: settings.pruefung || '' })
}
/** Prüfungstermin, den der Schüler selbst setzt ('YYYY-MM-DD' oder '' = keiner). Solche Sets stehen auf dem Start zuoberst. */
export function setzePruefung(name, datum) { const s = getSetSettings(name); s.pruefung = datum || ''; saveSetSettings(name, s) }

// ── Erinnerung an die Sicherung ──────────────────────────────────────────────
// Alles liegt nur im Browser. Darum erinnert der Start ab und zu daran, die Daten als Datei zu sichern.
const KEY_SICH = 'zk:sich'
const TAG = 86400000
export function sicherungGemacht() { const s = load(KEY_SICH, {}) || {}; save(KEY_SICH, { ...s, letzte: Date.now(), spaeter: 0 }) }
export function sicherungSpaeter() { const s = load(KEY_SICH, {}) || {}; save(KEY_SICH, { ...s, spaeter: Date.now() }) }
/** Erste Erinnerung nach 14 Tagen Nutzung, danach 30 Tage nach der letzten Sicherung; «Später» schiebt um 14 Tage. */
export function sicherungFaellig(jetzt = Date.now()) {
  let s = load(KEY_SICH, null)
  if (!s || typeof s !== 'object' || !s.seit) { s = { ...(s || {}), seit: jetzt }; save(KEY_SICH, s) }
  if (s.spaeter && jetzt - s.spaeter < 14 * TAG) return false
  return s.letzte ? jetzt - s.letzte > 30 * TAG : jetzt - s.seit > 14 * TAG
}
/** «Vom Start nehmen»: Das Set bleibt in der Bibliothek und lässt sich üben, erscheint aber nicht mehr auf dem Start und nicht bei «Meine Fehler». */
export const istPausiert = name => getSetSettings(name).pause
export function setzePause(name, an) { const s = getSetSettings(name); s.pause = !!an; saveSetSettings(name, s) }

// ── Tagespensum ──────────────────────────────────────────────────────────────
export function getSessionCount(name, date) {
  const s = load(KEY_SESSION(name, date), { studied: 0, correct: 0 })
  return { studied: s?.studied ?? 0, correct: s?.correct ?? 0 }
}
export function bumpSessionCount(name, date, grade) {
  const data = getSessionCount(name, date)
  data.studied += 1
  if (grade >= 2) data.correct += 1
  save(KEY_SESSION(name, date), data)
}

// ── Speicher haltbar machen ──────────────────────────────────────────────────
// Ohne das räumen Browser die Daten von selten besuchten Seiten irgendwann weg —
// auf iOS schon nach wenigen Wochen Nichtnutzung. Der Browser gewährt es eher,
// wenn die App zum Startbildschirm hinzugefügt wurde.
export async function requestPersistence() {
  try {
    if (!navigator.storage?.persist) return null
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch { return null }
}

// ── Hirnfutter: Krümel, Serie, Tagesprotokoll ────────────────────────────────
//
// Der Kartenfortschritt bekommt ein drittes Feld: `h` = höchstes je erreichtes
// Fach. Die Klassenseite liest nur `b` und stört sich nicht daran.

const KEY_KRUEMEL = 'zk:kruemel'
const KEY_SERIE   = 'zk:serie'
const KEY_TAGE    = 'zk:tage'

/** So viele Tage bleiben im Protokoll — reicht für Serie und Rückblick. */
const TAGE_BEHALTEN = 90

/**
 * Bis zu welchem Fach diese Karte schon Krümel eingebracht hat.
 * Für Altbestand ohne `h` gilt das aktuelle Fach — rückwirkend wird nichts vergeben.
 */
export function getBestmarke(name, cardId) {
  const roh = rawProgress(name)[cardId]
  return roh?.h ?? roh?.b ?? 1
}

// ── Krümel ───────────────────────────────────────────────────────────────────
export function getKruemel() {
  const k = load(KEY_KRUEMEL, { total: 0 })
  return { total: k?.total ?? 0 }
}

/** Krümel ausgeben. Gibt false zurück, wenn es nicht reicht — nie ins Minus. */
export function zahleKruemel(preis) {
  const jetzt = getKruemel().total
  if (preis > jetzt) return false
  save(KEY_KRUEMEL, { total: jetzt - preis })
  return true
}

export function addKruemel(anzahl) {
  if (!anzahl) return getKruemel().total
  const neu = getKruemel().total + anzahl
  save(KEY_KRUEMEL, { total: neu })
  return neu
}

// ── Tagesprotokoll ───────────────────────────────────────────────────────────
// { 'YYYY-MM-DD': Anzahl bewerteter Karten } — Grundlage für Serie und Rückblick.

export function getTage() {
  const t = load(KEY_TAGE, {})
  return t && typeof t === 'object' ? t : {}
}

export function bumpTag(datum) {
  const tage = getTage()
  tage[datum] = (tage[datum] ?? 0) + 1
  // Alte Tage wegwerfen, damit der Eintrag nicht unbegrenzt wächst.
  const behalten = Object.keys(tage).sort().slice(-TAGE_BEHALTEN)
  const knapp = {}
  for (const d of behalten) knapp[d] = tage[d]
  save(KEY_TAGE, knapp)
  return knapp[datum]
}

// ── Serie ────────────────────────────────────────────────────────────────────
// { letzterTag, laenge, rekord, jokerWoche, marken: [] }
// Ein Joker pro Kalenderwoche fängt einen verpassten Tag ab — ohne dass jemand
// ihn einlösen muss. Reisst die Serie doch, bleibt der Rekord stehen.

export function getSerie() {
  const s = load(KEY_SERIE, null)
  return {
    letzterTag:  s?.letzterTag ?? null,
    laenge:      s?.laenge ?? 0,
    rekord:      s?.rekord ?? 0,
    jokerWoche:  s?.jokerWoche ?? null,
    marken:      Array.isArray(s?.marken) ? s.marken : [],
  }
}

export function saveSerie(serie) { save(KEY_SERIE, serie) }
// ── Futterserie ──────────────────────────────────────────────────────────────
//
// Ein Tag zählt, wenn mindestens MIN_KARTEN bewertet wurden **oder** nichts mehr
// fällig ist — sonst hielte man die Serie mit einem einzigen Klick am Leben.
// Ein Joker pro Kalenderwoche fängt einen verpassten Tag ab, automatisch.
// Reisst die Serie doch, wird nicht geschimpft: der Rekord bleibt stehen.

const MIN_KARTEN = 10
const SERIEN_MARKEN = { 3: 5, 7: 15, 14: 30, 30: 75, 100: 250 }

function tagVor(datum, tage = 1) {
  const d = new Date(datum + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - tage)
  return d.toISOString().slice(0, 10)
}

/** Kalenderwoche als 'YYYY-Www' — der Joker gilt je Woche einmal. */
function woche(datum) {
  const d = new Date(datum + 'T00:00:00Z')
  const tag = (d.getUTCDay() + 6) % 7           // Montag = 0
  d.setUTCDate(d.getUTCDate() - tag + 3)        // Donnerstag der Woche
  const jahr = d.getUTCFullYear()
  const ersterDo = new Date(Date.UTC(jahr, 0, 4))
  const versatz = (ersterDo.getUTCDay() + 6) % 7
  ersterDo.setUTCDate(ersterDo.getUTCDate() - versatz + 3)
  const nr = 1 + Math.round((d - ersterDo) / (7 * 86400000))
  return `${jahr}-W${String(nr).padStart(2, '0')}`
}

/** Hat der Tag genug hergegeben, um die Serie zu tragen? */
function tagZaehlt(datum, tage, nichtsMehrFaellig) {
  return (tage[datum] ?? 0) >= MIN_KARTEN || nichtsMehrFaellig
}

/**
 * Serie nach einer Lerneinheit fortschreiben.
 * @returns {{ serie, bonus:number, neueMarke:number|null }}
 */
export function serieFortschreiben(heute, tage, nichtsMehrFaellig) {
  const serie = getSerie()
  if (!tagZaehlt(heute, tage, nichtsMehrFaellig)) return { serie, bonus: 0, neueMarke: null }
  if (serie.letzterTag === heute) return { serie, bonus: 0, neueMarke: null }

  const gestern = tagVor(heute)
  let laenge

  if (serie.letzterTag === gestern) {
    laenge = serie.laenge + 1
  } else if (serie.letzterTag === tagVor(heute, 2) && serie.jokerWoche !== woche(heute)) {
    // Genau ein Tag ausgelassen und der Wochenjoker ist frei → Serie hält.
    laenge = serie.laenge + 1
    serie.jokerWoche = woche(heute)
  } else {
    laenge = 1
    serie.marken = []
  }

  serie.laenge     = laenge
  serie.letzterTag = heute
  serie.rekord     = Math.max(serie.rekord, laenge)

  let bonus = 0, neueMarke = null
  if (SERIEN_MARKEN[laenge] && !serie.marken.includes(laenge)) {
    bonus = SERIEN_MARKEN[laenge]
    neueMarke = laenge
    serie.marken = [...serie.marken, laenge]
  }

  saveSerie(serie)
  if (bonus) addKruemel(bonus)
  return { serie, bonus, neueMarke }
}

/** Läuft die Serie heute noch? (Gestern oder heute zuletzt gefüttert.) */
export function serieLebt(heute) {
  const s = getSerie()
  if (!s.letzterTag) return false
  return s.letzterTag === heute || s.letzterTag === tagVor(heute) || s.letzterTag === tagVor(heute, 2)
}

export const SERIE_MIN_KARTEN = MIN_KARTEN


// ── Speicher voll, Fehlerliste, Sicherung, Umbenennen ────────────────────────

/** Wird gemeldet, statt still zu scheitern. */
export function speicherVoll() { try { window.dispatchEvent(new Event('zk:voll')) } catch {} }

const KEY_FEHLER = 'zk:fehler'
const fk = (name, id) => name + '\u0001' + id
/** { "<Setname>\u0001<Karten-ID>": 1 } — zuletzt falsch beantwortet. */
export function getFehler() { const f = load(KEY_FEHLER, {}); return f && typeof f === 'object' ? f : {} }
export function merkeFehler(name, id, grade) {
  const f = getFehler(), k = fk(name, id)
  if (grade === 0) f[k] = 1
  else if (grade >= 2) delete f[k]
  else return
  save(KEY_FEHLER, f)
}
export const istFehler = (f, name, id) => !!f[fk(name, id)]

/** Fortschritt, Einstellungen und Fehler ziehen beim Umbenennen mit. */
export function zieheUm(alt, neu) {
  if (alt === neu) return
  for (const K of [KEY_PROG, KEY_SETTINGS]) {
    try { const v = localStorage.getItem(K(alt)); if (v != null) { localStorage.setItem(K(neu), v); localStorage.removeItem(K(alt)) } } catch { speicherVoll() }
  }
  const f = getFehler(), out = {}
  for (const k of Object.keys(f)) out[k.startsWith(alt + '\u0001') ? neu + k.slice(alt.length) : k] = 1
  save(KEY_FEHLER, out)
}

/** Gehört nie in eine Sicherungsdatei: der Lehrercode (wer die Datei weitergibt, gäbe sonst den Zugang weiter). */
const NICHT_SICHERN = new Set(['zk:lp'])

/** Alles, was die App gespeichert hat, als ein Objekt. Ohne Lehrercode. */
export function sicherung() {
  const daten = {}
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('zk') && !NICHT_SICHERN.has(k)) daten[k] = localStorage.getItem(k) }
  return { app: 'hirnfutter', v: 1, datum: new Date().toISOString(), daten }
}
const anzahlSets = daten => {
  let n = 0
  for (const k of ['zk:lib', 'zk:sets']) { try { const l = JSON.parse(daten[k] || '[]'); if (Array.isArray(l)) n += l.length } catch {} }
  return n
}
/** Vor dem Wiederherstellen: Was steckt in der Datei? @returns {{datum:string, sets:number}|null} null = keine Hirnfutter-Sicherung */
export function sicherungInfo(obj) {
  if (!obj || obj.app !== 'hirnfutter' || !obj.daten || typeof obj.daten !== 'object') return null
  return { datum: String(obj.datum || ''), sets: anzahlSets(obj.daten) }
}
/** Wie viele Sets liegen jetzt auf diesem Gerät? */
export const setsAufGeraet = () => anzahlSets({ 'zk:lib': localStorage.getItem('zk:lib'), 'zk:sets': localStorage.getItem('zk:sets') })
/** @returns {number} Anzahl übernommener Einträge, -1 bei unlesbarer Datei */
export function wiederherstellen(obj) {
  if (!obj || obj.app !== 'hirnfutter' || !obj.daten || typeof obj.daten !== 'object') return -1
  let n = 0
  for (const [k, v] of Object.entries(obj.daten)) {
    if (!k.startsWith('zk') || typeof v !== 'string' || NICHT_SICHERN.has(k)) continue
    try { localStorage.setItem(k, v); n++ } catch { speicherVoll(); break }
  }
  return n
}
