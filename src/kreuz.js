// Kreuzworträtsel (automatische Anordnung) und Kreuztabellen: reine Hilfsfunktionen und DOM-Bausteine.
import { h } from './dom.js'

export function kwNorm(s) {
  return String(s || '').toUpperCase().replace(/Ä/g, 'AE').replace(/Ö/g, 'OE').replace(/Ü/g, 'UE').replace(/ß/g, 'SS')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z]/g, '')
}

const cache = new WeakMap()

/** Ordnet die Wörter zu einem Gitter an. Immer dasselbe Ergebnis für dieselben Wörter. */
export function kreuzLayout(woerter) {
  if (cache.has(woerter)) return cache.get(woerter)
  const ws = woerter.map((o, i) => ({ i, wort: kwNorm(o.wort), hinweis: o.hinweis || '', orig: o.wort })).filter(w => w.wort.length >= 2)
  const order = [...ws].sort((a, b) => b.wort.length - a.wort.length || a.i - b.i)
  const grid = new Map(), placed = []
  const get = (x, y) => grid.get(x + ',' + y)
  const fits = (w, x, y, d) => {
    const dx = d ? 0 : 1, dy = d ? 1 : 0
    if (get(x - dx, y - dy) || get(x + dx * w.length, y + dy * w.length)) return -1
    let cross = 0
    for (let k = 0; k < w.length; k++) {
      const cx = x + dx * k, cy = y + dy * k, g = get(cx, cy)
      if (g) { if (g !== w[k]) return -1; cross++ }
      else if (get(cx + dy, cy + dx) || get(cx - dy, cy - dx)) return -1
    }
    return cross
  }
  const put = (w, x, y, d) => {
    const dx = d ? 0 : 1, dy = d ? 1 : 0
    for (let k = 0; k < w.wort.length; k++) grid.set((x + dx * k) + ',' + (y + dy * k), w.wort[k])
    placed.push({ ...w, x, y, dir: d ? 'd' : 'a' })
  }
  const bbox = (extra) => {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9
    const f = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
    for (const k of grid.keys()) { const [x, y] = k.split(',').map(Number); f(x, y) }
    if (extra) { f(extra[0], extra[1]); f(extra[2], extra[3]) }
    return [x1 - x0 + 1, y1 - y0 + 1]
  }
  const rest = []
  order.forEach((w, n) => {
    if (n === 0) { put(w, 0, 0, 0); return }
    let best = null
    for (const [k, ch] of grid) {
      const [cx, cy] = k.split(',').map(Number)
      for (let j = 0; j < w.wort.length; j++) if (w.wort[j] === ch) for (const d of [0, 1]) {
        const x = d ? cx : cx - j, y = d ? cy - j : cy
        const c = fits(w.wort, x, y, d)
        if (c < 1) continue
        const [bw, bh] = bbox([x, y, d ? x : x + w.wort.length - 1, d ? y + w.wort.length - 1 : y])
        const score = c * 100 - bw * bh - Math.abs(bw - bh) * 2
        if (!best || score > best.score) best = { score, x, y, d }
      }
    }
    if (best) put(w, best.x, best.y, best.d); else rest.push(w)
  })
  for (const w of rest) { // zweiter Versuch, falls inzwischen eine Kreuzung möglich ist
    let best = null
    for (const [k, ch] of grid) {
      const [cx, cy] = k.split(',').map(Number)
      for (let j = 0; j < w.wort.length; j++) if (w.wort[j] === ch) for (const d of [0, 1]) {
        const x = d ? cx : cx - j, y = d ? cy - j : cy
        if (fits(w.wort, x, y, d) >= 1 && !best) best = { x, y, d }
      }
    }
    if (best) put(w, best.x, best.y, best.d)
  }
  const unplatziert = ws.filter(w => !placed.some(p => p.i === w.i))
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9
  for (const k of grid.keys()) { const [x, y] = k.split(',').map(Number); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
  const W = x1 - x0 + 1, H = y1 - y0 + 1
  const cells = Array.from({ length: H }, () => Array(W).fill(''))
  for (const [k, ch] of grid) { const [x, y] = k.split(',').map(Number); cells[y - y0][x - x0] = ch }
  const wl = placed.map(p => ({ ...p, x: p.x - x0, y: p.y - y0 })).sort((a, b) => a.y - b.y || a.x - b.x)
  const nrAt = new Map(); let n = 0
  for (const p of wl) { const k = p.x + ',' + p.y; if (!nrAt.has(k)) nrAt.set(k, ++n); p.nr = nrAt.get(k) }
  const L = { w: W, h: H, cells, woerter: wl, unplatziert, nrAt }
  cache.set(woerter, L)
  return L
}

const posOf = (p, k) => p.dir === 'a' ? [p.x + k, p.y] : [p.x, p.y + k]

/** g: Map "x,y" -> Buchstabe. Liefert {ok, total}. */
export function kreuzBewerte(L, g) {
  let ok = 0
  for (const p of L.woerter) {
    let alle = true
    for (let k = 0; k < p.wort.length; k++) { const [x, y] = posOf(p, k); if (kwNorm(g[x + ',' + y] || '') !== p.wort[k]) { alle = false; break } }
    if (alle) ok++
  }
  return { ok, total: L.woerter.length }
}

export const kreuzLoesung = L => L.woerter.map(p => p.nr + (p.dir === 'a' ? ' waagrecht: ' : ' senkrecht: ') + p.wort).join('; ')

export function kreuzEl(L, opt = {}) {
  const aktiv = h('div', { class: 'kw-aktiv no-print', hidden: true })
  const grid = h('div', { class: 'kw-grid', style: `grid-template-columns:repeat(${L.w},var(--kw,28px))` })
  for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
    const ch = L.cells[y][x]
    if (!ch) { grid.append(h('div', { class: 'kw-leer' })); continue }
    const nr = L.nrAt.get(x + ',' + y)
    const c = h('div', { class: 'kw-c' }, nr ? h('span', { class: 'kw-n' }, nr) : null)
    if (opt.eingabe) {
      const inp = h('input', { class: 'kw-in', maxlength: 1, autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', 'data-x': x, 'data-y': y })
      inp.addEventListener('input', () => {
        inp.value = inp.value.toUpperCase().slice(-1)
        opt.onInput && opt.onInput(x, y, inp.value)
        if (inp.value) {
          const q = sel => grid.querySelector(sel)
          const next = q(`input[data-x="${x + 1}"][data-y="${y}"]`) && L.woerter.some(p => p.dir === 'a' && p.y === y && x >= p.x && x < p.x + p.wort.length - 1)
            ? q(`input[data-x="${x + 1}"][data-y="${y}"]`) : L.woerter.some(p => p.dir === 'd' && p.x === x && y >= p.y && y < p.y + p.wort.length - 1) ? q(`input[data-x="${x}"][data-y="${y + 1}"]`) : null
          if (next) next.focus()
        }
      })
      inp.addEventListener('focus', () => {
        const t = L.woerter.filter(p => p.dir === 'a' ? p.y === y && x >= p.x && x < p.x + p.wort.length : p.x === x && y >= p.y && y < p.y + p.wort.length)
          .map(p => p.nr + (p.dir === 'a' ? ' → ' : ' ↓ ') + (p.hinweis || '')).join('   ')
        aktiv.textContent = t; aktiv.hidden = !t
      })
      c.append(inp)
    } else c.append(h('span', { class: 'kw-l' }, ch))
    grid.append(c)
  }
  const liste = d => L.woerter.filter(p => p.dir === d).map(p => h('div', { class: 'kw-h' }, h('b', null, p.nr + '. '), p.hinweis || '(ohne Hinweis)', ' ', h('span', { class: 'kw-len' }, '(' + p.wort.length + ')')))
  return h('div', { class: 'kw' },
    aktiv,
    h('div', { class: 'tbl-wrap' }, grid),
    h('div', { class: 'kw-hinw' },
      h('div', null, h('div', { class: 'bl-lbl' }, 'Waagrecht →'), ...liste('a')),
      h('div', null, h('div', { class: 'bl-lbl' }, 'Senkrecht ↓'), ...liste('d'))),
    L.unplatziert.length ? h('div', { class: 'kw-len' }, 'Nicht eingebaut: ' + L.unplatziert.map(w => w.orig).join(', ')) : null)
}

/* ---- Kreuztabelle: Zeilen × Spalten, Zutreffendes ankreuzen ---- */
export function ktBewerte(it, sel) {
  let tp = 0, fp = 0, soll = 0
  it.kreuze.forEach((cols, r) => { soll += cols.length; it.spalten.forEach((_, c) => { const s = !!sel[r + ',' + c], z = cols.includes(c); if (s && z) tp++; else if (s) fp++ }) })
  const score = soll ? (tp - fp) / soll : 0
  return { r: score >= 0.999 ? 'richtig' : score >= 0.5 ? 'beinahe' : 'falsch', tp, fp, soll }
}
export const ktLoesung = it => it.zeilen.map((z, r) => z + ': ' + (it.kreuze[r].map(c => it.spalten[c]).join(', ') || '–')).join('; ')
export const ktGegeben = (it, sel) => it.zeilen.map((z, r) => z + ': ' + (it.spalten.filter((_, c) => sel[r + ',' + c]).join(', ') || '–')).join('; ')

export function ktEl(it, opt = {}) {
  return h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl kt' },
    h('thead', null, h('tr', null, h('th', null, ''), ...it.spalten.map(s => h('th', { class: 'kt-s' }, s)))),
    h('tbody', null, ...it.zeilen.map((z, r) => h('tr', null, h('th', { class: 'kt-z' }, z),
      ...it.spalten.map((_, c) => {
        if (opt.eingabe) { const cb = h('input', { type: 'checkbox', class: 'kt-cb', onchange: () => opt.onToggle && opt.onToggle(r + ',' + c, cb.checked) }); return h('td', { class: 'kt-t' }, cb) }
        return h('td', { class: 'kt-t' }, it.kreuze[r].includes(c) ? h('span', { class: 'kt-x' }, '✕') : '')
      }))))))
}
