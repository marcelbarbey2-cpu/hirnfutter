// Eigene Sets (mit der KI erstellt oder eingefügt). Karten-Sets aus Links bleiben
// in `zk:sets`; hier liegt alles Neue: Karten, Testvorbereitung und Tutor-Lektionen.
import { getSets, speicherVoll, zieheUm } from './storage.js'
import { itemKey, solText, frageText } from './format.js'

const KEY_LIB = 'zk:lib'
const MAX_LIB = 500

function load() {
  try { const l = JSON.parse(localStorage.getItem(KEY_LIB) || '[]'); return Array.isArray(l) ? l : [] } catch { return [] }
}
function save(list) { try { localStorage.setItem(KEY_LIB, JSON.stringify(list.slice(0, MAX_LIB))) } catch { speicherVoll() } }

export const getLib = () => load()
export const getLibSet = id => load().find(s => s.id === id)

/** Name eindeutig machen: der Fortschritt hängt am Namen. */
function freierName(titel, ausser) {
  const belegt = new Set([...load().filter(s => s.id !== ausser).map(s => s.titel), ...getSets().map(s => s.name)])
  let n = titel || 'Neues Set', i = 2
  while (belegt.has(n)) n = `${titel} (${i++})`
  return n
}

export function saveLibSet(set) {
  if (!set.geaendert) set.geaendert = Date.now()
  const list = load().filter(s => s.id !== set.id)
  set.titel = freierName(String(set.titel || 'Neues Set').trim().slice(0, 80), set.id)
  list.unshift(set)
  save(list)
  return set
}
/** Wie saveLibSet, aber die Reihenfolge bleibt und der Fortschritt zieht bei neuem Titel mit. */
export function updateLibSet(set, neuerTitel, { still = false } = {}) {
  if (!still) set.geaendert = Date.now()
  const list = load(), i = list.findIndex(s => s.id === set.id)
  if (i < 0) return saveLibSet(set)
  const alt = list[i].titel
  if (neuerTitel != null) set.titel = freierName(String(neuerTitel || alt).trim().slice(0, 80), set.id)
  list[i] = set
  save(list)
  if (set.titel !== alt) zieheUm(alt, set.titel)
  return set
}
export function deleteLibSet(id) { save(load().filter(s => s.id !== id)) }
export const neueId = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3)

/** Karten/Aufgaben eines Sets als Deck für Leitner und Fortschritt. */
export function libDeck(set) {
  const roh = set.typ === 'tutor'
    ? (set.lektion?.schritte || []).filter(s => s?.s === 'aufgabe').map(s => s.item)
    : (Array.isArray(set.items) ? set.items : []).filter(it => it && it.t !== 'info')
  const seen = new Set()
  const cards = []
  let beschaedigt = 0
  for (const it of roh) {
    // Eine fehlerhafte Aufgabe (z. B. aus einer abgeschnittenen KI-Antwort oder alten Sicherung)
    // wird übersprungen und gezählt. Sonst bricht der ganze Start ab und die App bleibt weiss.
    try {
      const id = itemKey(it)
      if (seen.has(id)) continue
      seen.add(id)
      cards.push({ ...it, id, front: frageText(it), back: solText(it) })
    } catch (e) { beschaedigt++; console.warn('[Set] Aufgabe übersprungen in «' + set.titel + '»:', e) }
  }
  return { name: String(set.titel || 'Ohne Titel'), cards, kind: 'lib', libId: set.id, typ: set.typ, fach: set.fach || '', klasse: set.klasse || '', set, beschaedigt }
}
