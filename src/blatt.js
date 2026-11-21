// Arbeitsblatt (zum Drucken) und Eingabe-Seite für Lösungen vom Papier.
// Beide Seiten lesen dieselbe feste Anordnung (Buchstaben, Nummern, Reihenfolge),
// sonst würde «B» auf dem Blatt etwas anderes bedeuten als in der Eingabe.
import { symEl } from './symbole.js'
import { h, kopieren, kopierenMitKi } from './dom.js'
import { fnv, nz, cmp, num, solText, TNAME, itemKey, frageText, promptErklaere, promptFehlerErklaerung, fehlerKnopfText, fehlerPortion, FEHLER_PORTION, promptFehlerset, stichCheck, ohneKopf } from './format.js'
import { bewerte, gradeAus } from './fortschritt.js'
import { tabelleEl } from './typen.js'
import { zeichnungEl, bildText } from './zeichnung.js'
import { kreuzLayout, kreuzEl, kreuzBewerte, kreuzLoesung, ktEl, ktBewerte, ktLoesung, ktGegeben } from './kreuz.js'

const BUCH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const L = i => BUCH[i] || String(i + 1)

/** Immer gleiche Mischung für dieselbe Aufgabe. */
function mische(n, key, nichtIdentisch) {
  let s = fnv(String(key)) >>> 0
  const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  const p = [...Array(n).keys()]
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]] }
  if (nichtIdentisch && n > 1 && p.every((v, i) => v === i)) p.push(p.shift())
  return p
}

/** Feste Anordnung einer Aufgabe: was gedruckt wird und was richtig ist. */
export function anordnung(it) {
  const key = it.id || it.frage || it.text || it.satz
  switch (it.t) {
    case 'mc': {
      const p = mische(it.optionen.length, key)
      return { opts: p.map(i => it.optionen[i]), richtig: p.indexOf(it.richtig) }
    }
    case 'zuordnen': {
      const p = mische(it.paare.length, key, true)
      return { links: it.paare.map(x => x[0]), rechts: p.map(i => it.paare[i][1]), richtig: it.paare.map((_, i) => p.indexOf(i)) }
    }
    case 'reihenfolgen': {
      const p = mische(it.schritte.length, key, true)
      return { schritte: p.map(i => it.schritte[i]), richtig: it.schritte.map((_, k) => p.indexOf(k)) }
    }
    case 'ordnen': {
      const w = [...it.satz.split(/\s+/).filter(Boolean), ...it.ablenker]
      return { woerter: mische(w.length, key, true).map(i => w[i]) }
    }
    case 'wortbanken': {
      const w = [...it.antworten, ...it.ablenker]
      return { bank: mische(w.length, key).map(i => w[i]) }
    }
    case 'richtigfalsch': {
      const bg = it.begruendungen || []
      const p = mische(bg.length, key)
      return { begr: p.map(i => bg[i]) }
    }
  }
  return {}
}

const lueckeEl = (i, v, kurz) => {
  if (!v) return h('span', { class: 'bl-luecke' }, '(' + (i + 1) + ')')
  const inp = h('input', { class: 'inl bl-inl' + (kurz ? ' kurz' : ''), autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Lücke ' + (i + 1), oninput: e => { v.t[i] = e.target.value } })
  return inp
}
const luecken = text => String(text).split(/_{2,}/)
const SELBST = it => (it.t === 'kurzantworten' && !(it.stichwoerter || []).length) || it.t === 'karte'

function frage(it) {
  return it.t === 'karte' ? it.front : it.t === 'richtigfalsch' ? it.aussage : it.t === 'zuordnen' ? (it.anweisung || 'Ordne zu.')
    : it.t === 'ordnen' ? (it.hinweis || 'Bringe die Wörter in die richtige Reihenfolge.') : it.t === 'fehlersuche' ? 'Suche den Fehler im Satz.' : (it.frage || it.text || '')
}

// ── Arbeitsblatt ─────────────────────────────────────────────────────────────

const linie = (br = '100%') => h('span', { class: 'bl-linie', style: 'width:' + br })

function blattAufgabe(it, nr, mitLoesung, v) {
  const a = anordnung(it)
  const k = []
  k.push(h('div', { class: 'bl-frage' }, h('b', null, nr + '. '), it.t === 'luecke' || it.t === 'wortbanken' ? '' : frage(it)))
  const f = k[0]
  if (it.zeichnung) k.push(zeichnungEl(it.zeichnung))
  if (it.tabelle && it.t !== 'karte' && it.t !== 'tabelle') k.push(tabelleEl(it.tabelle))
  switch (it.t) {
    case 'tabelle': {
      let n = 0
      k.push(tabelleEl(it.tabelle, c => { const ps = luecken(c); if (ps.length === 1) return c; const sp = h('span'); ps.forEach((p, i, all) => { sp.append(p); if (i < all.length - 1) sp.append(lueckeEl(n++, v)) }); return sp }))
      break
    }
    case 'kreuztabelle': k.push(ktEl(it, v ? { eingabe: true, onToggle: (key, on) => { if (on) v.k[key] = true; else delete v.k[key] } } : {})); break
    case 'kreuzwort': {
      k.push(kreuzEl(kreuzLayout(it.woerter), v ? { eingabe: true, onInput: (x, y, val) => { v.g[x + ',' + y] = val } } : {}))
      break
    }
    case 'karte': k.push(linie(), linie()); break
    case 'mc': a.opts.forEach((o, i) => k.push(h('div', { class: 'bl-opt' }, h('b', null, L(i) + ')'), ' ' + o))); k.push(h('div', { class: 'bl-ant' }, 'Antwort: ', linie('3em'))); break
    case 'luecke': luecken(it.text).forEach((p, i, all) => { f.append(p); if (i < all.length - 1) f.append(lueckeEl(i, v, String(it.antworten?.[i] || '').length <= 4)) }); break
    case 'wortbanken': {
      luecken(it.text).forEach((p, i, all) => { f.append(p); if (i < all.length - 1) f.append(lueckeEl(i, v)) })
      k.push(h('div', { class: 'bl-bank' }, a.bank.join('  ·  '))); break
    }
    case 'zuordnen':
      k.push(h('div', { class: 'bl-zwei' },
        h('div', null, ...a.links.map((x, i) => h('div', { class: 'bl-opt' }, h('b', null, (i + 1) + ' '), x))),
        h('div', null, ...a.rechts.map((x, i) => h('div', { class: 'bl-opt' }, h('b', null, L(i) + ' '), x)))),
        h('div', { class: 'bl-ant' }, 'Lösung: ', ...a.links.map((_, i) => h('span', { style: 'margin-right:14px' }, (i + 1) + ' – ', linie('1.6em'))))); break
    case 'ordnen':
      k.push(h('div', { class: 'bl-bank' }, a.woerter.join('  ·  ')), linie(), linie()); break
    case 'reihenfolgen':
      a.schritte.forEach((s, i) => k.push(h('div', { class: 'bl-opt' }, h('b', null, L(i) + ') '), s)))
      k.push(h('div', { class: 'bl-ant' }, 'Richtige Reihenfolge: ', ...a.schritte.map(() => h('span', { style: 'margin-right:8px' }, linie('1.6em'))))); break
    case 'richtigfalsch':
      k.push(h('div', { class: 'bl-ant' }, '☐ richtig     ☐ falsch'))
      if (a.begr.length) { k.push(h('div', { class: 'bl-lbl' }, 'Welche Begründung passt?')); a.begr.forEach((b, i) => k.push(h('div', { class: 'bl-opt' }, h('b', null, L(i) + ') '), b.text))); k.push(h('div', { class: 'bl-ant' }, 'Begründung: ', linie('3em'))) } break
    case 'fehlersuche':
      f.append(h('div', { class: 'bl-satz' }, it.satz))
      k.push(h('div', { class: 'bl-ant' }, 'Falsches Wort: ', linie('9em'), '   Richtig: ', linie('9em')), h('div', { class: 'bl-ant' }, '☐ kein Fehler')); break
    case 'kurzantworten': for (let i = 0; i < (it.zeilen || 3); i++) k.push(linie()); break
    case 'zahlen': k.push(h('div', { class: 'bl-ant' }, 'Antwort: ', linie('5em'), ' ' + (it.einheit || ''))); break
    default: k.push(h('div', null, '(Aufgabentyp nicht druckbar)'))
  }
  k.slice(1).forEach(el => { if (el.className === 'bl-ant' || el.className === 'bl-linie') el.classList.add('nur-druck') })
  if (mitLoesung) k.push(h('div', { class: 'bl-loes' }, 'Lösung: ' + loesungsText(it, a)))
  return h('div', { class: 'bl-item' }, ...k)
}

function loesungsText(it, a) {
  switch (it.t) {
    case 'mc': return L(a.richtig) + ') ' + it.optionen[it.richtig]
    case 'zuordnen': return a.richtig.map((j, i) => (i + 1) + '–' + L(j)).join('   ')
    case 'reihenfolgen': return a.richtig.map(L).join(' ')
    case 'richtigfalsch': { const j = a.begr.findIndex(b => b.richtig); return (it.richtig ? 'richtig' : 'falsch') + (j >= 0 ? ', Begründung ' + L(j) : '') }
    case 'kreuzwort': return kreuzLoesung(kreuzLayout(it.woerter))
    default: return solText(it)
  }
}

function infoBlock(it) {
  return h('div', { class: 'bl-info' }, it.titel ? h('div', { class: 'bl-info-t' }, it.titel) : null, it.text ? h('div', null, it.text) : null, it.zeichnung ? zeichnungEl(it.zeichnung) : null, it.tabelle ? tabelleEl(it.tabelle) : null)
}

/** Reihenfolge des Blatts: Abschnitte (info) und die Aufgaben des Decks, gleiche Nummern wie in der Eingabe. */
function blattFolge(deck) {
  const roh = deck.set?.items
  if (!roh) return deck.cards.map(c => ({ card: c }))
  const byId = new Map(deck.cards.map(c => [c.id, c]))
  const gebraucht = new Set(), folge = []
  for (const it of roh) {
    if (it.t === 'info') { const ohne = ohneKopf(it); if (ohne) folge.push({ info: ohne }); continue } // ältere Sets: Blattkopf (Name, Klasse, Datum) nicht zeigen
    const id = itemKey(it), c = byId.get(id)
    if (c && !gebraucht.has(id)) { gebraucht.add(id); folge.push({ card: c }) }
  }
  return folge
}

// ── Eingabe ──────────────────────────────────────────────────────────────────

/** Bewertet eine Eingabe. `v` ist je Typ ein anderes Objekt (siehe Formular). */
function pruefe(it, a, v) {
  const R = (r, given) => ({ r, given, correct: solText(it) })
  switch (it.t) {
    case 'mc': return R(v.wahl === a.richtig ? 'richtig' : 'falsch', v.wahl != null ? L(v.wahl) : '–')
    case 'tabelle': case 'luecke': { const rs = it.antworten.map((x, i) => cmp(v.t[i] || '', x)); return R(rs.every(x => x === 'richtig') ? 'richtig' : rs.every(x => x !== 'falsch') ? 'beinahe' : 'falsch', v.t.join(' / ')) }
    case 'wortbanken': { const n = it.antworten.filter((x, i) => nz(v.t[i] || '') === nz(x)).length; return R(n === it.antworten.length ? 'richtig' : n > 0 ? 'beinahe' : 'falsch', v.t.join(' / ')) }
    case 'zuordnen': { const n = a.richtig.filter((j, i) => v.s[i] === j).length; return R(n === a.richtig.length ? 'richtig' : n >= a.richtig.length / 2 ? 'beinahe' : 'falsch', v.s.map((j, i) => (i + 1) + '–' + (j >= 0 && j != null ? L(j) : '?')).join(' ')) }
    case 'ordnen': return R([it.satz, ...it.varianten].some(s => nz(s) === nz(v.text || '')) ? 'richtig' : 'falsch', v.text || '')
    case 'reihenfolgen': { const g = (v.text || '').toUpperCase().replace(/[^A-Z]/g, ''); return R(g === a.richtig.map(L).join('') ? 'richtig' : 'falsch', g.split('').join(' ')) }
    case 'richtigfalsch': {
      if (v.rf == null) return R('falsch', '–')
      const ok = v.rf === it.richtig
      if (!ok || !a.begr.length) return R(ok ? 'richtig' : 'falsch', v.rf ? 'richtig' : 'falsch')
      const b = a.begr[v.b]
      return R(b && b.richtig ? 'richtig' : 'beinahe', 'richtig' + (b ? ' (' + b.text + ')' : ''))
    }
    case 'fehlersuche': {
      if (it.fehlerfrei) return R(v.kein ? 'richtig' : 'falsch', v.kein ? 'kein Fehler' : (v.wort || '–'))
      if (v.kein || nz(v.wort || '') !== nz(it.fehlerwort)) return R('falsch', v.kein ? 'kein Fehler' : (v.wort || '–'))
      return R(cmp(v.korr || '', it.korrektur) === 'richtig' ? 'richtig' : 'beinahe', v.wort + ' → ' + (v.korr || ''))
    }
    case 'kreuztabelle': { const q = ktBewerte(it, v.k || {}); return R(q.r, ktGegeben(it, v.k || {})) }
    case 'kreuzwort': { const L = kreuzLayout(it.woerter), q = kreuzBewerte(L, v.g || {}); return R(q.ok === q.total ? 'richtig' : q.ok >= q.total / 2 ? 'beinahe' : 'falsch', q.ok + ' von ' + q.total + ' Wörtern') }
    case 'kurzantworten': { const sc = stichCheck(it, v.text || ''); return { ...R(sc.r, v.text || '–'), fehlt: sc.fehlt, kriterien: it.kriterien } }
    case 'zahlen': { const x = num(v.text || ''); return R(!isNaN(x) && Math.abs(x - it.antwort) <= it.toleranz + 1e-9 ? 'richtig' : 'falsch', (v.text || '–') + ' ' + (it.einheit || '')) }
  }
  return R('falsch', '–')
}

function feld(it, a, v) {
  const inp = (cls, onin, ph) => h('input', { class: 'in ' + (cls || ''), placeholder: ph || '', autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false', oninput: e => onin(e.target.value) })
  const wahl = (n, cur, set, namen) => h('div', { class: 'bl-wahl' }, ...[...Array(n).keys()].map(i => {
    const b = h('button', { class: 'chip' + (cur() === i ? ' sel' : ''), onclick: () => { set(i); b.parentNode.querySelectorAll('.chip').forEach((c, j) => c.classList.toggle('sel', j === i)) } }, namen ? namen(i) : L(i))
    return b
  }))
  switch (it.t) {
    case 'mc': return wahl(a.opts.length, () => v.wahl, i => { v.wahl = i })
    case 'tabelle': case 'luecke': case 'wortbanken': v.t = it.antworten.map(() => ''); return h('div', { class: 'stack' }, ...it.antworten.map((_, i) => inp('', x => { v.t[i] = x }, '(' + (i + 1) + ')')))
    case 'zuordnen': v.s = a.links.map(() => null); return h('div', { class: 'stack' }, ...a.links.map((l, i) => h('div', null, h('div', { class: 'lbl' }, (i + 1) + ' ' + l), wahl(a.rechts.length, () => v.s[i], j => { v.s[i] = j }))))
    case 'ordnen': return inp('', x => { v.text = x }, 'Ganzer Satz')
    case 'reihenfolgen': return inp('', x => { v.text = x }, 'Buchstaben, z. B. B C A')
    case 'zahlen': return h('div', { style: 'display:flex;gap:8px;align-items:center' }, inp('', x => { v.text = x }, 'Zahl'), h('b', null, it.einheit || ''))
    case 'richtigfalsch': {
      const els = [wahl(2, () => (v.rf == null ? null : v.rf ? 0 : 1), i => { v.rf = i === 0 }, i => (i === 0 ? 'richtig' : 'falsch'))]
      if (a.begr.length) els.push(h('div', { class: 'lbl', style: 'margin-top:6px' }, 'Begründung'), wahl(a.begr.length, () => v.b, i => { v.b = i }))
      return h('div', { class: 'stack' }, ...els)
    }
    case 'fehlersuche': {
      const cb = h('input', { type: 'checkbox', onchange: () => { v.kein = cb.checked } })
      return h('div', { class: 'stack' }, inp('', x => { v.wort = x }, 'Falsches Wort'), inp('', x => { v.korr = x }, 'Richtig heisst'), h('label', { class: 'crit' }, cb, 'kein Fehler'))
    }
    case 'kurzantworten': if ((it.stichwoerter || []).length) return h('textarea', { class: 'in', style: 'min-height:' + (28 * (it.zeilen || 3)) + 'px', placeholder: 'Deine Antwort …', oninput: e => { v.text = e.target.value } })
    case 'karte': return h('div', { style: 'font-size:13px;font-weight:600;color:var(--text-2)' }, 'Selbstkontrolle: die Musterantwort kommt nach dem Abgeben.')
  }
  return h('div', null, 'nicht unterstützt')
}

const anordnungLoes = c => loesungsText(c, anordnung(c))


// ── Das Set als Blatt: Arbeitsblatt-Modus oder Test-Modus ───────────────────

const RANG = { richtig: 1, beinahe: 0.5, falsch: 0 }

export function renderSatz(root, deck, hooks) {
  const ctx = { fach: deck.fach || 'Deutsch', klasse: deck.klasse || '7' }
  const folge = blattFolge(deck)
  const cards = folge.filter(f => f.card).map(f => f.card)
  const S = { modus: 'test', res: new Map(), gebucht: new Set(), kruemel: 0, bonus: null, abgegeben: false }
  const werte = new Map()
  const seite = h('div', { class: 'bl-seite' })
  const modusLeiste = h('div', { class: 'bl-modus no-print' })
  const werkzeug = h('div', { class: 'bl-tools no-print' })
  const unten = h('div', { class: 'no-print', style: 'padding:0 20px 28px;display:flex;flex-direction:column;gap:10px' })
  const screen = h('div', { class: 'screen nv blatt' },
    h('div', { class: 'top no-print' }, h('button', { class: 'x', 'aria-label': 'Zurück', onclick: () => hooks.zurueck() }, '←'), h('span', null, deck.name)),
    S.modus === 'blatt' ? null : null,
    modusLeiste, werkzeug, seite, unten)
  root.replaceChildren(screen)

  const buche = (c, r) => {
    if (S.gebucht.has(c.id) || !r.r) return
    S.gebucht.add(c.id)
    S.kruemel += bewerte(deck.name, c.id, gradeAus(r.r)).kruemel
    S.bonus = hooks.abschluss() || S.bonus
  }

  function feedback(c, fb, r, itemNode) {
    fb.replaceChildren()
    if (r.selbst) {
      fb.append(h('div', { class: 'fb near' }, h('span', null, '≈'), h('div', null, h('b', null, 'Musterantwort'), h('div', null, r.correct),
        ...(c.kriterien || []).map(k => h('div', { style: 'font-weight:600' }, '· ' + k)))),
        h('div', { class: 'bl-wahl' }, ...[['richtig', '✓ Gewusst'], ['beinahe', '~ Teilweise'], ['falsch', '✕ Nicht']].map(([v, t]) => {
          const b = h('button', { class: 'chip' + (r.r === v ? ' sel' : ''), onclick: () => { r.r = v; buche(c, r); b.parentNode.querySelectorAll('.chip').forEach(x => x.classList.toggle('sel', x === b)); zusammenfassung() } }, t); return b })))
      return
    }
    const ok = r.r === 'richtig', nea = r.r === 'beinahe'
    fb.append(h('div', { class: 'fb ' + (ok ? 'ok' : nea ? 'near' : 'no') }, h('span', null, ok ? '✓' : nea ? '~' : '✕'),
      h('div', null, h('b', null, ok ? 'Richtig.' : nea ? 'Beinahe.' : 'Falsch.'),
        !ok && r.given && r.given !== '–' ? h('div', null, 'Deine Antwort: ' + r.given) : null,
        !ok ? h('div', null, (c.t === 'kurzantworten' ? 'Mustersatz: ' : 'Richtig: ') + loesungsText(c, anordnung(c))) : null,
        r.fehlt?.length ? h('div', null, 'In deiner Antwort fehlt: ' + r.fehlt.join(', ')) : null,
        !ok && r.kriterien?.length ? h('div', { style: 'font-weight:600' }, r.kriterien.map(k => '· ' + k).join('  ')) : null,
        c.erklaerung ? h('div', { style: 'margin-top:4px;font-weight:600' }, c.erklaerung) : null)))
    if (!ok) {
      const eb = h('button', { class: 'btn ghost zwei-zeilen', onclick: () => kopierenMitKi(promptErklaere(c, r.given, ctx), eb) }, 'Erkläre mir das\n(Auftrag kopieren)')
      fb.append(eb)
    }
    if (S.modus === 'blatt' && itemNode) fb.append(h('button', { class: 'lnk', onclick: () => { S.res.delete(c.id); itemNode.replaceWith(itemBau(c, itemNode.dataset.nr)); zusammenfassung() } }, 'Nochmal versuchen'))
  }

  function pruefeItem(c, fb, itemNode) {
    const a = anordnung(c)
    const r = SELBST(c) ? { selbst: true, r: S.res.get(c.id)?.r || null, correct: solText(c) } : pruefe(c, a, werte.get(c.id))
    S.res.set(c.id, r)
    if (!SELBST(c)) buche(c, r)
    feedback(c, fb, r, itemNode)
    zusammenfassung()
  }

  const INLINE = new Set(['luecke', 'wortbanken', 'tabelle', 'kreuztabelle', 'kreuzwort'])
  function itemBau(c, nr) {
    const a = anordnung(c), v = {}
    werte.set(c.id, v)
    const test = S.modus === 'test'
    if (test) { v.t = (c.antworten || []).map(() => ''); v.k = {}; v.g = {} }
    const node = blattAufgabe(c, nr, true, test ? v : null)
    node.dataset.nr = nr
    if (!test) return node
    const fb = h('div', { class: 'stack no-print', style: 'margin-top:8px' })
    if (!INLINE.has(c.t)) node.append(h('div', { class: 'bl-eingabe no-print' }, feld(c, a, v)))
    node.append(fb)
    node._fb = fb
    return node
  }

  const EKEY = 'zk:erg:' + fnv(deck.name)
  const letztes = () => { try { return JSON.parse(localStorage.getItem(EKEY) || 'null') } catch { return null } }
  // ── Entwurf: Eingaben laufend merken, damit ein halb gelöstes Blatt nach Zurück, Neuladen oder einem Anruf noch da ist. ──
  // Gemerkt wird, was in den Feldern steht (nicht die Auswertung). Nach «Auswerten» und «Neu beginnen» wird der Entwurf gelöscht.
  const DKEY = 'zk:entw:' + fnv(deck.name)
  const eingabeNodes = () => [...seite.querySelectorAll('.bl-item')].filter(n => n._fb)
  const felder = n => [...n.querySelectorAll('input:not([type=checkbox]), textarea')]
  const haken = n => [...n.querySelectorAll('input[type=checkbox]')]
  const chips = n => [...n.querySelectorAll('.bl-eingabe .chip')]
  let entwurfTimer = null, entwurfLaedt = false
  const entwurfWeg = () => { clearTimeout(entwurfTimer); try { localStorage.removeItem(DKEY) } catch {} }
  function entwurfSichern() {
    if (S.abgegeben || entwurfLaedt) return
    const d = eingabeNodes().map(n => ({ f: felder(n).map(e => e.value), h: haken(n).map(e => e.checked), c: chips(n).map((e, i) => (e.classList.contains('sel') ? i : -1)).filter(i => i >= 0) }))
    const leerAlles = d.every(x => x.f.every(w => !w) && !x.h.some(Boolean) && !x.c.length)
    try { if (leerAlles) localStorage.removeItem(DKEY); else localStorage.setItem(DKEY, JSON.stringify({ t: Date.now(), d })) } catch {}
  }
  const entwurfBald = () => { if (S.abgegeben || entwurfLaedt) return; clearTimeout(entwurfTimer); entwurfTimer = setTimeout(entwurfSichern, 300) }
  for (const ev of ['input', 'change', 'click']) seite.addEventListener(ev, entwurfBald)
  /** @returns {boolean} ob etwas zurückgeholt wurde */
  function entwurfLaden() {
    let e = null
    try { e = JSON.parse(localStorage.getItem(DKEY) || 'null') } catch {}
    if (!e || !Array.isArray(e.d)) return false
    let n = 0
    entwurfLaedt = true
    try {
      eingabeNodes().forEach((node, i) => {
        const d = e.d[i]; if (!d) return
        felder(node).forEach((el, j) => { const w = d.f?.[j]; if (w) { el.value = w; el.dispatchEvent(new Event('input', { bubbles: true })); n++ } })
        haken(node).forEach((el, j) => { if (d.h?.[j]) { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); n++ } })
        const cs = chips(node); (d.c || []).forEach(j => { if (cs[j]) { cs[j].click(); n++ } })
      })
    } finally { entwurfLaedt = false }
    document.activeElement?.blur?.() // das Kreuzworträtsel springt beim Füllen von Feld zu Feld
    return n > 0
  }

  function zeichne(neu) {
    if (neu) entwurfWeg()
    S.res = new Map(); S.gebucht = new Set(); S.kruemel = 0; S.bonus = null; S.abgegeben = false; S.gespeichert = false
    seite.classList.remove('abgegeben', 'zeige-loes')
    let nr = 0
    seite.replaceChildren(
      h('h1', { class: 'bl-titel' }, deck.name),
      ...folge.map(f => (f.info ? infoBlock(f.info) : itemBau(f.card, ++nr))))
    let lnr = 0
    seite.append(h('div', { class: 'bl-loesblatt nur-druck' }, h('h1', { class: 'bl-titel' }, 'Lösungen: ' + deck.name),
      ...cards.map(c => h('div', { class: 'bl-lz' }, h('b', null, (++lnr) + '. '), loesungsText(c, anordnung(c)), c.zeichnung?.abbildung ? zeichnungEl(c.zeichnung, { loesung: true }) : null))))
    modusLeiste.replaceChildren(
      h('button', { class: 'bl-seg', onclick: () => hooks.ueben() }, symEl('ueben'), 'Üben'),
      h('button', { class: 'bl-seg on' }, symEl('blatt'), 'Blatt'))
    const lcb = h('input', { type: 'checkbox', onchange: () => seite.classList.toggle('zeige-loes', lcb.checked) })
    const druck = mit => { seite.classList.toggle('mit-loesblatt', mit); window.print() }
    const letzt = letztes()
    werkzeug.replaceChildren(
      h('button', { class: 'lnk', onclick: () => druck(false) }, symEl('drucken'), 'Drucken'),
      h('button', { class: 'lnk', onclick: () => druck(true) }, symEl('drucken'), 'Mit Lösungsblatt'),
      h('label', { class: 'crit', style: 'padding:0;font-size:15px' }, lcb, 'Lösungen anzeigen'),
      h('button', { class: 'lnk', onclick: () => zeichne(true) }, symEl('wiederholen'), 'Neu beginnen'),
      letzt ? h('div', { style: 'flex-basis:100%;font-size:13px;font-weight:700;color:var(--text-2)' }, 'Letztes Mal: ' + letzt.p + ' von ' + letzt.max + ' Punkten (' + letzt.d + ')') : null)
    if (!neu && entwurfLaden()) werkzeug.append(h('div', { class: 'fb ok', style: 'flex-basis:100%;margin:0' }, h('span', null, '✓'), h('div', null, 'Deine Eingaben von vorhin sind wieder da. Mit «Neu beginnen» leerst du das Blatt.')))
    zusammenfassung()
  }

  function alle() {
    cards.forEach(c => {
      if (S.res.has(c.id) && !SELBST(c)) return
      pruefeItem(c, cardNode(c)._fb, cardNode(c))
    })
    S.abgegeben = true
    entwurfWeg() // ausgewertet: das Ergebnis ist gespeichert, der Entwurf wird nicht mehr gebraucht
    if (S.modus === 'test') seite.classList.add('abgegeben')
    zusammenfassung()
  }
  const cardNode = c => { const i = cards.indexOf(c); return [...seite.querySelectorAll('.bl-item')].filter(n => n._fb)[i] }

  const gewicht = c => c.t === 'kreuzwort' ? 3 : c.t === 'kreuztabelle' ? 2 : (c.t === 'luecke' || c.t === 'wortbanken' || c.t === 'tabelle') && (c.antworten || []).length >= 4 ? 2 : 1
  const leer = c => { const v = werte.get(c.id) || {}; return !Object.values(v).some(x => x != null && (typeof x === 'object' ? Object.values(x).some(y => y !== '' && y != null && !(Array.isArray(y) && !y.length)) : x !== '')) }
  function zusammenfassung() {
    unten.replaceChildren()
    if (!S.abgegeben) {
      if (S.modus === 'test') {
        const ab = h('button', { class: 'btn', onclick: () => {
          const n = cards.filter(leer).length
          if (n && !ab.dataset.sicher) { ab.dataset.sicher = '1'; ab.textContent = n + (n === 1 ? ' Aufgabe ist' : ' Aufgaben sind') + ' noch leer. Trotzdem auswerten?'; return }
          alle()
        } }, 'Auswerten')
        unten.append(ab)
      }
      const f = hooks.faellig ? hooks.faellig() : 0
      if (S.modus === 'blatt') unten.append(h('div', { style: 'font-size:13px;font-weight:600;color:var(--text-2);text-align:center' }, 'Zum Ausdrucken oder Abschreiben. Am Bildschirm lösen: «Üben» oder «Test».'))
      return
    }
    const pts = cards.reduce((n, c) => n + gewicht(c) * (RANG[S.res.get(c.id)?.r] || 0), 0)
    const max = cards.reduce((n, c) => n + gewicht(c), 0)
    const offen = cards.filter(c => SELBST(c) && !S.res.get(c.id)?.r).length
    const note = Math.round((5 * pts / max + 1) * 2) / 2
    if (!S.gespeichert && !offen) { S.gespeichert = true; try { localStorage.setItem(EKEY, JSON.stringify({ p: pts, max, d: new Date().toLocaleDateString('de-CH', { day: 'numeric', month: 'numeric' }) })) } catch {} }
    const noteBox = h('div')
    const nb = h('button', { class: 'btn ghost', style: 'height:44px', onclick: () => {
      nb.hidden = true
      noteBox.append(h('div', { style: 'text-align:center' }, h('div', { class: 'serif', style: 'font-size:28px;font-weight:600' }, 'Note ' + note.toFixed(1)),
        h('div', { style: 'font-size:13px;font-weight:600;color:var(--text-2)' }, 'Eine Schätzung: Punkte ÷ ' + max + ' × 5 + 1, auf halbe Noten gerundet.')))
    } }, 'Note berechnen')
    unten.append(h('div', { style: 'text-align:center' },
      h('div', { class: 'serif', style: 'font-size:26px;font-weight:600' }, pts.toLocaleString('de-CH') + ' von ' + max + ' Punkten'),
      h('div', { style: 'font-size:15px;font-weight:700;color:var(--text-2)' }, Math.round(pts / max * 100) + '% richtig'),
      offen ? h('div', { style: 'font-size:15px;font-weight:600' }, offen + ' Selbstkontrolle(n) noch offen: bewerte dich oben.') : null,
      S.kruemel + (S.bonus?.bonus || 0) > 0 ? h('div', { style: 'font-size:18px;font-weight:800;color:var(--accent-h)' }, '+' + (S.kruemel + (S.bonus?.bonus || 0)) + ' Krümel') : null,
      S.bonus?.neueMarke ? h('div', { class: 'serie-chip' }, '🔥 ' + S.bonus.neueMarke + ' Tage in Folge') : null), nb, noteBox)
    const fehler = cards.map(c => ({ c, r: S.res.get(c.id) })).filter(x => x.r && x.r.r !== 'richtig')
    if (fehler.length) {
      const zeilen = fehler.map(x => 'Aufgabe: ' + frageText(x.c) + '\n   Seine Antwort: ' + (x.r.selbst ? '(Selbstkontrolle: ' + (x.r.r === 'beinahe' ? 'nur teilweise gewusst' : x.r.r ? 'nicht gewusst' : 'nicht bewertet') + ')' : (!x.r.given || x.r.given === '–' ? '(keine)' : x.r.given)) + '\n   Richtig: ' + solText(x.c))
      const proto = zeilen.map((z, i) => (i + 1) + '. ' + z).join('\n') // ganzes Protokoll fürs Übungsset
      let ab = 0
      const eb = h('button', { class: 'btn ghost zwei-zeilen', onclick: () => {
        if (ab >= zeilen.length) ab = 0
        kopierenMitKi(promptFehlerErklaerung(deck.name, fehlerPortion(zeilen, ab), ctx), eb)
        ab += FEHLER_PORTION
        if (zeilen.length > FEHLER_PORTION) setTimeout(() => { if (eb.isConnected) eb.textContent = fehlerKnopfText(ab, zeilen.length) }, 1900)
      } }, fehlerKnopfText(0, zeilen.length))
      unten.append(eb, h('button', { class: 'btn ghost', onclick: () => hooks.folge(promptFehlerset(proto, ctx), { titel: deck.name, fach: deck.fach, klasse: deck.klasse }) }, 'Übungsset zu den Fehlern erstellen'))
    }
    unten.append(h('button', { class: 'btn ghost', onclick: () => zeichne(true) }, 'Neu beginnen'))
  }

  zeichne()
}
