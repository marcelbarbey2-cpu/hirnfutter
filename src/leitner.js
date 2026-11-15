// ── Leitner 5-Box + Anki-style grading ───────────────────────────────────────
//
// Box intervals (days between reviews):
//   Box 1 → 1 day   (daily)
//   Box 2 → 2 days
//   Box 3 → 4 days
//   Box 4 → 8 days
//   Box 5 → 16 days
//
// Anki-style grades:
//   0 = Again  → box 1
//   1 = Hard   → stay (same box)
//   2 = Good   → box + 1
//   3 = Easy   → box + 2

const BOX_INTERVALS = [0, 1, 2, 4, 8, 16]
const MAX_BOX = 5
export const ROUND_SIZE = 20

export function today() {
  return new Date().toISOString().slice(0, 10)
}

function daysBetween(dateA, dateB) {
  const a = new Date(dateA)
  const b = new Date(dateB)
  return Math.floor((b - a) / 86400000)
}

export function isDue(cardState) {
  const { box, lastReviewed } = cardState
  if (!lastReviewed) return true
  const interval = BOX_INTERVALS[box] ?? 16
  return daysBetween(lastReviewed, today()) >= interval
}

// grade: 0=Again, 1=Hard, 2=Good, 3=Easy
export function nextBox(currentBox, grade) {
  if (grade === 0) return 1
  if (grade === 1) return currentBox                        // stay
  if (grade === 2) return Math.min(currentBox + 1, MAX_BOX)
  if (grade === 3) return Math.min(currentBox + 2, MAX_BOX)
  return 1
}

export function getDueCards(deck, progress, limit = ROUND_SIZE) {

  const allDue = deck.cards.filter(card => {
    const state = progress[card.id] ?? { box: 1, lastReviewed: null }
    return isDue(state)
  })

  allDue.sort((a, b) => {
    const reviewedA = !!progress[a.id]?.lastReviewed
    const reviewedB = !!progress[b.id]?.lastReviewed
    if (reviewedA !== reviewedB) return reviewedA ? -1 : 1
    const boxA = (progress[a.id] ?? { box: 1 }).box
    const boxB = (progress[b.id] ?? { box: 1 }).box
    return boxA - boxB
  })

  return allDue.slice(0, limit)
}

export function getAllCardsSorted(deck, progress) {
  return [...deck.cards].sort((a, b) => {
    const boxA = (progress[a.id] ?? { box: 1 }).box
    const boxB = (progress[b.id] ?? { box: 1 }).box
    return boxA - boxB
  })
}

export function getDeckStats(deck, progress) {
  const total = deck.cards.length
  const boxCounts = [0, 0, 0, 0, 0, 0]

  deck.cards.forEach(card => {
    const state = progress[card.id] ?? { box: 1, lastReviewed: null }
    boxCounts[state.box] = (boxCounts[state.box] || 0) + 1
  })

  const mastered = boxCounts[5] || 0
  const dueCount = deck.cards.filter(card => {
    const state = progress[card.id] ?? { box: 1, lastReviewed: null }
    return isDue(state)
  }).length

  return { total, mastered, dueCount, boxCounts }
}

// ── Hirnfutter: Krümel ───────────────────────────────────────────────────────
//
// Krümel belohnen Können, nicht Klicks. Zwei Regeln halten das ehrlich, weil die
// Bewertung ja selbst vergeben wird:
//
//   1. Nur für **neue Bestmarken**. Pro Karte wird das höchste je erreichte Fach
//      gemerkt (`h`). Fällt sie zurück und klettert wieder hoch, gibt es nichts —
//      sonst wäre «Nochmal → Einfach» eine Krümelmaschine.
//   2. Nur für **fällige** Karten. «Alles üben» zweimal hintereinander bringt beim
//      zweiten Mal null, weil nichts fällig ist. Mehr Krümel gibt es nur, wenn man
//      an einem anderen Tag wiederkommt — verstrichene Zeit ist das Einzige in
//      dieser App, das sich nicht wegklicken lässt.

/** Krümel für das Erreichen des jeweiligen Fachs. Fach 1 ist der Start. */
export const KRUEMEL_PRO_FACH = [0, 0, 1, 2, 3, 5]

/** Ab diesem Fach gilt eine Karte als «sitzt» — App und Klassenseite gleich. */
export const SITZT_AB = 4

/** Krümel für den Sprung von der bisherigen Bestmarke auf ein neues Fach. */
export function kruemelFuerAufstieg(alteBestmarke, neuesFach) {
  let summe = 0
  for (let fach = alteBestmarke + 1; fach <= neuesFach; fach++) {
    summe += KRUEMEL_PRO_FACH[fach] ?? 0
  }
  return summe
}

/** Höchstens erreichbare Krümel eines Decks — für «wie weit bin ich?». */
export function kruemelMaximum(deck) {
  return deck.cards.length * KRUEMEL_PRO_FACH.reduce((a, b) => a + b, 0)
}

/** Karten, die «sitzen» (Fach 4 oder 5). */
export function sitztCount(deck, progress) {
  return deck.cards.filter(c => (progress[c.id]?.box ?? 1) >= SITZT_AB).length
}

/**
 * Stufen nach Gesamtkrümeln. Portionsgrössen statt «Level 4» — passt zum Namen
 * und sagt einem Zwölfjährigen mehr. Znüni/Zvieri sind hier bewusst Schweizer.
 * Ein volles 84-Karten-Set bringt maximal 924 Krümel; «Bankett» ist also nichts
 * für eine Woche, «Happen» dagegen schon für die erste Sitzung.
 */
export const STUFEN = [
  { ab: 0,    name: 'Hungrig'  },
  { ab: 40,   name: 'Happen'   },
  { ab: 120,  name: 'Znüni'    },
  { ab: 300,  name: 'Zvieri'   },
  { ab: 700,  name: 'Mahlzeit' },
  { ab: 1500, name: 'Festmahl' },
  { ab: 3000, name: 'Bankett'  },
]

/** Aktuelle Stufe und der Weg zur nächsten. */
export function stufeFuer(kruemel) {
  let idx = 0
  for (let i = 0; i < STUFEN.length; i++) if (kruemel >= STUFEN[i].ab) idx = i
  const jetzt   = STUFEN[idx]
  const naechst = STUFEN[idx + 1] ?? null
  const anteil  = naechst
    ? (kruemel - jetzt.ab) / (naechst.ab - jetzt.ab)
    : 1
  return { stufe: jetzt, naechste: naechst, anteil: Math.max(0, Math.min(1, anteil)), index: idx }
}
