// Glücksrad: eine kleine Überraschung, wenn für heute alles gefuttert ist.
//
// Bewusst kein Glücksspiel: Man setzt nichts ein und verliert nichts. Gedreht wird gratis,
// einmal pro Tag und erst, wenn alle fälligen Karten erledigt sind. Die Belohnung hängt also
// am Lernen; der Zufall entscheidet nur, wie gross die Zugabe ist. Jedes Feld gewinnt.
import { h } from './dom.js'
import { addKruemel } from './storage.js'
import { PLAETZE, HINTERGRUENDE, getBesitz, schluessel, schenken, radTeile, SELTENHEIT, getLook, avatarHtml } from './shop.js'
import { saisonKaufbar } from './saison.js'
import { today } from './leitner.js'

const KEY = 'zk:rad'
const FELDER = [
  { kruemel: 3 }, { kruemel: 8 }, { kruemel: 2 }, { fund: true },
  { kruemel: 5 }, { kruemel: 2 }, { kruemel: 10 }, { kruemel: 4 },
]
// Gewichte: kleine Beträge oft, 10 Krümel selten, ein Fundstück etwa jedes 12. Mal
const GEWICHT = [16, 7, 18, 8, 12, 18, 4, 17]

const heute = () => today()
export function heuteGedreht() { try { return JSON.parse(localStorage.getItem(KEY) || '{}').tag === heute() } catch { return false } }
function merken(ergebnis) { try { localStorage.setItem(KEY, JSON.stringify({ tag: heute(), ...ergebnis })) } catch {} }

/**
 * Fundstück: zuerst die Seltenheit auslosen (Rare oft, Mythisch sehr selten), dann ein Teil daraus,
 * das man noch nicht hat. Ist die Stufe komplett, gilt die nächst häufigere. Hat man alle
 * Glücksrad-Teile, gibt es ein günstiges Shop-Teil.
 */
function fundstueck() {
  const besitz = getBesitz()
  const offen = radTeile().filter(k => !besitz.has(schluessel(k.platz, k.teil.id)))
  if (offen.length) {
    const stufen = Object.keys(SELTENHEIT).filter(s => offen.some(k => k.teil.rad === s))
    const summe = stufen.reduce((a, s) => a + SELTENHEIT[s].gewicht, 0)
    let r = Math.random() * summe, stufe = stufen[0]
    for (const s of stufen) { r -= SELTENHEIT[s].gewicht; if (r < 0) { stufe = s; break } }
    const aus = offen.filter(k => k.teil.rad === stufe)
    return aus[Math.floor(Math.random() * aus.length)]
  }
  const kandidaten = [
    ...PLAETZE.flatMap(p => p.teile.filter(t => t.preis > 0 && t.preis <= 250 && !t.bedingung && !t.rad && saisonKaufbar(t)).map(t => ({ platz: p.id, teil: t }))),
    ...HINTERGRUENDE.filter(t => t.preis > 0 && t.preis <= 250 && saisonKaufbar(t)).map(t => ({ platz: 'hg', teil: t })),
  ].filter(k => !besitz.has(schluessel(k.platz, k.teil.id)))
  return kandidaten[Math.floor(Math.random() * kandidaten.length)] || null
}

function ziehen() {
  const summe = GEWICHT.reduce((a, b) => a + b, 0)
  let r = Math.random() * summe
  for (let i = 0; i < FELDER.length; i++) { r -= GEWICHT[i]; if (r < 0) return i }
  return 0
}

// Eigene SVG-Zeichen statt Emoji: auf jedem Gerät gleich und auch klein erkennbar.
const geschenk = '<path d="M-12-3h24v7h-24zM-10 4v15h20V4M0-3v22M0-3c-12 0-13-12-6-11 5 0 6 11 6 11s1-11 6-11c7-1 6 11-6 11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>'
const kruemel = '<circle cx="-6" cy="1" r="3" fill="currentColor"/><circle cx="5" cy="-3" r="3.5" fill="currentColor"/><circle cx="4" cy="7" r="2.5" fill="currentColor"/>'

function radSvg() {
  const R = 160, radius = 145, winkel = 360 / FELDER.length
  const punkt = (grad, r) => { const a = (grad - 90) * Math.PI / 180; return [R + r * Math.cos(a), R + r * Math.sin(a)] }
  const stuecke = FELDER.map((f, i) => {
    const [x1, y1] = punkt(i * winkel, radius), [x2, y2] = punkt((i + 1) * winkel, radius)
    const [x, y] = punkt((i + 0.5) * winkel, 102)
    const farbe = f.fund ? '#e5dcf3' : i % 2 ? '#fffaf1' : '#f7e1b5'
    const beschriftung = f.fund
      ? '<g style="color:#654297" transform="translate(0,-9)">' + geschenk + '</g><text y="24" class="rad-fund-text">Fundstück</text>'
      : '<text y="4" class="rad-zahl">' + f.kruemel + '</text><g transform="translate(0,20) scale(.65)" style="color:#aa732c">' + kruemel + '</g>'
    return '<path class="rad-feld" d="M160,160 L' + x1 + ',' + y1 + ' A145,145 0 0 1 ' + x2 + ',' + y2 + ' Z" fill="' + farbe + '"/>'
      + '<g transform="translate(' + x + ',' + y + ')"><g class="rad-beschriftung">' + beschriftung + '</g></g>'
  }).join('')
  return '<svg viewBox="0 0 320 320" class="rad-scheibe" aria-hidden="true"><circle cx="160" cy="160" r="157" fill="#a77432"/><circle cx="160" cy="160" r="152" fill="#f5d39a"/>'
    + stuecke + '<circle cx="160" cy="160" r="146" fill="none" stroke="#a77432" stroke-width="2"/></svg>'
}

function zeichen(inhalt, klasse) {
  const el = h('span', { class: klasse, 'aria-hidden': 'true' })
  el.innerHTML = '<svg viewBox="-20 -20 40 40" fill="none">' + inhalt + '</svg>'
  return el
}

/**
 * Auf dem Start: nur eine Zeile statt des ganzen Rads, damit die Sets oben bleiben. Antippen klappt das Rad auf.
 */
export function radZeile(platz, aufklappen) {
  const zeile = h('button', { class: 'rad-zeile', type: 'button', 'aria-label': 'Für heute alles gefüttert. Glücksrad öffnen' },
    zeichen('<path d="m-8 0 5 5 11-11" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>', 'rad-check'),
    h('span', { class: 'rad-zeile-text' }, h('b', null, 'Für heute alles gefüttert'), h('small', null, 'Jetzt am Glücksrad drehen')),
    zeichen('<g transform="scale(.8)">' + geschenk + '</g>', 'rad-zeile-icon'),
    h('span', { class: 'rad-zeile-pfeil', 'aria-hidden': 'true' }, '›'))
  zeile.addEventListener('click', aufklappen)
  platz.replaceChildren(zeile)
}

/**
 * Baut die Lernbelohnung ein. Der Gewinn wird weiterhin sofort und genau einmal gutgeschrieben.
 * `eingebettet`: auf der Auswertung, die schon «Portion geschafft!» sagt – dort ohne eigenen Rahmen und ohne zweite Überschrift.
 */
export function radEinbauen(platz, fertig, { eingebettet = false } = {}) {
  const scheibe = h('div', { class: 'rad-dreh' }); scheibe.innerHTML = radSvg()
  const ergebnis = h('div', { class: 'rad-ergebnis', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true', tabindex: -1, hidden: true })
  const knopf = h('button', { class: 'btn rad-knopf', type: 'button' }, 'Jetzt drehen')
  const hinweis = h('p', { class: 'rad-hinweis' }, 'Einmal am Tag. Jedes Feld gewinnt.')
  // In der Mitte das eigene Hirn (mit Hut und Brille aus dem Shop), ohne Begleiter und Hintergrund
  const nabe = h('div', { class: 'rad-nabe', 'aria-hidden': 'true' })
  nabe.innerHTML = avatarHtml({ ...getLook(), begleiter: null, hintergrund: 'creme' }, 'rad-nabe-hirn')
  const kopf = eingebettet
    ? h('div', { class: 'rad-text' }, h('p', { class: 'rad-sub rad-sub-eingebettet' }, 'Zur Belohnung darfst du einmal drehen: ein paar Krümel oder ein Fundstück für dein Hirn.'))
    : h('div', { class: 'rad-text' },
        h('div', { class: 'rad-kicker' }, zeichen('<path d="m-8 0 5 5 11-11" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>', 'rad-check'), 'Für heute alles gefüttert'),
        h('h2', { class: 'rad-titel' }, 'Eine kleine Zugabe.'),
        h('p', { class: 'rad-sub' }, 'Ein paar Krümel oder ein Fundstück für dein Hirn.'))
  const karte = h('section', { class: 'rad' + (eingebettet ? ' eingebettet' : ''), 'aria-label': 'Glücksrad: deine Lernbelohnung' },
    kopf,
    h('div', { class: 'rad-buehne' },
      h('div', { class: 'rad-zeiger', 'aria-hidden': 'true' }),
      scheibe,
      nabe),
    h('div', { class: 'rad-legende', 'aria-hidden': 'true' },
      h('span', null, zeichen(kruemel, 'rad-legende-icon'), 'Krümel'),
      h('span', null, zeichen(geschenk, 'rad-legende-icon rad-legende-fund'), 'Fundstück')),
    knopf, hinweis, ergebnis)

  if (heuteGedreht()) {
    knopf.disabled = true; knopf.textContent = 'Heute schon gedreht'
    hinweis.textContent = 'Deine Belohnung ist bereits gutgeschrieben.'
  }
  knopf.addEventListener('click', () => {
    if (heuteGedreht()) return
    knopf.disabled = true; knopf.textContent = 'Das Rad dreht …'
    karte.classList.add('dreht')
    hinweis.textContent = 'Deine Zugabe ist gleich da.'
    let i = ziehen()
    let fund = FELDER[i].fund ? fundstueck() : null
    if (FELDER[i].fund && !fund) i = FELDER.findIndex(f => f.kruemel === 10)
    const gewinn = fund ? { fund: fund.platz + ':' + fund.teil.id } : { kruemel: FELDER[i].kruemel }
    merken(gewinn)
    if (fund) schenken(fund.platz, fund.teil.id); else addKruemel(gewinn.kruemel)

    const ruhig = matchMedia('(prefers-reduced-motion: reduce)').matches
    const ziel = 360 * (ruhig ? 0 : 5) + (360 - (i + 0.5) * 360 / FELDER.length) + (Math.random() * 20 - 10)
    const svg = scheibe.firstElementChild
    const uebergang = ruhig ? 'none' : 'transform 3.2s cubic-bezier(.12,.67,.16,1)'
    svg.style.transition = uebergang
    const texte = svg.querySelectorAll('.rad-beschriftung')
    texte.forEach(t => { t.style.transition = uebergang })
    requestAnimationFrame(() => {
      svg.style.transform = 'rotate(' + ziel + 'deg)'
      // Die Beschriftungen drehen sich gegenläufig und bleiben dadurch aufrecht lesbar.
      texte.forEach(t => { t.style.transform = 'rotate(' + -ziel + 'deg)' })
    })
    setTimeout(() => {
      knopf.remove(); hinweis.remove()
      karte.classList.remove('dreht'); karte.classList.add('fertig')
      const sel = fund?.teil.rad && SELTENHEIT[fund.teil.rad]
      if (fund) {
        const bild = h('img', {
          src: import.meta.env.BASE_URL + 'shop/' + (fund.platz === 'hg' ? 'hintergrund' : fund.platz) + '/' + fund.teil.id + '.png',
          alt: '', class: 'rad-fund-bild', width: 88, height: 88,
        })
        ergebnis.replaceChildren(
          h('div', { class: 'rad-fund-vorschau' }, bild),
          h('div', { class: 'rad-gewinn-text' },
            sel ? h('span', { class: 'selten-marke s-' + fund.teil.rad }, sel.name) : h('span', { class: 'rad-gewinn-label' }, 'Fundstück'),
            h('h3', { class: 'rad-gewinn-titel' }, fund.teil.titel),
            h('p', { class: 'rad-gewinn-sub' }, 'Gehört jetzt dir. Im Shop kannst du es auswählen.')),
          h('button', { class: 'rad-shop-knopf', type: 'button', 'data-action': 'laden' }, 'Im Shop ansehen', h('span', { 'aria-hidden': 'true' }, ' →')))
        ergebnis.classList.add('rad-fund')
        if (sel) ergebnis.style.setProperty('--fund-farbe', sel.farbe)
      } else {
        ergebnis.replaceChildren(
          zeichen(kruemel, 'rad-kruemel-icon'),
          h('div', { class: 'rad-gewinn-text' }, h('h3', { class: 'rad-gewinn-titel' }, '+' + gewinn.kruemel + ' Krümel'),
            h('p', { class: 'rad-gewinn-sub' }, 'Schon gutgeschrieben. Lass es dir schmecken.')))
      }
      ergebnis.hidden = false
      ergebnis.focus({ preventScroll: true })
      // Kurz zeigen, wo das Rad stehen blieb, dann zusammenklappen: Die Sets darunter rücken wieder hoch.
      if (!eingebettet) setTimeout(() => { if (karte.isConnected) karte.classList.add('zu') }, ruhig ? 800 : 1600)
      fertig?.(gewinn)
    }, ruhig ? 50 : 3300)
  })
  platz.replaceChildren(karte)
}
