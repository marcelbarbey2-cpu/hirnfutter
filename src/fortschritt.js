// Bewertung einer Karte oder Aufgabe: Fach, Bestmarke, Krümel, Tagesprotokoll.
// Gilt für alle Items gleich — Karte, Test-Aufgabe oder Tutor-Aufgabe.
import { getCardState, setCardState, getBestmarke, addKruemel, bumpSessionCount, bumpTag, merkeFehler } from './storage.js'
import { nextBox, today, kruemelFuerAufstieg, isDue } from './leitner.js'

/** richtig → «Gut», beinahe → «Schwer» (Fach bleibt), falsch → «Nochmal». */
export const gradeAus = r => (r === 'richtig' ? 2 : r === 'beinahe' ? 1 : 0)

/**
 * @param {boolean|undefined} faellig  war die Karte zu Beginn dran? (undefined = jetzt prüfen)
 * @returns {{kruemel:number, neuesFach:number}}
 */
export function bewerte(deckName, cardId, grade, faellig) {
  const st = getCardState(deckName, cardId)
  if (faellig === undefined) faellig = isDue(st)
  const neu = nextBox(st.box, grade)
  const best = getBestmarke(deckName, cardId)
  let kruemel = 0, belohntBis
  if (faellig && neu > best) {
    kruemel = kruemelFuerAufstieg(best, neu)
    if (kruemel) { addKruemel(kruemel); belohntBis = neu }
  }
  setCardState(deckName, cardId, { box: neu, lastReviewed: today(), belohntBis })
  bumpSessionCount(deckName, today(), grade)
  bumpTag(today())
  merkeFehler(deckName, cardId, grade)
  return { kruemel, neuesFach: neu }
}
