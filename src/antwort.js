/**
 * Hirnfutter — getippte Antworten prüfen
 *
 * Der Vergleich ist der ganze Modus. Zu streng, und jede zweite richtige
 * Antwort wird abgelehnt; zu locker, und der Schüler lernt nichts. Deshalb
 * drei Ausgänge statt zwei: richtig, beinahe, falsch. «Beinahe» bestraft
 * nicht, es fragt nach — der Schüler entscheidet dann selbst.
 *
 * Streng heisst hier: fehlender Artikel und fehlender Akzent sind *nicht*
 * richtig, sondern beinahe. Bei «der Nachbar» und «café» ist genau das
 * der Lernstoff.
 */

/** Artikel, die vorne wegfallen dürfen — Deutsch, Englisch, Französisch. */
const ARTIKEL = new Set([
  'der', 'die', 'das', 'den', 'dem', 'des',
  'ein', 'eine', 'einen', 'einem', 'einer', 'eines',
  'the', 'a', 'an',
  'le', 'la', 'les', 'un', 'une',
])

/** Gross/klein, doppelte Leerzeichen, Anführungszeichen und Schlusszeichen weg. */
export function normalisieren(text) {
  return String(text ?? '')
    // Typografische Apostrophe und ß sind Tastatur- bzw. Landesfrage, kein
    // Lernstoff: «l'eau» = «l’eau», und in der Schweiz schreibt man «Strasse».
    .replace(/[’‘´`]/g, "'")
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/^[\s"'«»„“‚‘(]+/, '')
    .replace(/[\s.,;:!?"'«»„“‚‘)…]+$/, '')
}

function ohneAkzente(text) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function ohneArtikel(text) {
  const elidiert = text.replace(/^[ldsc]'\s*/, '')     // l'eau, d'accord, s'il
  const teile = elidiert.split(' ')
  if (teile.length > 1 && ARTIKEL.has(teile[0])) return teile.slice(1).join(' ')
  return elidiert
}

/** Für den Beinahe-Vergleich: ohne Artikel, ohne Akzente. */
function lockern(text) {
  return ohneAkzente(ohneArtikel(text))
}

/**
 * Mögliche Antworten. «das Finale, das Endspiel» sind zwei — eine reicht.
 * Die ganze Zeichenkette bleibt zusätzlich stehen, damit ein Satz mit Komma
 * («Guten Tag, wie geht es dir?») nicht in unbrauchbare Stücke zerfällt.
 */
export function kandidaten(antwort) {
  const ganz  = String(antwort ?? '')
  const teile = ganz.split(/[,;/]|\bbzw\.?\b|\boder\b/i)
  return [ganz, ...teile].map(normalisieren).filter(Boolean)
}

/** Levenshtein mit Abbruch, sobald die Grenze überschritten ist. */
function abstand(a, b, grenze) {
  if (Math.abs(a.length - b.length) > grenze) return grenze + 1
  let vorher = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const jetzt = [i]
    let kleinste = i
    for (let j = 1; j <= b.length; j++) {
      const kosten = a[i - 1] === b[j - 1] ? 0 : 1
      jetzt[j] = Math.min(vorher[j] + 1, jetzt[j - 1] + 1, vorher[j - 1] + kosten)
      if (jetzt[j] < kleinste) kleinste = jetzt[j]
    }
    if (kleinste > grenze) return grenze + 1
    vorher = jetzt
  }
  return vorher[b.length]
}

/** Ein Tippfehler ist erlaubt, bei längeren Wörtern zwei. */
function tippfehlernah(a, b) {
  const grenze = Math.max(a.length, b.length) >= 8 ? 2 : 1
  return abstand(a, b, grenze) <= grenze
}

/**
 * → 'leer' | 'richtig' | 'beinahe' | 'falsch'
 */
export function pruefeAntwort(eingabe, antwort) {
  const e = normalisieren(eingabe)
  if (!e) return 'leer'

  const moeglich = kandidaten(antwort)
  if (!moeglich.length) return 'falsch'

  if (moeglich.includes(e)) return 'richtig'

  const eLocker = lockern(e)
  if (moeglich.some(k => lockern(k) === eLocker)) return 'beinahe'
  if (moeglich.some(k => tippfehlernah(k, e))) return 'beinahe'
  if (moeglich.some(k => tippfehlernah(lockern(k), eLocker))) return 'beinahe'

  return 'falsch'
}
