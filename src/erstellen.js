// Erstellen in drei Schritten: 1 Material → 2 Auftrag zur KI bringen → 3 Antwort einfügen, gleich speichern.
// Es ist immer nur der aktuelle Schritt offen; erledigte stehen als kurze Zeile darüber.
import { h, kopieren, KIS } from './dom.js'
import { symEl } from './symbole.js'
import { parseAnswer, promptKarten, promptTest, MIX, TNAME, itemKey } from './format.js'
import { saveLibSet, neueId } from './bibliothek.js'

let cr = null
// Nach «Auftrag kopieren» wechselt man zur KI. Kommt man zurück, geht es gleich bei Schritt 3 weiter.
let einfKnopf = null
let ansicht = null, neuZeichnen = null
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !cr?.kopiert || cr.parsed || !ansicht?.isConnected) return
  if (cr.schritt === 2) { cr.schritt = 3; entwurfSichern(); neuZeichnen?.() }
  if (!einfKnopf?.isConnected) return
  einfKnopf.classList.remove('puls'); void einfKnopf.offsetWidth; einfKnopf.classList.add('puls')
  einfKnopf.scrollIntoView({ block: 'center', behavior: 'smooth' })
})

// ── Entwurf ──
// Beim Wechsel zur KI schliesst das Handy die App manchmal im Hintergrund. Darum liegt alles,
// was man eingegeben hat, sofort auf dem Gerät und ist beim nächsten Öffnen wieder da (zwei Wochen lang).
const ENTWURF = 'zk:e:entwurf'
function entwurfSichern() {
  if (!cr) return
  const { parsed, err, err2, ...rest } = cr
  try { localStorage.setItem(ENTWURF, JSON.stringify({ ...rest, zeit: Date.now() })) } catch {}
}
/** Der angefangene Entwurf, falls es einen gibt. */
export function entwurf() {
  try { const e = JSON.parse(localStorage.getItem(ENTWURF) || 'null'); if (e && e.typ && Date.now() - (e.zeit || 0) < 14 * 864e5) return e } catch {}
  return null
}
export function entwurfWeg() { try { localStorage.removeItem(ENTWURF) } catch {} }
const merk = (k, v) => { try { if (v === undefined) return localStorage.getItem('zk:e:' + k); localStorage.setItem('zk:e:' + k, v) } catch { return null } }

/** Neue Einträge an bereits gelesene anhängen, Doppelte weglassen. */
function verbinde(alt, neu) { const seen = new Set(alt.map(itemKey)); return [...alt, ...neu.filter(i => i.t === 'info' || !seen.has(itemKey(i)))] }
function lies() {
  cr.parsed = parseAnswer(cr.answer, cr.typ)
  if (cr.teil && cr.parsed.items?.length) { cr.parsed.items = verbinde(cr.teil, cr.parsed.items); cr.parsed.ok = true; cr.parsed.titel = cr.teilTitel || cr.parsed.titel }
}

export function zuruecksetzen() { cr = null }

// ── Foto ──
// Das Foto bleibt nur im Arbeitsspeicher dieser Seite: Hirnfutter lädt es nirgends hoch und speichert es nicht.
// Es geht einzig über das Teilen-Fenster des Handys an die KI-App, die der Schüler wählt.
let fotoDatei = null, fotoUrl = ''
function fotoSetzen(datei) {
  if (fotoUrl) URL.revokeObjectURL(fotoUrl)
  fotoDatei = datei || null
  fotoUrl = datei ? URL.createObjectURL(datei) : ''
}
// Der Weg über das Teilen-Fenster ist eine Einstellung: Standard bleibt Kopieren und Anhängen.
// Nur wer eine KI-App auf dem Handy hat, kreuzt sie an; das Gerät merkt sich das.
const KIAPP = 'zk:e:kiapp'
const kiApp = () => { try { return localStorage.getItem(KIAPP) === '1' } catch { return false } }
const kiAppSetzen = an => { try { an ? localStorage.setItem(KIAPP, '1') : localStorage.removeItem(KIAPP) } catch {} }
/** Kann der Browser überhaupt Dateien an Apps weitergeben? (Handys ja, die meisten Computer nein) */
const teilenMoeglich = () => typeof navigator.share === 'function' && typeof navigator.canShare === 'function'
/** Kann dieses Gerät das Foto samt Auftrag an eine App weitergeben? (Handy-Browser ja, die meisten Computer nein) */
const kannFotoTeilen = () => { try { return !!(fotoDatei && navigator.canShare && navigator.canShare({ files: [fotoDatei] })) } catch { return false } }

function fotoBereich(re) {
  const eingabe = mitKamera => {
    const inp = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: e => { const d = e.target.files?.[0]; if (d) { fotoSetzen(d); re() } } })
    if (mitKamera) inp.setAttribute('capture', 'environment')
    return inp
  }
  const kamera = eingabe(true), galerie = eingabe(false)
  const hinweis = h('div', { class: 'foto-hinweis' }, 'Hirnfutter behält das Foto nur kurz, bis du es an die KI schickst. Es wird nirgends hochgeladen oder gespeichert. Achte darauf, dass keine Namen oder Noten darauf stehen.')
  if (fotoDatei) return h('div', { class: 'foto-bereich' }, kamera, galerie,
    h('div', { class: 'foto-vorschau' }, h('img', { src: fotoUrl, alt: 'Dein Foto' }),
      h('div', { class: 'foto-akt' },
        h('button', { class: 'lnk', onclick: () => galerie.click() }, 'Anderes Foto wählen'),
        h('button', { class: 'lnk', onclick: () => kamera.click() }, 'Neu aufnehmen'),
        h('button', { class: 'lnk', onclick: () => { fotoSetzen(null); re() } }, 'Entfernen'))),
    hinweis)
  return h('div', { class: 'foto-bereich' }, kamera, galerie,
    h('div', { class: 'zwei' },
      h('button', { class: 'btn', style: 'height:48px', onclick: () => kamera.click() }, symEl('foto'), 'Foto aufnehmen'),
      h('button', { class: 'btn ghost', style: 'height:48px', onclick: () => galerie.click() }, symEl('bibliothek'), 'Foto wählen')),
    hinweis,
    h('div', { class: 'foto-hinweis' }, 'Du kannst das Foto auch erst bei der KI anhängen.'))
}

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

// Eine Option ist entweder ein Wert oder ein Paar [Wert, Anzeige].
const sel = (k, opts) => h('select', { class: 'in', onchange: e => { cr[k] = e.target.value; entwurfSichern() } }, opts.map(o => { const [w, t] = Array.isArray(o) ? o : [o, o]; return h('option', { value: w, selected: w === cr[k] }, t) }))
const STUFEN = [['5', '5. Klasse'], ['6', '6. Klasse'], ['7', '1. Sek (7. Klasse)'], ['8', '2. Sek (8. Klasse)'], ['9', '3. Sek (9. Klasse)']]
/** Letzter Knopf beim Erstellen: sagt, was dabei herauskommt. */
const fertigText = () => cr?.typ === 'karten' ? 'Karteikarten erstellen' : 'Aufgaben erstellen'
const feld = (l, el) => h('div', null, h('div', { class: 'lbl', style: 'margin-bottom:4px' }, l), el)

export function renderWahl(root, hooks) {
  cr = null
  const opt = (k, st) => h('button', { class: 'kk wahl', style: st || '', onclick: () => hooks.waehle(k) },
    h('span', { class: 'tab ' + TYPEN[k].css }, TYPEN[k].tab), h('div', { class: 't' }, TYPEN[k].name), h('div', { class: 'wahl-text' }, TYPEN[k].text))
  root.replaceChildren(h('div', { class: 'screen nv' },
    hooks.kopf('Erstellen'),
    h('div', { class: 'seite' },
      h('div', null, h('div', { class: 'serif', style: 'font-size:26px;font-weight:500;line-height:1.15' }, 'Was willst du lernen?'),
        h('div', { style: 'font-size:15px;color:var(--text-2);margin-top:6px;font-weight:600' }, 'Wähle, was die KI für dich bauen soll.')),
      entwurfKarte(hooks),
      opt('karten'), opt('test'),
      h('div', { style: 'display:flex;gap:10px;align-items:center;font-size:13px;color:var(--text-2);font-weight:600' },
        h('img', { src: import.meta.env.BASE_URL + 'hirn.png', alt: '', width: 36, height: 36, style: 'flex:none' }), 'Foto, Text oder Thema: die KI baut es dir.')),
    hooks.nav()))
}

function entwurfKarte(hooks) {
  const e = entwurf()
  if (!e) return null
  const was = e.folge ? 'Übungsset zu den Fehlern in «' + (e.vonTitel || '') + '»'
    : TYPEN[e.typ].name + (e.quelle === 'foto' ? ' aus einem Foto' : e.thema ? ' · «' + e.thema.trim().slice(0, 40) + (e.thema.trim().length > 40 ? ' …' : '') + '»' : '')
  return h('div', { class: 'entwurf-karte' },
    h('div', null, h('div', { style: 'font-weight:800' }, 'Angefangen: ' + was), h('div', { class: 'entwurf-meta' }, 'Schritt ' + (e.schritt || 1) + ' von 3')),
    h('div', { class: 'entwurf-akt' },
      h('button', { class: 'btn', style: 'height:42px', onclick: () => hooks.waehle(e.typ) }, symEl('weiter'), 'Weitermachen'),
      h('button', { class: 'lnk', onclick: () => { entwurfWeg(); hooks.neu() } }, 'Verwerfen')))
}

/** Ein erledigter Schritt als kurze Zeile mit «Ändern». */
function fertig(nr, titel, text, aendern, aendernText = 'Ändern') {
  return h('div', { class: 'schritt-fertig' },
    h('span', { class: 'schritt-haken', 'aria-hidden': 'true' }, '✓'),
    h('div', { style: 'flex:1;min-width:0' }, h('div', { class: 'schritt-titel' }, nr + ' · ' + titel), text ? h('div', { class: 'schritt-text' }, text) : null),
    aendern ? h('button', { class: 'lnk', onclick: aendern }, aendernText) : null)
}

export function renderErstellen(root, typ, hooks) {
  if (!cr || (cr.typ !== typ && !cr.folge)) {
    const e = entwurf()
    cr = e && e.typ === typ ? e
      : { typ, quelle: 'text', thema: '', fach: merk('fach') || 'Deutsch', klasse: merk('klasse') || '7', schwierigkeit: 'Mittel', anzahl: typ === 'karten' ? '' : '12', karteart: 'Begriffe', prompt: '', answer: '', rest: '', parsed: null }
  }
  cr.schritt = cr.schritt || (cr.prompt ? 2 : 1)
  if (cr.folge && cr.schritt < 2) cr.schritt = 2
  if (cr.thema || cr.prompt) entwurfSichern() // ein leeres Formular überschreibt keinen anderen Entwurf
  const re = () => { const y = window.scrollY; hooks.neu(); window.scrollTo(0, y) }
  const geheZu = n => { cr.schritt = n; cr.err = cr.err2 = ''; entwurfSichern(); hooks.neu(); window.scrollTo(0, 0) }
  neuZeichnen = re
  const T = TYPEN[cr.typ]
  const foto = cr.quelle === 'foto'
  const body = h('div', { class: 'seite', style: 'padding-bottom:24px' })
  ansicht = body
  root.replaceChildren(h('div', { class: 'screen nv' },
    h('div', { class: 'top' }, h('button', { class: 'x', 'aria-label': 'Zurück', onclick: () => hooks.zurueck() }, '←'), h('span', null, T.name),
      h('span', { class: 'schritt-zahl' }, 'Schritt ' + cr.schritt + ' von 3')),
    body))
  const stufe = (STUFEN.find(([w]) => w === cr.klasse) || [, cr.klasse])[1]

  // ── Schritt 1: Material ──
  if (cr.schritt === 1) {
    const quelle = (q, text, icon) => h('button', { class: 'btn' + (cr.quelle === q ? '' : ' ghost'), style: 'height:44px', 'aria-pressed': String(cr.quelle === q), onclick: () => { cr.quelle = q; entwurfSichern(); re() } }, symEl(icon), text)
    body.append(
      h('div', { class: 'lbl' }, '1 · Was hast du?'),
      h('div', { class: 'zwei' }, quelle('text', 'Thema oder Text', 'text'), quelle('foto', 'Ich habe ein Foto', 'foto')),
      foto && teilenMoeglich() ? h('label', { class: 'kiapp-wahl' },
        h('input', { type: 'checkbox', checked: kiApp(), onchange: e => { kiAppSetzen(e.target.checked); if (!e.target.checked) fotoSetzen(null); re() } }),
        h('span', null, h('b', null, 'Ich habe eine KI-App auf diesem Handy'), h('br'), 'Zum Beispiel ChatGPT. Dann schickt Hirnfutter Foto und Auftrag mit einem Tipp dorthin.')) : null,
      foto && kiApp() && teilenMoeglich() ? fotoBereich(re)
        : foto ? h('div', { class: 'fb', style: 'background:var(--surface-2)' }, h('span', null, '📷'),
          h('div', null, 'Das Foto hängst du gleich bei der KI an, zusammen mit dem Auftrag. Hirnfutter selbst sieht es nicht. Achte darauf, dass keine Namen oder Noten darauf stehen.')) : null,
      h('textarea', { class: 'in', style: 'min-height:' + (foto ? '64px' : '110px'),
        placeholder: foto ? 'Worum geht es? Zum Beispiel «Unit 3, nur die Wörter auf Seite 42». Freiwillig.'
          : cr.typ === 'karten' ? 'Thema oder Text einfügen, zum Beispiel eine Wörterliste.' : 'Thema oder Text eines bestehenden Blatts einfügen. Es dient als Vorlage.',
        oninput: e => { cr.thema = e.target.value; entwurfSichern() } }, cr.thema),
      h('div', { class: 'zwei' }, feld('Fach', sel('fach', Object.keys(MIX))), feld('Schulstufe', sel('klasse', STUFEN))),
      h('div', { class: 'zwei' }, (cr.typ === 'karten' ? feld('Anzahl (leer = alle)', h('input', { class: 'in', type: 'number', min: '1', inputmode: 'numeric', placeholder: 'alle aus der Liste', value: cr.anzahl, oninput: e => { cr.anzahl = e.target.value; entwurfSichern() } })) : feld('Anzahl', sel('anzahl', ['6', '8', '10', '12', '15', '20']))), cr.typ === 'karten' ? feld('Kartenart', sel('karteart', ['Begriffe', 'Vokabeln', 'Fakten', 'Frage und Antwort'])) : null),
      cr.typ === 'test' ? feld('Schwierigkeit', sel('schwierigkeit', ['Leicht', 'Mittel', 'Schwer'])) : null,
      h('button', { class: 'btn', onclick: () => {
        if (!foto && !cr.thema.trim()) { cr.err = 'Bitte zuerst ein Thema oder einen Text eingeben.'; return re() }
        cr.err = ''; merk('fach', cr.fach); merk('klasse', cr.klasse)
        const thema = foto ? 'Das Material steht auf dem Foto, das ich mit diesem Auftrag anhänge. Lies alles darauf sorgfältig.' + (cr.thema.trim() ? '\nHinweis dazu: ' + cr.thema.trim() : '') : cr.thema.trim()
        cr.prompt = (cr.typ === 'karten' ? promptKarten : promptTest)({ ...cr, thema, blatt: true })
        cr.kopiert = false; cr.geteilt = false
        geheZu(2)
      } }, 'Weiter', symEl('weiter')),
      cr.err ? h('div', { class: 'fb no' }, cr.err) : null)
    return
  }

  // Zusammenfassung von Schritt 1
  if (cr.folge) body.append(h('div', { class: 'fb', style: 'background:var(--vio-l);color:var(--vio)' }, h('span', null, '↻'), h('div', null, 'Der Auftrag für ein Übungsset zu den Fehlern in «' + (cr.vonTitel || '') + '» ist fertig.')))
  else body.append(fertig(1, foto ? 'Foto' : 'Material', [cr.fach, stufe, foto ? (fotoDatei && kiApp() ? 'Foto bereit' : 'Foto hängst du bei der KI an') + (cr.thema.trim() ? ' · «' + cr.thema.trim().slice(0, 40) + '»' : '') : '«' + cr.thema.trim().slice(0, 50) + (cr.thema.trim().length > 50 ? ' …' : '') + '»'].join(' · '), () => geheZu(1)))

  const auftrag = h('details', { class: 'auftrag' }, h('summary', { style: 'font-size:13px;font-weight:700;color:var(--text-2);cursor:pointer' }, 'Auftrag ansehen'), h('div', { class: 'mono' }, cr.prompt))
  const kopierKnopf = (text, nachher) => {
    const cb = h('button', { class: 'btn', style: 'height:48px', onclick: async () => {
      // Klappt das Kopieren nicht, den Auftrag aufklappen: Dann lässt er sich von Hand markieren.
      if (!await kopieren(cr.prompt, cb)) { auftrag.open = true; return }
      cr.kopiert = true; entwurfSichern(); nachher?.()
    } }, symEl('kopieren'), text)
    return cb
  }
  const kiReihe = () => h('div', { class: 'ki-reihe' }, KIS.map(([n, u]) => h('a', { class: 'btn ghost ki', href: u, target: '_blank', rel: 'noopener' }, n + ' ↗')))

  // ── Schritt 2: bei der KI ──
  if (cr.schritt === 2 && foto && kiApp() && kannFotoTeilen()) {
    // Foto und Auftrag zusammen über das Teilen-Fenster an die KI-App. Den Auftrag zusätzlich kopieren:
    // Manche Apps nehmen nur das Foto, dann reicht dort «Einfügen».
    const meldung = h('div')
    const danach = h('div', { class: 'ki-wahl', hidden: !cr.geteilt },
      h('div', { style: 'font-size:15px;font-weight:700;color:var(--text-2);line-height:1.4' }, 'Gesendet. Prüfe in der KI-App, ob der Auftrag beim Foto steht. Fehlt er: Eingabefeld gedrückt halten und «Einfügen» tippen. Dann senden.'),
      h('div', { style: 'font-size:15px;font-weight:600;color:var(--text-2);line-height:1.4;margin-top:6px' }, 'Wenn die KI fertig ist: Kopiere ihre ganze Antwort und komm hierher zurück.'),
      h('button', { class: 'btn ghost', style: 'height:44px', onclick: () => geheZu(3) }, 'Ich habe die Antwort kopiert →'))
    const senden = h('button', { class: 'btn', style: 'height:52px', onclick: async () => {
      navigator.clipboard?.writeText(cr.prompt).catch(() => {}) // im selben Tipp, damit es auch auf dem iPhone klappt
      try {
        await navigator.share({ files: [fotoDatei], text: cr.prompt, title: 'Auftrag für die KI' })
        cr.kopiert = cr.geteilt = true; entwurfSichern(); danach.hidden = false; meldung.replaceChildren()
      } catch (e) {
        if (e?.name === 'AbortError') return // Teilen-Fenster ohne Auswahl geschlossen
        meldung.replaceChildren(h('div', { class: 'fb no' }, h('span', null, '✕'), h('div', null, 'Das Senden hat nicht geklappt. Nimm den Weg unten: Auftrag kopieren und das Foto bei der KI anhängen.')))
        weg.open = true
      }
    } }, symEl('senden'), cr.geteilt ? 'Nochmals an KI senden' : 'An KI senden')
    // Der bisherige Weg für alle ohne KI-App (KI im Browser)
    const altDanach = h('div', { class: 'ki-wahl', hidden: !cr.kopiert || cr.geteilt },
      h('div', { style: 'font-size:15px;font-weight:700;color:var(--text-2);line-height:1.4' }, 'Kopiert. Öffne eine KI, füge den Auftrag ein und hänge dein Foto an (meist über «+» oder die Büroklammer). Dann senden.'),
      kiReihe(),
      h('button', { class: 'btn ghost', style: 'height:44px', onclick: () => geheZu(3) }, 'Ich habe die Antwort kopiert →'))
    const weg = h('details', { class: 'auftrag' },
      h('summary', { style: 'font-size:13px;font-weight:700;color:var(--text-2);cursor:pointer' }, 'Ohne KI-App: Auftrag kopieren'),
      h('div', { class: 'stack', style: 'margin-top:8px' }, kopierKnopf('Auftrag kopieren', () => { altDanach.hidden = false }), altDanach, auftrag))
    body.append(
      h('div', { class: 'lbl', style: 'margin-top:6px' }, '2 · Bei der KI'),
      h('div', { class: 'foto-vorschau klein' }, h('img', { src: fotoUrl, alt: 'Dein Foto' }),
        h('div', { style: 'font-size:15px;font-weight:600;color:var(--text-2);line-height:1.4' }, 'Tippe auf «An KI senden» und wähle deine KI-App, zum Beispiel ChatGPT, Gemini oder Claude. Foto und Auftrag kommen zusammen dort an.')),
      senden, meldung, danach, weg)
    return
  }
  if (cr.schritt === 2) {
    const danach = h('div', { class: 'ki-wahl', hidden: !cr.kopiert },
      h('div', { style: 'font-size:15px;font-weight:700;color:var(--text-2);line-height:1.4' }, foto
        ? 'Kopiert. Öffne eine KI, füge den Auftrag ein und hänge dein Foto an (meist über «+» oder die Büroklammer). Dann senden.'
        : 'Kopiert. Öffne eine KI, füge den Auftrag ein und sende ihn ab.'),
      kiReihe(),
      h('div', { style: 'font-size:15px;font-weight:600;color:var(--text-2);line-height:1.4;margin-top:6px' }, 'Wenn die KI fertig ist: Kopiere ihre ganze Antwort und komm hierher zurück.'),
      h('button', { class: 'btn ghost', style: 'height:44px', onclick: () => geheZu(3) }, 'Ich habe die Antwort kopiert →'))
    body.append(
      h('div', { class: 'lbl', style: 'margin-top:6px' }, '2 · Bei der KI'),
      h('div', { style: 'font-size:15px;font-weight:600;color:var(--text-2);line-height:1.4' }, foto
        ? 'Hirnfutter hat einen Auftrag für die KI geschrieben. Kopiere ihn. Bei der KI fügst du ihn ein und hängst das Foto dazu.'
        : 'Hirnfutter hat einen Auftrag für die KI geschrieben. Kopiere ihn und füge ihn bei einer KI ein.'),
      kopierKnopf(cr.kopiert ? 'Nochmals kopieren' : 'Auftrag kopieren', () => { danach.hidden = false }),
      danach,
      auftrag,
      // Wer von Hand kopiert hat, kommt auch ohne Kopierknopf weiter.
      cr.kopiert ? null : h('button', { class: 'lnk', style: 'align-self:flex-start', onclick: () => { cr.kopiert = true; entwurfSichern(); danach.hidden = false } }, 'Ich habe den Auftrag von Hand kopiert'))
    return
  }

  // ── Schritt 3: Antwort zurückbringen ──
  body.append(fertig(2, 'Bei der KI', cr.geteilt ? 'Foto und Auftrag an die KI gesendet' : cr.kopiert ? 'Auftrag kopiert' + (foto ? ', Foto angehängt' : '') : 'Auftrag noch nicht kopiert', () => geheZu(2), 'Nochmals'))
  const ta = h('textarea', { class: 'in code', style: 'min-height:90px', placeholder: 'Oder die Antwort von Hand hier einfügen …', oninput: e => { cr.answer = e.target.value; entwurfSichern() } }, cr.answer)
  const einf = h('button', { class: 'btn', onclick: async () => {
    let t = ''
    try { t = await navigator.clipboard.readText() } catch {}
    if (!t.trim()) { cr.err2 = 'Das Einfügen hat nicht geklappt. Füge die Antwort unten von Hand ein und tippe auf «' + fertigText() + '».'; cr.hand = true; return re() }
    cr.answer = t; cr.err2 = ''; entwurfSichern(); lies(); re()
  } }, symEl('einfuegen'), cr.teil ? 'Fortsetzung einfügen' : 'Antwort einfügen')
  einfKnopf = einf
  body.append(
    h('div', { class: 'lbl', style: 'margin-top:6px' }, '3 · Antwort der KI zurückbringen'),
    h('div', { style: 'font-size:15px;font-weight:600;color:var(--text-2);line-height:1.4' }, cr.teil ? 'Bisher gelesen: ' + cr.teil.length + ' Einträge. Kopiere jetzt die Fortsetzung der KI.' : 'Kopiere bei der KI die ganze Antwort und tippe dann hier. Das Set öffnet sich danach von selbst.'),
    einf, ta,
    h('button', { class: 'btn ghost', style: 'height:44px', onclick: () => {
      if (!cr.answer.trim()) { cr.err2 = 'Bitte zuerst die Antwort der KI einfügen.'; cr.parsed = null } else { cr.err2 = ''; lies() }
      re()
    } }, symEl('erstellen'), fertigText()),
    cr.err2 ? h('div', { class: 'fb no' }, cr.err2) : null)

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
      h('button', { class: 'btn ghost', style: 'height:44px', onclick: () => { cr.teil = p.items; cr.teilTitel = p.titel; cr.answer = ''; cr.parsed = null; entwurfSichern(); re(); window.scrollTo(0, 0) } }, 'Fortsetzung holen'))
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
  entwurfWeg()
  fotoSetzen(null)
  const hinweis = p.problems.length ? (p.problems.length === 1 ? 'Ein Teil der Antwort war unlesbar und fehlt.' : p.problems.length + ' Teile der Antwort waren unlesbar und fehlen.') : ''
  cr = null
  hooks.gespeichert(set, hinweis)
}
