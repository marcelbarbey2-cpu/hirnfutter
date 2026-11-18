// Klassencodes: Verbindung zum Hirnfutter-Server.
// Schüler: Klassen beitreten, Sets abholen und aktuell halten (nur lesen).
// Lehrpersonen: mit dem Lehrercode Klassen und Sets verwalten.
import { SERVER, SERVER_VERSION } from './server-adresse.js'
import { getLib, saveLibSet, updateLibSet, deleteLibSet, neueId } from './bibliothek.js'
import { toItems } from './format.js'

const KEY_KLASSEN = 'zk:klassen'
const KEY_LP = 'zk:lp'
const ABSTAND = 10 * 60 * 1000 // höchstens alle 10 Minuten nachschauen

export const serverBereit = () => !!SERVER
/** Für Schüler: «26_27_Sek_E_Ia» → «Sek E Ia · 2026/27». Sek E und Sek P: römisch + klein, Sek B: arabisch + gross. Andere Namen bleiben, wie sie sind. */
export function anzeigeName(name) {
  const m = /^(\d{2})_(\d{2})_sek_([ebp])_(iii|ii|i|[123])([a-z])$/i.exec(String(name || '').trim())
  if (!m) return name || ''
  const e = m[3].toUpperCase() !== 'B'
  return 'Sek ' + m[3].toUpperCase() + ' ' + (e ? m[4].toUpperCase() + m[5].toLowerCase() : m[4] + m[5].toUpperCase()) + ' · 20' + m[1] + '/' + m[2]
}
export const normCode = c => String(c || '').toUpperCase().replace(/[^0-9A-Z]/g, '')
export const zeigeCode = c => { const n = normCode(c); return n.length === 6 ? n.slice(0, 3) + ' ' + n.slice(3) : n }

const lade = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d } catch { return d } }
const speichere = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }

class ServerFehler extends Error { constructor(status, msg) { super(msg); this.status = status } }

async function anfrage(pfad, { methode = 'GET', daten, code } = {}) {
  if (!SERVER) throw new ServerFehler(0, 'Der Klassen-Server ist noch nicht eingerichtet.')
  let r
  try {
    r = await fetch(SERVER.replace(/\/+$/, '') + pfad, {
      method: methode,
      headers: { ...(daten ? { 'Content-Type': 'application/json' } : {}), ...(code ? { Authorization: 'Bearer ' + code } : {}) },
      body: daten ? JSON.stringify(daten) : undefined,
      cache: 'no-store',
    })
  } catch { throw new ServerFehler(0, 'Keine Verbindung. Bist du online?') }
  let j = null
  try { j = await r.json() } catch {}
  if (!r.ok && r.status !== 410) throw new ServerFehler(r.status, j?.fehler || 'Fehler ' + r.status)
  return { status: r.status, daten: j }
}

// ── Schüler ─────────────────────────────────────────────────────────────────

/** [{ code, name, lehrer, stand, archiviert, fehlt }] */
export const getKlassen = () => { const l = lade(KEY_KLASSEN, []); return Array.isArray(l) ? l : [] }
const setKlassen = l => speichere(KEY_KLASSEN, l)
export const klassenSets = code => getLib().filter(s => s.quelle?.code === code)
export const istKlassenSet = s => !!s?.quelle

/** Klasse hinzufügen und gleich abgleichen. Gibt { klasse, ergebnis } zurück oder wirft mit verständlicher Meldung. */
export async function klasseBeitreten(eingabe) {
  const code = normCode(eingabe)
  if (code.length !== 6) throw new ServerFehler(400, 'Ein Klassencode hat 6 Zeichen.')
  let a
  try { a = await anfrage('/k/' + code) } catch (e) { if (e.status === 404) throw new ServerFehler(404, 'Diesen Klassencode gibt es nicht. Prüfe die Schreibweise.'); throw e }
  if (a.status === 410) throw new ServerFehler(410, 'Diese Klasse ist archiviert.')
  const l = getKlassen().filter(k => k.code !== code)
  const klasse = { code, name: a.daten.name, lehrer: lehrerText(a.daten.lehrer), stand: 0, archiviert: false, fehlt: false }
  l.push(klasse); setKlassen(l)
  const ergebnis = await abgleichen(klasse, a.daten)
  return { klasse, ergebnis }
}

/** Klasse entfernen: ihre Sets verschwinden, der Fortschritt bleibt gespeichert. */
export function klasseVerlassen(code) {
  for (const s of klassenSets(code)) deleteLibSet(s.id)
  setKlassen(getKlassen().filter(k => k.code !== code))
}

const lehrerText = l => Array.isArray(l) ? l.join(', ') : (l || '')

async function abgleichen(klasse, liste) {
  const erg = { neu: 0, geaendert: 0, entfernt: 0 }
  const lokal = new Map(klassenSets(klasse.code).map(s => [s.quelle.id, s]))
  const fremd = new Set(getLib().filter(s => s.quelle && s.quelle.code !== klasse.code).map(s => s.quelle.id))
  const vorhanden = new Set()
  for (const m of liste.sets || []) {
    vorhanden.add(m.id)
    if (fremd.has(m.id) && !lokal.has(m.id)) continue // schon über eine andere Klasse da
    const alt = lokal.get(m.id)
    if (alt && alt.quelle.geaendert === m.geaendert) continue
    let s
    try { s = (await anfrage('/s/' + encodeURIComponent(m.id) + '?k=' + klasse.code)).daten } catch { continue }
    const items = toItems({ v: 2, ...s.inhalt }).items
    if (!items.length) continue
    const quelle = { code: klasse.code, id: m.id, geaendert: m.geaendert }
    const thema = s.thema || m.thema || ''
    if (alt) { updateLibSet({ ...alt, items, fach: s.fach || alt.fach, thema, typ: s.typ, quelle: { ...quelle, von: m.von || '' }, neu: true }, s.titel, { still: true }); erg.geaendert++ }
    else { saveLibSet({ id: neueId(), titel: s.titel, fach: s.fach || '', thema, klasse: '', typ: s.typ, created: Date.now(), items, quelle: { ...quelle, von: m.von || '' }, neu: true }); erg.neu++ }
  }
  for (const [id, s] of lokal) if (!vorhanden.has(id)) { deleteLibSet(s.id); erg.entfernt++ }
  const l = getKlassen(), k = l.find(x => x.code === klasse.code)
  if (k) { Object.assign(k, { name: liste.name || k.name, lehrer: liste.lehrer != null ? lehrerText(liste.lehrer) : k.lehrer, stand: Date.now(), archiviert: false, fehlt: false }); setKlassen(l) }
  return erg
}

let laeuft = null
/** Alle Klassen abgleichen. Ohne `sofort` nur, wenn der letzte Abgleich länger her ist. */
export function alleAbgleichen({ sofort = false } = {}) {
  if (!SERVER) return Promise.resolve(null)
  if (laeuft) return laeuft
  laeuft = (async () => {
    const summe = { neu: 0, geaendert: 0, entfernt: 0, klassen: [] }
    for (const k of getKlassen()) {
      if (!sofort && Date.now() - (k.stand || 0) < ABSTAND) continue
      try {
        const a = await anfrage('/k/' + k.code)
        if (a.status === 410) { markiere(k.code, { archiviert: true }); continue }
        const e = await abgleichen(k, a.daten)
        summe.neu += e.neu; summe.geaendert += e.geaendert; summe.entfernt += e.entfernt
        if (e.neu || e.geaendert) summe.klassen.push(a.daten.name)
      } catch (e) {
        if (e.status === 404) markiere(k.code, { fehlt: true })
        if (e.status === 0) break // offline: später nochmals
      }
    }
    return summe
  })().finally(() => { laeuft = null })
  return laeuft
}
function markiere(code, was) { const l = getKlassen(), k = l.find(x => x.code === code); if (k) { Object.assign(k, was, { stand: Date.now() }); setKlassen(l) } }

/** Lehrer-Set als eigenes, bearbeitbares Set speichern. */
export function eigeneKopie(set) {
  const { quelle, neu, ...rest } = set
  return saveLibSet({ ...rest, id: neueId(), titel: set.titel + ' (Kopie)', created: Date.now() })
}

// ── Lehrperson ──────────────────────────────────────────────────────────────

// Ein gewöhnlicher Lehrercode bleibt auf dem Gerät gespeichert, bis man sich abmeldet.
// Der Verwaltungsschlüssel öffnet alles: Er gilt nur, bis die App geschlossen wird (sessionStorage),
// und landet nie in der Sicherungsdatei (siehe storage.js).
const sitzung = { lies: () => { try { const v = JSON.parse(sessionStorage.getItem(KEY_LP) || 'null'); return v || null } catch { return null } }, setz: v => { try { sessionStorage.setItem(KEY_LP, JSON.stringify(v)) } catch {} }, weg: () => { try { sessionStorage.removeItem(KEY_LP) } catch {} } }
export const getLehrercode = () => sitzung.lies() || lade(KEY_LP, null)
export const lehrerAbmelden = () => { sitzung.weg(); try { localStorage.removeItem(KEY_LP) } catch {} }
const lp = (pfad, opt = {}) => anfrage(pfad, { ...opt, code: getLehrercode() }).then(a => a.daten)
function merkeCode(c, istVerwaltung) {
  if (istVerwaltung) { sitzung.setz(c); try { localStorage.removeItem(KEY_LP) } catch {} }
  else { sitzung.weg(); speichere(KEY_LP, c) }
}

export async function lehrerAnmelden(code) {
  const c = String(code || '').trim()
  if (!c) throw new ServerFehler(400, 'Bitte den Lehrercode eingeben.')
  const d = (await anfrage('/lp', { code: c })).daten
  merkeCode(c, !!d?.lehrer?.admin)
  return d
}
export async function lehrerUebersicht() {
  const d = await lp('/lp')
  // Ältere Anmeldung: Ein dauerhaft gespeicherter Verwaltungsschlüssel zieht in die Sitzung um.
  if (d?.lehrer?.admin && lade(KEY_LP, null)) merkeCode(getLehrercode(), true)
  return d
}
export const klasseAnlegen = name => lp('/lp/klasse', { methode: 'POST', daten: { name } })
export const klasseAendern = (code, daten) => lp('/lp/klasse/' + code, { methode: 'PATCH', daten })
export const klasseLoeschen = code => lp('/lp/klasse/' + code, { methode: 'DELETE' })
export const klasseWiederherstellen = code => lp('/lp/klasse/' + code + '/wiederherstellen', { methode: 'POST' })
export const setLoeschen = id => lp('/lp/set/' + id, { methode: 'DELETE' })
export const klasseBeitretenLp = code => lp('/lp/klasse/' + normCode(code) + '/beitreten', { methode: 'POST' })
export const klasseVerlassenLp = code => lp('/lp/klasse/' + code + '/verlassen', { methode: 'POST' })
export const setWiederherstellen = id => lp('/lp/set/' + id + '/wiederherstellen', { methode: 'POST' })

/** Lokales Set veröffentlichen oder aktualisieren; optional gleich in eine Klasse legen. */
export async function veroeffentlichen(set, klassenCode) {
  const id = set.lp?.id || 'neu'
  const m = await lp('/lp/set/' + id, { methode: 'PUT', daten: {
    titel: set.titel, fach: set.fach, thema: set.thema || '', typ: set.typ === 'karten' ? 'karten' : 'test',
    inhalt: { v: 2, titel: set.titel, fach: set.fach, items: set.items },
    klassen: klassenCode ? [klassenCode] : [],
  } })
  updateLibSet({ ...set, lp: { id: m.id, stand: Date.now() } }, null, { still: true })
  return m
}
/** Veröffentlichtes Set vom Server auf dieses Gerät holen (z. B. an einem anderen Computer). */
export async function aufGeraetHolen(id) {
  const s = await lp('/lp/set/' + id)
  const items = toItems({ v: 2, ...s.inhalt }).items
  return saveLibSet({ id: neueId(), titel: s.titel, fach: s.fach || '', thema: s.thema || '', klasse: '', typ: s.typ, created: Date.now(), items, lp: { id: s.id, stand: Date.now() } })
}
/** Hat das lokale Set Änderungen, die noch nicht veröffentlicht sind? */
export const ungespeichert = set => !!set.lp && (set.geaendert || 0) > (set.lp.stand || 0)

/** Läuft bei Cloudflare der Worker, der zu dieser App passt? @returns {Promise<boolean|null>} null = nicht erreichbar */
export async function serverPasst() {
  try { const d = (await anfrage('/')).daten; return d?.version === SERVER_VERSION } catch { return null }
}
export const appStand = () => SERVER_VERSION.slice(0, 10).split('-').reverse().map(Number).join('.')

// ── Verwaltung (nur mit dem Verwaltungsschlüssel) ────────────────────────────
export const verwLehrer = () => lp('/admin/lehrer')
export const verwLehrerNeu = name => lp('/admin/lehrer', { methode: 'POST', daten: { name } })
export const verwSperren = (id, an) => lp('/admin/lehrer/' + id + (an ? '/entsperren' : '/sperren'), { methode: 'POST' })
export const verwLoeschen = id => lp('/admin/lehrer/' + id, { methode: 'DELETE' })
export const verwNeuerCode = id => lp('/admin/lehrer/' + id + '/neuer-code', { methode: 'POST' })
export const verwUebergeben = (code, lpId) => lp('/admin/klasse/' + code + '/uebergeben', { methode: 'POST', daten: { lp: lpId } })
// Notfall-Recht der Verwaltung über einzelne Sets, egal von wem
export const verwKlasse = code => lp('/admin/klasse/' + code)
export const verwKlasseSet = (code, setId, tat) => lp('/admin/klasse/' + code + '/set/' + setId + '/' + tat, { methode: 'POST' })
export const verwSetLoeschen = setId => lp('/admin/set/' + setId, { methode: 'DELETE' })
export const verwSetWieder = setId => lp('/admin/set/' + setId + '/wiederherstellen', { methode: 'POST' })
