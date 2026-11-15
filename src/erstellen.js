// Erstellen: Typ wählen → Prompt bauen → KI-Antwort einfügen → gleich speichern (nur bei Problemen eine Meldung).
import { h, kopieren, KIS } from './dom.js'
import { parseAnswer, promptKarten, promptTest, MIX, TNAME, itemKey } from './format.js'
import { saveLibSet, neueId } from './bibliothek.js'

let cr = null
// Nach «Auftrag kopieren» wechselt man zur KI. Kommt man zurück, zeigt die App, wo es weitergeht.
let einfKnopf = null
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !cr?.kopiert || cr.parsed || !einfKnopf?.isConnected) return
  einfKnopf.classList.remove('puls'); void einfKnopf.offsetWidth; einfKnopf.classList.add('puls')
  einfKnopf.scrollIntoView({ block: 'center', behavior: 'smooth' })
})
const merk = (k, v) => { try { if (v === undefined) return localStorage.getItem('zk:e:' + k); localStorage.setItem('zk:e:' + k, v) } catch { return null } }

/** Neue Einträge an bereits gelesene anhängen, Doppelte weglassen. */
function verbinde(alt, neu) { const seen = new Set(alt.map(itemKey)); return [...alt, ...neu.filter(i => i.t === 'info' || !seen.has(itemKey(i)))] }
function lies() {
  cr.parsed = parseAnswer(cr.answer, cr.typ)
  if (cr.teil && cr.parsed.items?.length) { cr.parsed.items = verbinde(cr.teil, cr.parsed.items); cr.parsed.ok = true; cr.parsed.titel = cr.teilTitel || cr.parsed.titel }
}

export function zuruecksetzen() { cr = null }

/** Von der Ergebnisseite: Prompt für ein Übungsset zu den Fehlern ist schon fertig. */
export function folgeVorbereiten(prompt, set) {
  cr = { typ: 'test', folge: true, thema: '', fach: set.fach || 'Deutsch', klasse: set.klasse || '7', anzahl: '', karteart: '', prompt, answer: '', parsed: null, vonTitel: set.titel }
}

const TYPEN = {
  karten: { name: 'Karteikarten', tab: 'KARTEN', css: 'k', text: 'Vorne Frage, hinten Antwort. Zum Auswendiglernen.' },
  test:   { name: 'Aufgabenset', tab: 'AUFGABENSET', css: 'te', text: 'Test, Übungsblatt oder Arbeitsblatt: am Bildschirm üben, als Test mit Note schreiben oder ausdrucken. Ein bestehendes Blatt dient als Vorlage.' },
}
// Ältere Sets (Arbeitsblatt, Tutor) erscheinen als Aufgabenset.
export const TYP_INFO = { ...TYPEN, blatt: TYPEN.test, tutor: TYPEN.test }

const sel = (k, opts) => h('select', { class: 'in', onchange: e => { cr[k] = e.target.value } }, opts.map(o => h('option', { value: o, selected: o === cr[k] }, o)))
const feld = (l, el) => h('div', null, h('div', { class: 'lbl', style: 'margin-bottom:4px' }, l), el)

export function renderWahl(root, hooks) {
  cr = null
  const opt = (k, st) => h('button', { class: 'kk wahl', style: st || '', onclick: () => hooks.waehle(k) },
    h('span', { class: 'tab ' + TYPEN[k].css }, TYPEN[k].tab), h('div', { class: 't' }, TYPEN[k].name), h('div', { class: 'wahl-text' }, TYPEN[k].text))
  root.replaceChildren(h('div', { class: 'screen nv' },
    hooks.kopf('Erstellen'),
    h('div', { class: 'seite' },
      h('div', null, h('div', { class: 'serif', style: 'font-size:26px;font-weight:500;line-height:1.15' }, 'Was willst du lernen?'),
        h('div', { style: 'font-size:14px;color:var(--text-2);margin-top:6px;font-weight:600' }, 'Wähle, was die KI für dich bauen soll.')),
      opt('karten'), opt('test'),
      h('div', { style: 'display:flex;gap:10px;align-items:center;font-size:13px;color:var(--text-2);font-weight:600' },
        h('img', { src: import.meta.env.BASE_URL + 'hirn.png', alt: '', width: 36, height: 36, style: 'flex:none' }), 'Foto, Text oder Thema: die KI baut es dir.')),
    hooks.nav()))
}

export function renderErstellen(root, typ, hooks) {
  if (!cr || (cr.typ !== typ && !cr.folge)) {
    cr = { typ, thema: '', fach: merk('fach') || 'Deutsch', klasse: merk('klasse') || '7', schwierigkeit: 'Mittel', anzahl: typ === 'karten' ? '' : '12', karteart: 'Begriffe', prompt: '', answer: '', rest: '', parsed: null }
  }
  const re = () => { const y = window.scrollY; hooks.neu(); window.scrollTo(0, y) }
  const T = TYPEN[cr.typ]
  const body = h('div', { class: 'seite', style: 'padding-bottom:24px' })
  root.replaceChildren(h('div', { class: 'screen nv' },
    h('div', { class: 'top' }, h('button', { class: 'x', 'aria-label': 'Zurück', onclick: () => hooks.zurueck() }, '←'), h('span', null, T.name)),
    body))

  if (!cr.folge) {
    body.append(
      h('div', { class: 'lbl' }, cr.typ === 'karten' ? '1 · Thema oder Material' : '1 · Thema oder Vorlage (Text eines bestehenden Blatts)'),
      h('textarea', { class: 'in', style: 'min-height:110px', placeholder: 'Thema oder Text einfügen. Ein Foto hängst du später bei der KI an (ohne Namen und Noten darauf).', oninput: e => { cr.thema = e.target.value } }, cr.thema),
      h('div', { class: 'zwei' }, feld('Fach', sel('fach', Object.keys(MIX))), feld('Klasse', sel('klasse', ['5', '6', '7', '8', '9']))),
      h('div', { class: 'zwei' }, (cr.typ === 'karten' ? feld('Anzahl (leer = alle)', h('input', { class: 'in', type: 'number', min: '1', inputmode: 'numeric', placeholder: 'alle aus der Liste', value: cr.anzahl, oninput: e => { cr.anzahl = e.target.value } })) : feld('Anzahl', sel('anzahl', ['6', '8', '10', '12', '15', '20']))), cr.typ === 'karten' ? feld('Kartenart', sel('karteart', ['Begriffe', 'Vokabeln', 'Fakten', 'Frage und Antwort'])) : null),
      cr.typ === 'test' ? feld('Schwierigkeit', sel('schwierigkeit', ['Leicht', 'Mittel', 'Schwer'])) : null,
      h('button', { class: 'btn', onclick: () => {
        if (!cr.thema.trim()) { cr.err = 'Bitte zuerst ein Thema oder Material eingeben.'; return re() }
        cr.err = ''; merk('fach', cr.fach); merk('klasse', cr.klasse)
        const c = { ...cr, thema: cr.thema.trim() }
        cr.prompt = (cr.typ === 'karten' ? promptKarten : promptTest)({ ...c, blatt: true })
        re()
      } }, 'Weiter'),
      cr.err ? h('div', { class: 'fb no' }, cr.err) : null)
  } else {
    body.append(h('div', { class: 'fb', style: 'background:var(--vio-l);color:var(--vio)' }, h('span', null, '↻'), h('div', null, 'Der Auftrag für ein Übungsset zu den Fehlern in «' + (cr.vonTitel || '') + '» ist fertig. Kopiere ihn bei deiner KI und füge die Antwort unten ein.')))
  }

  if (cr.prompt) {
    const kiWahl = h('div', { class: 'ki-wahl', hidden: !cr.kopiert },
      h('div', { style: 'font-size:13px;font-weight:700;color:var(--text-2)' }, 'Kopiert. Öffne jetzt eine KI und füge den Auftrag dort ein. Kopiere danach ihre ganze Antwort und komm hierher zurück.'),
      h('div', { class: 'ki-reihe' }, KIS.map(([n, u]) => h('a', { class: 'btn ghost ki', href: u, target: '_blank', rel: 'noopener' }, n + ' ↗'))))
    const cb = h('button', { class: 'btn', style: 'height:48px', onclick: async () => { await kopieren(cr.prompt, cb); cr.kopiert = true; kiWahl.hidden = false } }, 'Auftrag kopieren')
    const ta = h('textarea', { class: 'in code', style: 'min-height:90px', placeholder: 'Oder die Antwort von Hand hier einfügen …', oninput: e => { cr.answer = e.target.value } }, cr.answer)
    const einf = h('button', { class: 'btn ' + (cr.typ === 'test' ? 'blue' : ''), onclick: async () => {
      let t = ''
      try { t = await navigator.clipboard.readText() } catch {}
      if (!t.trim()) { cr.err2 = 'Das Einfügen hat nicht geklappt. Füge die Antwort unten von Hand ein und tippe auf «Antwort lesen».'; cr.hand = true; return re() }
      cr.answer = t; cr.err2 = ''; lies(); re()
    } }, cr.teil ? 'Fortsetzung einfügen' : 'Antwort einfügen')
    einfKnopf = einf
    body.append(
      h('div', { class: 'lbl', style: 'margin-top:6px' }, (cr.folge ? '1' : '2') + ' · Auftrag an die KI schicken'),
      h('div', { style: 'font-size:14px;font-weight:600;color:var(--text-2);line-height:1.4' }, 'Kopiere den Auftrag und füge ihn bei einer KI ein. Ein Foto hängst du dort einfach dazu.'),
      cb, kiWahl,
      h('details', { class: 'auftrag' }, h('summary', { style: 'font-size:13px;font-weight:700;color:var(--text-2);cursor:pointer' }, 'Auftrag ansehen'), h('div', { class: 'mono' }, cr.prompt)),
      h('div', { class: 'lbl', style: 'margin-top:10px' }, (cr.folge ? '2' : '3') + ' · Antwort der KI zurückbringen'),
      h('div', { style: 'font-size:14px;font-weight:600;color:var(--text-2);line-height:1.4' }, cr.teil ? 'Bisher gelesen: ' + cr.teil.length + ' Einträge. Kopiere jetzt die Fortsetzung der KI.' : 'Kopiere bei der KI die ganze Antwort und tippe dann hier:'),
      einf, ta,
      h('button', { class: 'btn ghost', style: 'height:44px', onclick: () => {
        if (!cr.answer.trim()) { cr.err2 = 'Bitte zuerst die Antwort der KI einfügen.'; cr.parsed = null } else { cr.err2 = ''; lies() }
        re()
      } }, 'Antwort lesen'),
      cr.err2 ? h('div', { class: 'fb no' }, cr.err2) : null)
  }

  const p = cr.parsed
  if (!p) return
  const counts = {}
  ;(p.items || []).forEach(i => { counts[i.t] = (counts[i.t] || 0) + 1 })
  const sum = Object.entries(counts).map(([k, v]) => v + ' × ' + TNAME[k])
  const modus = { gekuerzt: 'abgeschnitten, vollständige Teile übernommen', zeilen: 'zeilenweise gelesen' }[p.info.mode]
  body.append(
    h('div', { class: 'fb ' + (p.ok ? 'ok' : 'no') }, h('span', null, p.ok ? '✓' : '✕'),
      h('div', null, p.ok ? [h('b', null, 'Gelesen: '), p.items.length + ' Einträge (' + sum.join(', ') + ').']
        : [h('b', null, 'Diese Übung konnte nicht erstellt werden.'), h('div', { style: 'font-weight:600;margin-top:4px' }, 'Kopiere die ganze Antwort der KI noch einmal hierher oder bitte die KI, es noch einmal zu versuchen.')])))
  if (p.problems.length || modus) body.append(h('details', { class: 'auftrag' }, h('summary', { style: 'font-size:13px;font-weight:700;color:var(--text-2);cursor:pointer' }, 'Details anzeigen'),
    h('div', { class: 'kk', style: 'margin-top:6px' },
      modus ? h('div', { style: 'font-size:13px;font-weight:600;margin-bottom:4px' }, 'Die Antwort musste repariert werden (' + modus + ').') : null,
      ...p.problems.map(x => h('div', { style: 'font-size:13px;font-weight:600;line-height:1.4;margin-bottom:4px' }, '· ' + x)))))
  if (p.truncated) {
    body.append(h('div', { class: 'fb near' }, h('span', null, '~'), h('div', null, 'Die Antwort der KI hat mittendrin aufgehört. ' + p.items.length + ' vollständige Einträge sind gelesen. Schreibe der KI «Mach weiter ab Eintrag ' + (p.items.length + 1) + ', gleiches Format» und hole dann die Fortsetzung.')),
      h('button', { class: 'btn ghost', style: 'height:44px', onclick: () => { cr.teil = p.items; cr.teilTitel = p.titel; cr.answer = ''; cr.parsed = null; re(); window.scrollTo(0, 0) } }, 'Fortsetzung holen'))
  }
  if (!p.ok) return
  if (p.truncated) {
    // Abgeschnitten: lieber die Fortsetzung holen, aber auch so speichern lassen.
    body.append(h('button', { class: 'btn', onclick: () => speichern(p, hooks) }, 'So speichern (' + p.items.length + ' Einträge)'))
    return
  }
  speichern(p, hooks)
}

/** Gelesene Antwort ohne Zwischenschritt speichern und gleich öffnen. Titel und Aufgaben lassen sich danach in der Bibliothek bearbeiten. */
function speichern(p, hooks) {
  const alleKarten = p.items.length && p.items.every(i => i.t === 'karte')
  const set = { id: neueId(), titel: (p.titel || cr.thema.slice(0, 40) || 'Neues Set').trim(), fach: p.fach || cr.fach, klasse: cr.klasse, created: Date.now(), typ: alleKarten ? 'karten' : 'test' }
  set.items = p.items
  saveLibSet(set)
  const hinweis = p.problems.length ? (p.problems.length === 1 ? 'Ein Teil der Antwort war unlesbar und fehlt.' : p.problems.length + ' Teile der Antwort waren unlesbar und fehlen.') : ''
  cr = null
  hooks.gespeichert(set, hinweis)
}
