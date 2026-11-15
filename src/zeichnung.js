// Zeichnungen aus Daten: Die KI beschreibt, die App zeichnet.
// Arten: gitter (Koordinaten, Figuren, Abbildungen), diagramm, zahlenstrahl, zeitstrahl.
// Bei Abbildungen rechnet die App das Bild selbst; es erscheint nur mit der Lösung.

const NS = 'http://www.w3.org/2000/svg'
let clipNr = 0
const FARBE = { figur: '#b36a15', fuell: 'rgba(212,132,42,.22)', bild: '#1f6fbf', bildF: 'rgba(31,111,191,.18)', gitter: '#d9d4cc', achse: '#333', text: '#222' }

function s(tag, attrs, ...kids) {
  const e = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs || {})) if (v != null && v !== false) e.setAttribute(k, v)
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)))
  return e
}
const zahl = v => { const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.').replace('−', '-')); return isFinite(n) ? n : NaN }
const fmt = n => (Math.round(n * 1000) / 1000).toLocaleString('de-CH', { maximumFractionDigits: 3, useGrouping: false })
const str = v => (v == null ? '' : String(v)).trim()

// ── Normalisieren (Eingang aus der KI-Antwort) ────────────────────────────────

export function normZeichnung(z) {
  if (!z || typeof z !== 'object') return null
  const art = str(z.art || z.typ).toLowerCase()
  if (art === 'gitter' || art === 'koordinaten' || art === 'koordinatensystem') return normGitter(z)
  if (art === 'diagramm') return normDiagramm(z)
  if (art === 'zahlenstrahl') return normZahlenstrahl(z)
  if (art === 'zeitstrahl') return normZeitstrahl(z)
  return null
}

function normGitter(z) {
  let b = Array.isArray(z.bereich) ? z.bereich.map(zahl) : []
  if (b.length !== 4 || b.some(isNaN)) b = [-6, 6, -6, 6]
  let [x0, x1, y0, y1] = b.map(Math.round)
  if (x1 <= x0 || y1 <= y0) return null
  if (x1 - x0 > 30 || y1 - y0 > 30) return null
  const punkte = {}
  for (const [n, p] of Object.entries(z.punkte || {})) {
    const xy = Array.isArray(p) ? p.map(zahl) : [zahl(p?.x), zahl(p?.y)]
    if (xy.length >= 2 && !isNaN(xy[0]) && !isNaN(xy[1])) punkte[str(n)] = [xy[0], xy[1]]
  }
  const da = n => n in punkte
  const liste = v => (Array.isArray(v) ? v : []).map(a => (Array.isArray(a) ? a.map(str) : [])).filter(a => a.length && a.every(da))
  const g = { art: 'gitter', bereich: [x0, x1, y0, y1], punkte,
    vielecke: liste(z.vielecke).filter(a => a.length >= 3),
    strecken: liste(z.strecken).filter(a => a.length === 2),
    kreise: (Array.isArray(z.kreise) ? z.kreise : []).map(k => ({ m: str(k?.m || k?.mitte), r: zahl(k?.r) })).filter(k => da(k.m) && k.r > 0) }
  const a = z.abbildung
  if (a && typeof a === 'object') {
    const art = str(a.art).toLowerCase()
    const figur = (Array.isArray(a.figur) ? a.figur.map(str) : []).filter(da)
    if (figur.length) {
      if (art === 'drehung' && da(str(a.zentrum)) && !isNaN(zahl(a.winkel))) g.abbildung = { art, zentrum: str(a.zentrum), winkel: zahl(a.winkel), figur }
      else if (art === 'spiegelung' && Array.isArray(a.achse) && a.achse.length === 2 && a.achse.map(str).every(da)) g.abbildung = { art, achse: a.achse.map(str), figur }
      else if ((art === 'schiebung' || art === 'verschiebung') && Array.isArray(a.vektor) && a.vektor.length === 2 && a.vektor.map(zahl).every(n => !isNaN(n))) g.abbildung = { art: 'schiebung', vektor: a.vektor.map(zahl), figur }
    }
  }
  return Object.keys(punkte).length ? g : null
}

function normDiagramm(z) {
  const typ = ['saeulen', 'linie', 'kreis'].includes(str(z.typ).toLowerCase()) ? str(z.typ).toLowerCase() : 'saeulen'
  const werte = (Array.isArray(z.werte) ? z.werte : []).map(w => Array.isArray(w) ? [str(w[0]), zahl(w[1])] : [str(w?.name || w?.label), zahl(w?.wert)]).filter(w => w[0] && !isNaN(w[1])).slice(0, 24)
  if (werte.length < 2) return null
  if (typ === 'kreis' && werte.some(w => w[1] < 0)) return null
  return { art: 'diagramm', typ, titel: str(z.titel), einheit: str(z.einheit), werte }
}

function normZahlenstrahl(z) {
  const von = zahl(z.von), bis = zahl(z.bis)
  let schritt = zahl(z.schritt)
  if (isNaN(von) || isNaN(bis) || bis <= von) return null
  if (!(schritt > 0) || (bis - von) / schritt > 60) schritt = niceStep((bis - von) / 10)
  const marken = {}
  for (const [n, v] of Object.entries(z.marken || {})) { const x = zahl(v); if (!isNaN(x) && x >= von && x <= bis) marken[str(n)] = x }
  return { art: 'zahlenstrahl', von, bis, schritt, marken }
}

function normZeitstrahl(z) {
  const ev = (Array.isArray(z.ereignisse) ? z.ereignisse : []).map(e => Array.isArray(e) ? [zahl(e[0]), str(e[1])] : [zahl(e?.jahr), str(e?.text)]).filter(e => !isNaN(e[0]) && e[1]).slice(0, 12)
  let von = zahl(z.von), bis = zahl(z.bis)
  if (ev.length) { const js = ev.map(e => e[0]); if (isNaN(von)) von = Math.min(...js); if (isNaN(bis)) bis = Math.max(...js) }
  if (isNaN(von) || isNaN(bis) || bis <= von || !ev.length) return null
  return { art: 'zeitstrahl', von, bis, ereignisse: ev.sort((a, b) => a[0] - b[0]) }
}

function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p
}

// ── Abbildungen ──────────────────────────────────────────────────────────────

/** Bildpunkte einer Abbildung: { "A'": [x,y], … } mit den Originalnamen als Schlüssel. */
export function bildpunkte(g) {
  const a = g.abbildung, P = g.punkte, out = {}
  if (!a) return out
  const r6 = n => Math.round(n * 1e6) / 1e6
  for (const n of a.figur) {
    const [x, y] = P[n]
    if (a.art === 'schiebung') out[n] = [r6(x + a.vektor[0]), r6(y + a.vektor[1])]
    else if (a.art === 'drehung') {
      const [cx, cy] = P[a.zentrum], w = a.winkel * Math.PI / 180, dx = x - cx, dy = y - cy
      out[n] = [r6(cx + dx * Math.cos(w) - dy * Math.sin(w)), r6(cy + dx * Math.sin(w) + dy * Math.cos(w))]
    } else {
      const [x1, y1] = P[a.achse[0]], [x2, y2] = P[a.achse[1]], ux = x2 - x1, uy = y2 - y1
      const t = ((x - x1) * ux + (y - y1) * uy) / (ux * ux + uy * uy)
      out[n] = [r6(2 * (x1 + t * ux) - x), r6(2 * (y1 + t * uy) - y)]
    }
  }
  return out
}
export const bildText = g => Object.entries(bildpunkte(g)).map(([n, [x, y]]) => n + '′(' + fmt(x) + ' | ' + fmt(y) + ')').join(', ')

// ── Zeichnen ────────────────────────────────────────────────────────────────

/** Gibt ein <div class="zl"> mit SVG zurück. opt.loesung: Bild der Abbildung immer zeigen. */
export function zeichnungEl(z, opt = {}) {
  let svg = null
  try {
    if (z.art === 'gitter') svg = gitterSvg(z, opt)
    else if (z.art === 'diagramm') svg = diagrammSvg(z)
    else if (z.art === 'zahlenstrahl') svg = zahlenstrahlSvg(z)
    else if (z.art === 'zeitstrahl') svg = zeitstrahlSvg(z)
  } catch (e) { console.warn('[Zeichnung]', e) }
  const d = document.createElement('div')
  d.className = 'zl' + (opt.loesung ? ' zl-loes' : '')
  if (svg) d.append(svg); else d.textContent = '(Zeichnung nicht lesbar)'
  return d
}

function gitterSvg(g, opt) {
  const [x0, x1, y0, y1] = g.bereich
  const w = x1 - x0, hh = y1 - y0
  const u = Math.max(14, Math.min(30, Math.floor(380 / Math.max(w, hh))))
  const pad = 22
  const W = w * u + 2 * pad, H = hh * u + 2 * pad
  const X = x => pad + (x - x0) * u, Y = y => pad + (y1 - y) * u
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, class: 'zl-svg', role: 'img', 'font-family': 'Nunito, system-ui, sans-serif' })
  const lab = Math.max(w, hh) > 14 ? 2 : 1
  for (let x = x0; x <= x1; x++) svg.append(s('line', { x1: X(x), y1: Y(y0), x2: X(x), y2: Y(y1), stroke: FARBE.gitter, 'stroke-width': 1 }))
  for (let y = y0; y <= y1; y++) svg.append(s('line', { x1: X(x0), y1: Y(y), x2: X(x1), y2: Y(y), stroke: FARBE.gitter, 'stroke-width': 1 }))
  const ax = 0 >= y0 && 0 <= y1, ay = 0 >= x0 && 0 <= x1
  if (ax) svg.append(s('line', { x1: X(x0), y1: Y(0), x2: X(x1), y2: Y(0), stroke: FARBE.achse, 'stroke-width': 1.5 }))
  if (ay) svg.append(s('line', { x1: X(0), y1: Y(y0), x2: X(0), y2: Y(y1), stroke: FARBE.achse, 'stroke-width': 1.5 }))
  const ly = ax ? Y(0) + 13 : Y(y0) + 14, lx = ay ? X(0) - 5 : X(x0) - 6
  for (let x = x0; x <= x1; x++) if (x !== 0 && x % lab === 0) svg.append(s('text', { x: X(x), y: ly, 'font-size': 10, 'text-anchor': 'middle', fill: '#666' }, x))
  for (let y = y0; y <= y1; y++) if (y !== 0 && y % lab === 0) svg.append(s('text', { x: lx, y: Y(y) + 3.5, 'font-size': 10, 'text-anchor': 'end', fill: '#666' }, y))
  if (ax && ay) svg.append(s('text', { x: X(0) - 5, y: Y(0) + 13, 'font-size': 10, 'text-anchor': 'end', fill: '#666' }, '0'))

  const P = g.punkte
  const a = g.abbildung
  const cid = 'zlc' + (++clipNr)
  svg.append(s('defs', null, s('clipPath', { id: cid }, s('rect', { x: X(x0), y: Y(y1), width: w * u, height: hh * u }))))
  // Spiegelachse über das ganze Gitter
  if (a && a.art === 'spiegelung') {
    const [p, q] = a.achse.map(n => P[n]), dx = q[0] - p[0], dy = q[1] - p[1], L = (w + hh) * 2
    svg.append(s('line', { x1: X(p[0] - dx * L), y1: Y(p[1] - dy * L), x2: X(p[0] + dx * L), y2: Y(p[1] + dy * L), stroke: '#555', 'stroke-width': 1.5, 'stroke-dasharray': '6 4', 'clip-path': `url(#${cid})` }))
  }
  for (const v of g.vielecke) svg.append(s('polygon', { points: v.map(n => X(P[n][0]) + ',' + Y(P[n][1])).join(' '), fill: FARBE.fuell, stroke: FARBE.figur, 'stroke-width': 2, 'stroke-linejoin': 'round' }))
  for (const [m, n] of g.strecken) {
    const istAchse = a && a.art === 'spiegelung' && ((a.achse[0] === m && a.achse[1] === n) || (a.achse[0] === n && a.achse[1] === m))
    if (!istAchse) svg.append(s('line', { x1: X(P[m][0]), y1: Y(P[m][1]), x2: X(P[n][0]), y2: Y(P[n][1]), stroke: FARBE.figur, 'stroke-width': 2 }))
  }
  for (const k of g.kreise) svg.append(s('circle', { cx: X(P[k.m][0]), cy: Y(P[k.m][1]), r: k.r * u, fill: 'none', stroke: FARBE.figur, 'stroke-width': 2 }))
  // Bild der Abbildung: nur mit Lösung sichtbar (CSS steuert .zl-bild)
  if (a) {
    const B = bildpunkte(g)
    const grp = s('g', { class: 'zl-bild' })
    const ecken = a.figur.map(n => B[n])
    if (ecken.length >= 3) grp.append(s('polygon', { points: ecken.map(p => X(p[0]) + ',' + Y(p[1])).join(' '), fill: FARBE.bildF, stroke: FARBE.bild, 'stroke-width': 2, 'stroke-linejoin': 'round' }))
    else if (ecken.length === 2) grp.append(s('line', { x1: X(ecken[0][0]), y1: Y(ecken[0][1]), x2: X(ecken[1][0]), y2: Y(ecken[1][1]), stroke: FARBE.bild, 'stroke-width': 2 }))
    for (const n of a.figur) {
      const [x, y] = B[n]
      grp.append(s('circle', { cx: X(x), cy: Y(y), r: 3.2, fill: FARBE.bild }), s('text', { x: X(x) + 5, y: Y(y) - 5, 'font-size': 13, 'font-weight': 800, fill: FARBE.bild }, n + '′'))
    }
    svg.append(grp)
  }
  for (const [n, [x, y]] of Object.entries(P)) {
    svg.append(s('circle', { cx: X(x), cy: Y(y), r: 3.2, fill: FARBE.text }),
      s('text', { x: X(x) + 5, y: Y(y) - 5, 'font-size': 13, 'font-weight': 800, fill: FARBE.text, stroke: '#fff', 'stroke-width': 3, 'paint-order': 'stroke' }, n))
  }
  return svg
}

function diagrammSvg(d) {
  if (d.typ === 'kreis') return kreisSvg(d)
  const W = 380, H = 230, l = 44, r = 10, t = d.titel ? 28 : 12, b = 34
  const max = Math.max(0, ...d.werte.map(w => w[1])), min = Math.min(0, ...d.werte.map(w => w[1]))
  const st = niceStep((max - min || 1) / 5), top = Math.ceil(max / st) * st, bot = Math.floor(min / st) * st
  const Y = v => t + (top - v) / (top - bot || 1) * (H - t - b)
  const n = d.werte.length, bw = (W - l - r) / n
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, class: 'zl-svg', 'font-family': 'Nunito, system-ui, sans-serif' })
  if (d.titel) svg.append(s('text', { x: W / 2, y: 16, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 800, fill: FARBE.text }, d.titel))
  for (let v = bot; v <= top + 1e-9; v += st) {
    svg.append(s('line', { x1: l, y1: Y(v), x2: W - r, y2: Y(v), stroke: FARBE.gitter }), s('text', { x: l - 5, y: Y(v) + 3.5, 'text-anchor': 'end', 'font-size': 10, fill: '#666' }, fmt(v)))
  }
  if (d.einheit) svg.append(s('text', { x: 4, y: t - 4, 'font-size': 10, fill: '#666' }, d.einheit))
  svg.append(s('line', { x1: l, y1: Y(0), x2: W - r, y2: Y(0), stroke: FARBE.achse, 'stroke-width': 1.5 }))
  const schritt = n > 12 ? 2 : 1
  d.werte.forEach(([name, v], i) => {
    const cx = l + bw * (i + 0.5)
    if (d.typ === 'saeulen') svg.append(s('rect', { x: cx - bw * 0.32, y: Math.min(Y(v), Y(0)), width: bw * 0.64, height: Math.abs(Y(v) - Y(0)), fill: 'rgba(31,111,191,.75)' }))
    if (i % schritt === 0) svg.append(s('text', { x: cx, y: H - b + 15, 'text-anchor': 'middle', 'font-size': 10.5, fill: FARBE.text }, name.length > 8 ? name.slice(0, 7) + '…' : name))
  })
  if (d.typ === 'linie') {
    svg.append(s('polyline', { points: d.werte.map(([, v], i) => (l + bw * (i + 0.5)) + ',' + Y(v)).join(' '), fill: 'none', stroke: '#c0392b', 'stroke-width': 2.2 }))
    d.werte.forEach(([, v], i) => svg.append(s('circle', { cx: l + bw * (i + 0.5), cy: Y(v), r: 3, fill: '#c0392b' })))
  }
  return svg
}

function kreisSvg(d) {
  const W = 380, H = 220, cx = 110, cy = 115, R = 90
  const sum = d.werte.reduce((a, w) => a + w[1], 0) || 1
  const farben = ['#1f6fbf', '#d4842a', '#3a9d5d', '#8e44ad', '#c0392b', '#16a085', '#7f8c8d', '#e1b12c']
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, class: 'zl-svg', 'font-family': 'Nunito, system-ui, sans-serif' })
  if (d.titel) svg.append(s('text', { x: W / 2, y: 14, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 800, fill: FARBE.text }, d.titel))
  let a0 = -Math.PI / 2
  d.werte.forEach(([name, v], i) => {
    const a1 = a0 + v / sum * 2 * Math.PI, f = farben[i % farben.length]
    const p = (a) => [cx + R * Math.cos(a), cy + R * Math.sin(a)]
    const [sx, sy] = p(a0), [ex, ey] = p(a1)
    svg.append(d.werte.length === 1 ? s('circle', { cx, cy, r: R, fill: f }) : s('path', { d: `M${cx},${cy} L${sx},${sy} A${R},${R} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${ex},${ey} Z`, fill: f, stroke: '#fff', 'stroke-width': 1.5 }))
    const ly = 34 + i * 20
    svg.append(s('rect', { x: 222, y: ly - 10, width: 12, height: 12, fill: f }), s('text', { x: 240, y: ly, 'font-size': 12, fill: FARBE.text }, name + ' (' + Math.round(v / sum * 100) + '%)'))
    a0 = a1
  })
  return svg
}

function zahlenstrahlSvg(z) {
  const W = 400, H = 76, l = 20, r = 20, y = 46
  const X = v => l + (v - z.von) / (z.bis - z.von) * (W - l - r)
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, class: 'zl-svg', 'font-family': 'Nunito, system-ui, sans-serif' })
  svg.append(s('line', { x1: l - 8, y1: y, x2: W - r + 10, y2: y, stroke: FARBE.achse, 'stroke-width': 1.6 }), s('path', { d: `M${W - r + 10},${y} l-7,-4 v8 z`, fill: FARBE.achse }))
  const n = Math.round((z.bis - z.von) / z.schritt)
  const jede = n > 20 ? Math.ceil(n / 10) : 1
  for (let i = 0; i <= n; i++) {
    const v = z.von + i * z.schritt, gross = i % jede === 0
    svg.append(s('line', { x1: X(v), y1: y - (gross ? 7 : 4), x2: X(v), y2: y + (gross ? 7 : 4), stroke: FARBE.achse, 'stroke-width': 1.2 }))
    if (gross) svg.append(s('text', { x: X(v), y: y + 21, 'text-anchor': 'middle', 'font-size': 10.5, fill: '#444' }, fmt(v)))
  }
  for (const [name, v] of Object.entries(z.marken)) {
    svg.append(s('path', { d: `M${X(v)},${y - 9} l-5,-9 h10 z`, fill: FARBE.bild }), s('text', { x: X(v), y: y - 22, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 800, fill: FARBE.bild }, name))
  }
  return svg
}

function zeitstrahlSvg(z) {
  const W = 420, l = 24, r = 24, reihen = 3, zh = 17
  const H = 40 + reihen * zh * 2 + 20, y = 20 + reihen * zh + 8
  const X = v => l + (v - z.von) / (z.bis - z.von) * (W - l - r)
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, class: 'zl-svg', 'font-family': 'Nunito, system-ui, sans-serif' })
  svg.append(s('line', { x1: l - 10, y1: y, x2: W - r + 12, y2: y, stroke: FARBE.achse, 'stroke-width': 2 }), s('path', { d: `M${W - r + 12},${y} l-8,-5 v10 z`, fill: FARBE.achse }))
  const st = niceStep((z.bis - z.von) / 6)
  for (let v = Math.ceil(z.von / st) * st; v <= z.bis + 1e-9; v += st) svg.append(s('line', { x1: X(v), y1: y - 4, x2: X(v), y2: y + 4, stroke: FARBE.achse }), s('text', { x: X(v), y: y + 15, 'text-anchor': 'middle', 'font-size': 9.5, fill: '#777' }, fmt(v)))
  // Beschriftungen abwechselnd oben und unten, in der ersten freien Reihe
  const belegt = { true: [], false: [] }
  z.ereignisse.forEach(([j, text], i) => {
    const oben = i % 2 === 0
    const t = text.length > 26 ? text.slice(0, 25) + '…' : text
    const breite = (fmt(j).length + 1 + t.length) * 5.6
    const x = X(j), anchor = x < 80 ? 'start' : x > W - 80 ? 'end' : 'middle'
    const x0 = anchor === 'start' ? x : anchor === 'end' ? x - breite : x - breite / 2, x1 = x0 + breite
    const reihenL = belegt[oben]
    let stufe = reihenL.findIndex(ende => x0 > ende + 6)
    if (stufe < 0 || stufe >= reihen) stufe = reihenL.length < reihen ? reihenL.length : reihenL.indexOf(Math.min(...reihenL))
    reihenL[stufe] = x1
    const ty = oben ? y - 14 - stufe * zh : y + 30 + stufe * zh
    svg.append(s('line', { x1: x, y1: y, x2: x, y2: oben ? ty + 3 : ty - 11, stroke: '#999', 'stroke-dasharray': '2 2' }),
      s('circle', { cx: x, cy: y, r: 3.5, fill: FARBE.bild }),
      s('text', { x, y: ty, 'text-anchor': anchor, 'font-size': 10.5, fill: FARBE.text }, s('tspan', { 'font-weight': 800 }, fmt(j) + ' '), t))
  })
  return svg
}
