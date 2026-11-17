import { SAISONEN, saisonKaufbar, saisonSichtbar } from './saison.js'
// Schriften aus dem eigenen Paket statt von Google (Datenschutz, und offline verfügbar).
import '@fontsource/nunito/latin-400.css'
import '@fontsource/nunito/latin-500.css'
import '@fontsource/nunito/latin-600.css'
import '@fontsource/nunito/latin-700.css'
import '@fontsource/nunito/latin-800.css'
import '@fontsource/bitter/latin-400.css'
import '@fontsource/bitter/latin-500.css'
import '@fontsource/bitter/latin-600.css'
import '@fontsource/bitter/latin-400-italic.css'
import './style.css'
import {
  getSets, rememberSet, forgetSet,
  getProgress, getCardState, setCardState, resetProgress,
  getSessionCount, bumpSessionCount,
  getSetSettings, saveSetSettings,
  requestPersistence, fnv,
  getBestmarke, getKruemel, addKruemel, getTage, bumpTag,
  getSerie, serieFortschreiben, zahleKruemel,
} from './storage.js'
import {
  PLAETZE, HINTERGRUENDE, getBesitz, besitzt, kaufen, schluessel,
  getLook, setLook, avatarHtml, teilVorschauHtml, BEDINGUNGEN, verdient,
} from './shop.js'
import {
  today, getDueCards, getAllCardsSorted, getDeckStats, nextBox, ROUND_SIZE,
  kruemelFuerAufstieg, stufeFuer, SITZT_AB, sitztCount,
} from './leitner.js'
import { pruefeAntwort } from './antwort.js'
import './style2.css'
import { h, kopieren, kopierenMitKi, mathHtml, mathFuellen } from './dom.js'
import { getFehler, istFehler, istPausiert, setzePause, setzePruefung, sicherungFaellig, sicherungSpaeter } from './storage.js'
import { toItems, promptErklaere, promptFehlerErklaerung, frageText, solText } from './format.js'
import { getLib, getLibSet, saveLibSet, deleteLibSet, libDeck, neueId } from './bibliothek.js'
import { gradeAus, bewerte } from './fortschritt.js'
import { renderAufgabe } from './typen.js'
import { renderWahl, renderErstellen, folgeVorbereiten, zuruecksetzen, TYP_INFO } from './erstellen.js'
import { renderBibliothek, bibZurueck, sicherungLaden } from './ansicht-bib.js'
import { renderSatz } from './blatt.js'
import { alleAbgleichen, serverBereit, getLehrercode, anzeigeName } from './klassen.js'
import { klassencodeDialog, renderLehrer } from './ansicht-klassen.js'
import { sym } from './symbole.js'
import { updateLibSet } from './bibliothek.js'

// ── Sets kommen als Link ─────────────────────────────────────────────────────
//
// Ein Set steckt vollständig in der Adresse: `#d=z…` — deflate-raw, base64url.
// Es wird nichts geladen und nichts hochgeladen. Die Kodierung muss exakt zu der
// passen, die PULT erzeugt, sonst ist jeder verteilte Link wertlos.

function unb64(s) {
  const t = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** `z…` = deflate-raw, `r…` = rohes JSON. */
async function unpack(token) {
  const data = unb64(token.slice(1))
  if (token[0] === 'r') return JSON.parse(new TextDecoder().decode(data))
  if (typeof DecompressionStream === 'function') {
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
    return JSON.parse(await new Response(stream).text())
  }
  const { inflateSync, strFromU8 } = await import('fflate')
  return JSON.parse(strFromU8(inflateSync(data)))
}

/**
 * Nutzlast → Deck. Die Karten-ID ist der Hash der **Vorderseite**: Link-Decks
 * haben keine IDs, und die Klassenseite rechnet mit genau diesem Schlüssel.
 */
function toDeck(name, cards) {
  return {
    name,
    cards: cards
      .filter(c => Array.isArray(c) && c[0] && c[1])
      .map(([front, back]) => ({ id: fnv(front), t: 'karte', front: String(front), back: String(back) })),
  }
}

// ── State ────────────────────────────────────────────────────────────────────
const state = {
  view: 'home',    // home | set | study | summary
  deck: null,
  queue: [],
  queueIdx: 0,
  flipped: false,
  sessionGrades: [],
  sessionFehler: [],     // falsch oder beinahe in dieser Runde, für «Alle Fehler erklären»
  letzteAntwort: null,
  tipp: null,           // { eingabe, ergebnis } im Tippmodus, sonst null
  faellig: new Set(),   // Karten-IDs, die zu Sitzungsbeginn dran waren
  ausbeute: 0,          // in dieser Einheit verdiente Krümel
  serieBonus: null,     // { bonus, neueMarke } falls eine Serienmarke fiel
  satz: null,           // Aufgabenset: null = Üben, 'blatt' | 'test' = Blattansicht
  erstTyp: null,        // Erstellen: karten | test | null (Auswahl)
}

const root = document.getElementById('app')

function navigate(view, params = {}) {
  // Woher man ein Set geöffnet hat: dorthin führt die Zurück-Taste wieder.
  if (view === 'set' && (state.view === 'home' || state.view === 'bibliothek')) state.von = state.view
  Object.assign(state, { view, flipped: false, tipp: null, satz: null, ...params })
  verlaufScharf()
  render()
  window.scrollTo(0, 0)
}

// ── Zurück-Taste ─────────────────────────────────────────────────────────────
//
// Die App ist eine einzige Seite. Ohne das hier würde die Zurück-Taste des Handys
// (oder des Browsers) die App verlassen, mitten im Üben. Darum liegt, sobald man
// nicht auf dem Start ist, genau ein zusätzlicher Eintrag im Verlauf. «Zurück»
// verbraucht ihn, die App geht eine Ebene hoch und legt ihn wieder hin.
// Erst auf dem Start verlässt «Zurück» die App.

let verlaufIstScharf = false
function verlaufScharf() {
  if (state.view === 'home' || verlaufIstScharf) return
  try { history.pushState({ hf: 1 }, '') ; verlaufIstScharf = true } catch {}
}

/** Ein Fenster (Klassencode, Anleitung) geht auch auf dem Start auf: «Zurück» soll es schliessen, nicht die App. */
function fensterScharf() {
  if (verlaufIstScharf) return
  try { history.pushState({ hf: 1 }, ''); verlaufIstScharf = true } catch {}
}

/** Eine Ebene hoch. */
function eineEbeneHoch() {
  const fenster = document.querySelector('.kc-hg, #ios-guide, #hilfe')
  if (fenster) { fenster.remove(); return }
  const v = state.view
  if (v === 'study' || v === 'summary') state.deck?.virtuell ? navigate('home') : navigate('set')
  else if (v === 'set' && state.satz) navigate('set')
  else if (v === 'set') navigate(state.von === 'bibliothek' ? 'bibliothek' : 'home')
  else if (v === 'erstellen' && state.erstTyp) { zuruecksetzen(); navigate('erstellen', { erstTyp: null }) }
  else if (v === 'bibliothek' && bibZurueck()) render()
  else if (v === 'lehrer') navigate('bibliothek')
  else navigate('home')
}

window.addEventListener('popstate', () => {
  if ((location.hash || '').startsWith('#d=')) return // ein Set-Link: das übernimmt openFromHash
  verlaufIstScharf = false
  if (state.view === 'home' && !document.querySelector('.kc-hg, #ios-guide, #hilfe')) return
  eineEbeneHoch()
  verlaufScharf()
})

function render() {
  if (state.view === 'home')         renderHome()
  else if (state.view === 'set' && state.satz && !state.deck.cards.every(c => !c.t || c.t === 'karte')) renderSatz(root, state.deck, { ...hooksBlatt, modus: state.satz })
  else if (state.view === 'set')     renderSet()
  else if (state.view === 'study')   renderStudy()
  else if (state.view === 'summary') renderSummary()
  else if (state.view === 'laden')   renderLaden()
  else if (state.view === 'erstellen') {
    if (state.erstTyp) renderErstellen(root, state.erstTyp, hooksNeu)
    else renderWahl(root, hooksNeu)
  }
  else if (state.view === 'bibliothek') renderBibliothek(root, hooksBib)
  else if (state.view === 'lehrer') renderLehrer(root, hooksLehrer)
  mathFuellen(root)
}

// ── Neue Bereiche: Navigation und Verbindungen ───────────────────────────────

const NAV = [['home', 'Üben', 'ueben'], ['erstellen', 'Erstellen', 'erstellen'], ['bibliothek', 'Bibliothek', 'bibliothek']]
const navListe = () => serverBereit() && getLehrercode() ? [...NAV, ['lehrer', 'Klassen', 'klassen']] : NAV

function navHtml(aktiv) {
  return `<nav class="reiter" aria-label="Bereiche">${navListe().map(([id, name, icon]) =>
    `<button class="reiter-knopf${id === aktiv ? ' on' : ''}" data-action="nav" data-ziel="${id}"${id === aktiv ? ' aria-current="page"' : ''}>${sym(icon)}<span>${name}</span></button>`).join('')}</nav>`
}
function navEl(aktiv) {
  const t = document.createElement('template')
  t.innerHTML = navHtml(aktiv)
  return t.content.firstElementChild
}
/** Shop-Knopf rechts in der Kopfzeile. Den Krümelstand zeigt die Hirn-Leiste auf dem Start. */
function shopKnopfHtml() {
  return `<button class="kopf-shop" data-action="laden">${sym('laden')}<span>Shop</span></button>`
}
function kopfEl(titel) {
  const kopf = h('header', { class: 'app-header' },
    h('div', { class: 'logo' }, h('img', { class: 'logo-hirn', src: `${import.meta.env.BASE_URL}hirn.png`, alt: '', width: 30, height: 30 }), h('span', { class: 'logo-text' }, titel)))
  if (titel !== 'Lehrermodus') kopf.insertAdjacentHTML('beforeend', shopKnopfHtml()) // im Lehrermodus bleibt die Kopfzeile ruhig
  return kopf
}
function geheZu(ziel) {
  if (location.hash) history.replaceState(null, '', location.pathname + location.search)
  if (ziel === 'home') navigate('home')
  else if (ziel === 'erstellen') { zuruecksetzen(); navigate('erstellen', { erstTyp: null }) }
  else navigate(ziel)
}

const hooksNeu = {
  kopf: kopfEl,
  nav: () => navEl('erstellen'),
  waehle: typ => navigate('erstellen', { erstTyp: typ }),
  zurueck: () => { zuruecksetzen(); navigate('erstellen', { erstTyp: null }) },
  neu: () => render(),
  gespeichert: (set, hinweis) => {
    if (hinweis) showToast('Gespeichert: «' + set.titel + '». ' + hinweis + ' Nachbessern kannst du in der Bibliothek unter «⋯» → Bearbeiten.', 'info', 7000)
    else showToast('Gespeichert: «' + set.titel + '»', 'success')
    navigate('set', { deck: libDeck(set), erstTyp: null })
  },
}
const hooksBib = {
  kopf: kopfEl,
  nav: () => navEl('bibliothek'),
  neu: () => render(),
  oeffneLib: id => {
    const s = getLibSet(id)
    if (s?.neu) { s.neu = false; updateLibSet(s, null, { still: true }) } // «NEU» verschwindet, sobald man das Set geöffnet hat
    if (s) navigate('set', { deck: libDeck(s) })
  },
  oeffneLink: name => { const e = getSets().find(x => x.name === name); if (e) navigate('set', { deck: toDeck(e.name, e.cards) }) },
  vergiss: name => { forgetSet(name); render() },
  linkOeffnen: hash => { location.hash = hash },
  lehrer: () => navigate('lehrer'),
}
const hooksLehrer = {
  kopf: kopfEl,
  nav: () => navEl('lehrer'),
  weg: () => navigate('bibliothek'),
  heim: () => navigate('home'),
  angemeldet: () => navigate('lehrer'), // nach der Anmeldung ausdrücklich im Lehrermodus bleiben
  erstellen: () => { zuruecksetzen(); navigate('erstellen', { erstTyp: null }) },
}
const hooksBlatt = {
  folge: (prompt, set) => { folgeVorbereiten(prompt, set); navigate('erstellen', { erstTyp: 'test' }) },
  zurueck: () => navigate('home'),
  ueben: () => navigate('set'),
  faellig: () => getDeckStats(state.deck, getProgress(state.deck.name)).dueCount,
  abschluss: () => serieFortschreiben(today(), getTage(), nichtsMehrFaellig()),
}

/** Alle Sets, die die App kennt: Link-Sets (Karten) und eigene. */
function alleDecks() {
  return [...getLib().map(libDeck), ...getSets().map(e => toDeck(e.name, e.cards))]
}


// ── Start & Adresse ──────────────────────────────────────────────────────────

// Lehrpersonen bekommen eine eigene Adresse (…/lehrer). In der Schüleransicht steht nichts davon.
// Nach der Anmeldung erscheint auf diesem Gerät der Reiter «Klassen», die Adresse braucht es dann nicht mehr.
const LEHRER_PFAD = /\/lehrer\/?$/i
function lehrerAdresse() {
  if (!LEHRER_PFAD.test(location.pathname)) return false
  try { history.replaceState(null, '', import.meta.env.BASE_URL) } catch {}
  return serverBereit()
}

async function openFromHash() {
  const hash = location.hash || ''
  if (!hash.startsWith('#d=') && lehrerAdresse()) { navigate('lehrer'); return }
  if (!hash.startsWith('#d=')) { navigate('home'); return }

  const token = hash.slice(3)
  try {
    const raw = await unpack(token)
    // Link aus der Adresse nehmen: Sonst würde «Zurück» oder Neuladen dasselbe Set nochmals speichern.
    try { history.replaceState(history.state, '', location.pathname + location.search) } catch {}
    if (raw && raw.v === 2) {
      const r = toItems(raw)
      if (!r.items.length) { showToast('Das Set enthält keine lesbaren Aufgaben.', 'error'); navigate('home'); return }
      const set = saveLibSet({ id: neueId(), titel: String(raw.titel || 'Ohne Titel'), fach: String(raw.fach || ''), klasse: '7', created: Date.now(),
        typ: r.items.every(i => i.t === 'karte') ? 'karten' : 'test', items: r.items })
      requestPersistence()
      navigate('set', { deck: libDeck(set) })
      return
    }
    const deck = toDeck(String(raw.n || 'Ohne Titel'), raw.c || [])
    if (!deck.cards.length) { showToast('Das Set enthält keine vollständigen Karten.', 'error'); navigate('home'); return }
    // Merken, damit die App auch ohne Link und ohne Netz brauchbar bleibt.
    rememberSet(deck.name, deck.cards.map(c => [c.front, c.back]))
    requestPersistence()
    navigate('set', { deck })
  } catch (e) {
    console.warn('[Link] konnte nicht gelesen werden:', e)
    showToast('Dieser Link lässt sich nicht lesen.', 'error')
    navigate('home')
  }
}

window.addEventListener('hashchange', openFromHash)

/** Zurück zur Übersicht — die Adresse muss den alten Link loswerden. */
function goHome() {
  if (location.hash) {
    history.replaceState(null, '', location.pathname + location.search)
  }
  navigate('home')
}

/** Krümelstand, Stufe und Serie — der Dauerzustand, nicht die einzelne Sitzung. */
function futterLeiste() {
  const { total } = getKruemel()
  const { stufe, naechste, anteil } = stufeFuer(total)
  const serie = getSerie()
  const lebt  = serie.letzterTag === today() || serie.letzterTag === gestern()

  return `
    <div class="futter">
      <div class="futter-links">
        <button class="futter-avatar" data-action="laden" title="Zum Shop" aria-label="Dein Hirn: zum Shop">
          ${avatarHtml(getLook())}
        </button>
      </div>
      <div class="futter-text">
        <div class="futter-kopf">
          <span class="futter-stufe">${stufe.name}</span>
          ${lebt && serie.laenge > 1
            ? `<span class="futter-serie" title="Tage in Folge gefüttert">🔥 ${serie.laenge}</span>`
            : ''}
          <span class="futter-zahl">${total.toLocaleString('de-CH')} Krümel</span>
        </div>
        <div class="futter-bar">
          <div class="futter-bar-fill" style="width:${Math.round(anteil * 100)}%"></div>
        </div>
        <div class="futter-ziel">
          ${naechste
            ? `noch ${(naechste.ab - total).toLocaleString('de-CH')} bis «${naechste.name}»`
            : 'höchste Stufe erreicht'}
        </div>
      </div>
    </div>
  `
}

function gestern() {
  const d = new Date(today() + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/** «sitzt» = Fach 4 oder 5 — eine Schwelle, ein Wort, auch auf der Klassenseite. */
function sitztAnteil(deck, progress) {
  const total = deck.cards.length
  if (!total) return { anteil: 0, sitzt: 0, total: 0, farbe: 'var(--text-3)' }
  const sitzt  = sitztCount(deck, progress)
  const anteil = Math.round(sitzt / total * 100)
  // Ermutigen statt bewerten: Was noch nicht sitzt, ist neutral oder unterwegs, nie rot.
  const farbe  = anteil >= 66 ? 'var(--green)'
    : anteil > 0 ? 'var(--accent-hover)'
    : 'var(--text-3)'
  return { anteil, sitzt, total, farbe }
}

/**
 * Der Meilenstein pro Set. Bewusst an `belohnt` gehängt, nicht ans aktuelle Fach:
 * sonst wäre ausgerechnet die einzige sichtbare Auszeichnung das, was sich mit
 * zweimal «Alles üben» in vier Minuten holen liesse.
 */
function istDurchgefuettert(deck, progress) {
  return deck.cards.length > 0 && deck.cards.every(c => (progress[c.id]?.belohnt ?? 1) >= 5)
}

// ── Übersicht ────────────────────────────────────────────────────────────────

/** «Prüfung heute», «Prüfung morgen», «Prüfung in 5 Tagen». */
function pruefText(datum) {
  const n = Math.round((new Date(datum + 'T00:00:00Z') - new Date(today() + 'T00:00:00Z')) / 86400000)
  return n <= 0 ? 'Prüfung heute' : n === 1 ? 'Prüfung morgen' : 'Prüfung in ' + n + ' Tagen'
}
const datumLang = d => new Date(d + 'T12:00:00').toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long' })

function renderHome() {
  const alle = [
    ...getLib().map(s => ({ deck: libDeck(s), typ: s.typ })),
    ...getSets().map(e => ({ deck: toDeck(e.name, e.cards), typ: 'karten' })),
  ]
  const eintraege = alle.filter(e => !istPausiert(e.deck.name)) // «vom Start genommen» bleibt nur in der Bibliothek
  const nPause = alle.length - eintraege.length

  const due = e => getDeckStats(e.deck, getProgress(e.deck.name)).dueCount > 0 ? 1 : 0
  // Prüfungstermine (setzt der Schüler selbst auf der Set-Seite): Was bald geprüft wird, steht zuoberst.
  const heute = today()
  const pruef = e => getSetSettings(e.deck.name).pruefung
  const bald = eintraege.filter(e => pruef(e) && pruef(e) >= heute).sort((a, b) => pruef(a).localeCompare(pruef(b)))
  const vorbei = eintraege.filter(e => pruef(e) && pruef(e) < heute)
  const ohne = eintraege.filter(e => !bald.includes(e))
  const sortiert = ohne.map((e, i) => ({ e, i, d: due(e) })).sort((a, b) => b.d - a.d || a.i - b.i).map(x => x.e)
  const zeigen = sortiert.slice(0, 8)
  const nFehler = fehlerKarten().length
  const dran = zeigen.filter(e => due(e)), rest = zeigen.filter(e => !due(e))

  root.innerHTML = `
    <div class="screen home-screen">
      <header class="app-header">
        <div class="logo"><img class="logo-hirn" src="${import.meta.env.BASE_URL}hirn.png" alt="" width="30" height="30" /><span class="logo-text">Hirnfutter</span></div>
        ${shopKnopfHtml()}
      </header>

      ${installBanner()}
      ${alle.length && sicherungFaellig() ? `<div class="install-hint">
        <div class="install-hint-text">Deine Sets, dein Fortschritt und deine Krümel liegen nur auf diesem Gerät. Sichere sie als Datei, dann geht nichts verloren.</div>
        <div class="install-hint-actions"><button class="btn btn-primary btn-sm" data-action="sichern">${sym('sichern')}Jetzt sichern</button>
        <button class="btn btn-ghost btn-sm" data-action="sichern-spaeter">Später</button></div></div>` : ''}

      <main class="home-main">
        ${alle.length === 0 ? '' : futterLeiste()}
        ${alle.length === 0 ? renderEmptyState() : !eintraege.length ? `
          <div class="alles-gut">Alle deine Sets sind vom Start genommen.</div>
          <button class="sammlung-link" style="background:none;border:0;width:100%" data-action="nav" data-ziel="bibliothek">Zur Bibliothek: dort kannst du sie wieder aufnehmen →</button>
          ${lpLink()}` : `
          ${vorbei.map(e => `<div class="pruef-vorbei"><span>Die Prüfung zu <b>«${escHtml(e.deck.name)}»</b> ist vorbei. Brauchst du das Set noch auf dem Start?</span>
            <div class="pruef-vorbei-akt"><button class="btn btn-primary btn-sm" data-action="pruef-fertig" data-set-name="${escAttr(e.deck.name)}">Vom Start nehmen</button>
            <button class="btn btn-ghost btn-sm" data-action="pruef-behalten" data-set-name="${escAttr(e.deck.name)}">Behalten</button></div></div>`).join('')}
          ${bald.length ? `<h2 class="abschnitt">Bald Prüfung</h2><div class="set-list">${bald.map(e => renderSetRow(e, pruefText(pruef(e)))).join('')}</div>` : ''}
          ${nFehler ? `<button class="fehler-knopf" data-action="fehler"><span><b>Meine Fehler üben</b><br><small>${nFehler} ${nFehler === 1 ? 'Aufgabe' : 'Aufgaben'}, die du zuletzt falsch hattest</small></span><span class="fehler-pfeil">→</span></button>` : ''}
          ${dran.length ? `<h2 class="abschnitt">Heute dran</h2><div class="set-list">${dran.map(e => renderSetRow(e)).join('')}</div>` : bald.length ? '' : `<div class="alles-gut">✓ Für heute ist alles gefüttert.</div>`}
          ${rest.length ? `<h2 class="abschnitt">${dran.length ? 'Weitere Sets' : 'Deine Sets'}</h2><div class="set-list">${rest.map(e => renderSetRow(e)).join('')}</div>` : ''}
          ${eintraege.length > zeigen.length || nPause ? `<button class="sammlung-link" style="background:none;border:0;width:100%" data-action="nav" data-ziel="bibliothek">Alle ${alle.length} Sets in der Bibliothek${nPause ? ` (${nPause} vom Start genommen)` : ''} →</button>` : ''}
          ${lpLink()}
        `}
        <button class="sammlung-link" style="background:none;border:0;width:100%" data-action="hilfe">${sym('hilfe')}So funktioniert Hirnfutter →</button>
      </main>

      ${navHtml('home')}
    </div>
  `
}

/** Angemeldete Lehrperson: Sie braucht keinen Klassencode, sondern den Weg zu ihren Klassen. */
const istLehrperson = () => serverBereit() && !!getLehrercode()
function lpLink() {
  if (!serverBereit()) return ''
  return istLehrperson()
    ? '<button class="sammlung-link" style="background:none;border:0;width:100%" data-action="nav" data-ziel="lehrer">' + sym('klassen') + 'Zum Lehrermodus: Klassen und Veröffentlichen →</button>'
    : '<button class="sammlung-link" style="background:none;border:0;width:100%" data-action="klassencode">' + sym('code') + 'Klassencode eingeben →</button>'
}

function renderEmptyState() {
  if (istLehrperson()) return `
    <div class="empty-state">
      <img class="empty-hirn" src="${import.meta.env.BASE_URL}hirn.png" alt="" width="120" height="120" />
      <h2>Noch kein Set</h2>
      <p>Erstelle dein erstes Set. Im Lehrermodus legst du es danach in eine Klasse.
         Hier unter «Üben» kannst du deine Sets auch selbst ausprobieren, so wie deine Schüler sie sehen.</p>
      <button class="btn btn-primary" data-action="nav" data-ziel="erstellen">${sym('erstellen')}Set erstellen</button>
      <button class="btn btn-ghost" data-action="nav" data-ziel="lehrer">${sym('klassen')}Zum Lehrermodus</button>
      <button class="btn btn-ghost" data-action="beispiel">${sym('beispiel')}Beispiel ausprobieren</button>
    </div>
  `
  return `
    <div class="empty-state">
      <img class="empty-hirn" src="${import.meta.env.BASE_URL}hirn.png" alt="" width="120" height="120" />
      <h2>Noch kein Set</h2>
      ${serverBereit() ? `<p>Hast du von deiner Lehrperson einen Klassencode bekommen? Dann tippe ihn ein, und ihre Sets erscheinen hier.
         Du kannst auch selbst ein Set erstellen.</p>
      <button class="btn btn-primary" data-action="klassencode">${sym('code')}Klassencode eingeben</button>
      <button class="btn btn-ghost" data-action="nav" data-ziel="erstellen">${sym('erstellen')}Eigenes Set erstellen</button>` : `<p>Erstelle ein Set aus einem Thema oder aus deinem Material.
         Was du einmal geöffnet hast, findest du hier wieder, auch ohne Internet.</p>
      <button class="btn btn-primary" data-action="nav" data-ziel="erstellen">${sym('erstellen')}Eigenes Set erstellen</button>`}
      <button class="btn btn-ghost" data-action="beispiel">${sym('beispiel')}Beispiel ausprobieren</button>
    </div>
  `
}

const TYP_TAB = { karten: 'KARTEN', test: 'AUFGABENSET' }

function renderSetRow({ deck, typ }, pruefung) {
  const progress = getProgress(deck.name)
  const stats    = getDeckStats(deck, progress)
  const total    = deck.cards.length
  const { anteil: sicher, farbe } = sitztAnteil(deck, progress)
  const fertig     = istDurchgefuettert(deck, progress)
  const lib = deck.kind === 'lib'
  const einheit = typ === 'karten' ? 'Karten' : 'Aufgaben'
  typ = typ === 'karten' ? 'karten' : 'test'

  return `
    <div class="set-row zeile-${typ}" role="button" tabindex="0" aria-label="${escAttr(deck.name)} öffnen" data-action="${lib ? 'open-lib' : 'open-set'}" data-set-name="${escAttr(deck.name)}" data-lib-id="${escAttr(deck.libId || '')}">
      <div class="set-row-main">
        <div class="set-row-name"><span class="typ-tab typ-${typ}">${TYP_TAB[typ] || ''}</span> ${deck.set?.neu ? '<span class="neu-chip">NEU</span>' : ''}${escHtml(deck.name)}</div>
        <div class="set-row-meta">
          <span class="secure-pct" style="color:${farbe}">${sicher}%</span>
          <span class="secure-label">sitzt</span>
          <div class="secure-bar"><div class="secure-bar-fill" style="width:${sicher}%;background:${farbe}"></div></div>
          <span class="set-row-count">${total} ${einheit}</span>
        </div>
      </div>
      ${typeof pruefung === 'string' && pruefung
        ? `<span class="due-badge pruef-badge">${escHtml(pruefung)}</span>`
        : stats.dueCount > 0
        ? `<span class="due-badge">${stats.dueCount} fällig</span>`
        : fertig
          ? `<span class="uptodate-badge" title="Alles in Stufe 5">durchgefüttert 🎉</span>`
          : `<span class="uptodate-badge">Erledigt ✓</span>`}
      ${lib ? '' : `<button class="btn btn-ghost btn-delete" data-action="forget-set" data-set-name="${escAttr(deck.name)}"
        title="Aus der Liste nehmen">✕</button>`}
    </div>
  `
}

// ── Ein Set ──────────────────────────────────────────────────────────────────

function renderSet() {
  const deck     = state.deck
  const progress = getProgress(deck.name)
  const stats    = getDeckStats(deck, progress)
  const settings = getSetSettings(deck.name)
  const total    = deck.cards.length
  const { anteil: sicher, sitzt, farbe } = sitztAnteil(deck, progress)
  const fertig     = istDurchgefuettert(deck, progress)
  const session    = getSessionCount(deck.name, today())
  const dueNow     = Math.min(stats.dueCount, ROUND_SIZE)
  const nurKarten  = deck.cards.every(c => !c.t || c.t === 'karte')

  const einheit = nurKarten ? 'Karten' : 'Aufgaben'
  root.innerHTML = `
    <div class="screen set-screen">
      <div class="kopf">
        <button class="kopf-x" data-action="home" aria-label="Zur Übersicht">←</button>
        <span class="kopf-t">Übersicht</span>
      </div>

      ${installBanner()}

      <main class="set-main">
        <h1 class="set-title">${escHtml(deck.name)}</h1>
        <div class="set-sub">${deck.fach ? escHtml(deck.fach) + ' · ' : ''}${total} ${einheit}</div>

        ${nurKarten ? '' : `<div class="nv"><div class="bl-modus" style="margin:0 0 14px">
          <button class="bl-seg on">${sym('ueben')}Üben</button>
          <button class="bl-seg" data-action="satz" data-modus="blatt">${sym('blatt')}Blatt</button></div></div>`}

        <div class="set-karte">
          ${fertig ? `<div class="fertig-banner">🎉 Durchgefüttert: alles sitzt in der letzten Stufe.</div>` : ''}
          <div class="set-stand">
            <span class="set-pct" style="color:${farbe}">${sicher}%</span>
            <span class="set-stand-text"><b>sitzt</b><br>${sitzt} von ${total} ${einheit}</span>
          </div>
          ${renderBoxBar(stats.boxCounts, total)}
          ${dueNow > 0
            ? `<button class="btn btn-study gross" data-action="study">${sym('ueben')}Jetzt üben · ${dueNow} ${dueNow === 1 ? (nurKarten ? 'Karte' : 'Aufgabe') : einheit}</button>`
            : `<button class="btn btn-study gross btn-disabled" disabled>Für heute alles gefüttert ✓</button>`}
          <button class="btn btn-study-all gross" data-action="study-all">${sym('wiederholen')}Alles durchgehen (${total})</button>
          ${session.studied > 0 ? `<div class="studied-today">Heute schon ${session.studied} geübt</div>` : ''}
        </div>

        ${deck.virtuell ? '' : `<div class="pruef-box">
          <label class="pruef-zeile"><span><b>Prüfung am</b>${settings.pruefung ? `<br><small>${escHtml(datumLang(settings.pruefung))}${settings.pruefung >= today() ? ' · ' + escHtml(pruefText(settings.pruefung).replace('Prüfung ', '')) : ' · vorbei'}</small>` : '<br><small>Dann steht das Set auf dem Start zuoberst.</small>'}</span>
            <input type="date" class="pruef-in" value="${escAttr(settings.pruefung)}" min="${today()}" aria-label="Datum der Prüfung" /></label>
          ${settings.pruefung ? '<button class="pause-knopf" style="margin:0" data-action="pruef-weg">Termin entfernen</button>' : ''}
        </div>`}

        ${deck.virtuell ? '' : settings.pause
          ? `<div class="pause-hinweis"><span>Vom Start genommen: Dieses Set erscheint nicht mehr auf dem Start und nicht bei «Meine Fehler». Üben kannst du es trotzdem.</span>
             <button class="btn btn-ghost" data-action="pause-aus">Wieder auf den Start</button></div>`
          : `<button class="pause-knopf" data-action="pause-an">Fertig damit? Vom Start nehmen</button>`}

        <details class="set-mehr">
          <summary>Einstellungen</summary>
          ${nurKarten ? `<label class="schalter">
            <input type="checkbox" class="reverse-cb" ${settings.reversed ? 'checked' : ''} />
            <span><b>Rückseite zuerst</b><br><small>Vorder- und Rückseite tauschen</small></span>
          </label>
          <label class="schalter">
            <input type="checkbox" class="tippen-cb" ${settings.tippen ? 'checked' : ''} />
            <span><b>Antwort tippen</b><br><small>Eintippen statt Karte umdrehen</small></span>
          </label>` : ''}
          <button class="btn btn-ghost btn-reset" data-action="reset">↺ Fortschritt zurücksetzen</button>
        </details>
        <button class="pause-knopf" data-action="hilfe">Was bedeuten «Stufe», «fällig» und «sitzt»?</button>
      </main>
    </div>
  `
}

function renderBoxBar(boxCounts, total) {
  if (total === 0) return ''
  // Stufe 1 ist neutral (noch nichts gelernt ist kein Fehler), dann Bernstein, dann Grün: alles aus der Palette.
  const colors = ['', 'oklch(0.86 0.02 75)', 'oklch(0.86 0.07 78)', 'oklch(0.76 0.12 70)', 'oklch(0.74 0.1 145)', 'oklch(0.55 0.13 145)']
  const segs = [1, 2, 3, 4, 5].map(box => {
    const pct = ((boxCounts[box] || 0) / total * 100).toFixed(1)
    if (Number(pct) === 0) return ''
    return `<div class="box-bar-seg" style="width:${pct}%;background:${colors[box]}" title="Stufe ${box}: ${boxCounts[box] || 0}"></div>`
  }).join('')
  return `<div class="box-bar">${segs || '<div class="box-bar-seg" style="width:100%;background:var(--border)"></div>'}</div>`
}

// ── Lernen ───────────────────────────────────────────────────────────────────

// ── Begleiter beim Üben ──────────────────────────────────────────────────────
//
// Das eigene Hirn (mit allem aus dem Shop) sitzt oben links und reagiert kurz:
// ein Hüpfer bei richtig, ein Grübeln bei falsch, dazu ein Satz. Verschmitzt,
// nicht kindlich, und nie belehrend: Es kommentiert, es bewertet nicht.
const SPRUECHE = {
  start: ['Futterzeit.', 'Los gehts.', 'Ich hab Hunger.', 'Auf gehts.'],
  gut:   ['Mmh, lecker.', 'Sitzt.', 'Das schmeckt.', 'Gut gekaut.', 'Mehr davon.', 'Genau so.'],
  fast:  ['Fast.', 'Knapp daneben.', 'Beinahe.'],
  weg:   ['Kommt wieder.', 'Nochmals kauen.', 'Knifflig, gell?', 'Halb so wild.', 'Das üben wir.'],
}
const spruch = art => { const l = SPRUECHE[art] || []; return l[Math.floor(Math.random() * l.length)] || '' }

function begleiterHtml(cardState, reaktion) {
  return `
    <div class="study-kopfzeile">
      <div class="begleiter${reaktion ? ' ' + reaktion : ''}" id="begleiter" aria-hidden="true">${avatarHtml(getLook())}</div>
      <div class="sprech${reaktion ? ' zeigt' : ''}" id="sprech" role="status">${reaktion ? escHtml(spruch(reaktion)) : ''}</div>
      <div class="box-indicator" title="Stufe ${cardState.box} von 5">
        ${[1, 2, 3, 4, 5].map(b => `<div class="box-dot ${b === cardState.box ? 'active' : b < cardState.box ? 'done' : ''}"></div>`).join('')}
        <span class="box-label">Stufe ${cardState.box}</span>
      </div>
    </div>`
}
/** Das Hirn reagiert auf der aktuellen Seite (Aufgaben, Tippen). */
function begleiterReagiert(art) {
  const b = document.getElementById('begleiter'), sp = document.getElementById('sprech')
  if (!b || !sp) return
  b.classList.remove('gut', 'fast', 'weg', 'start'); void b.offsetWidth; b.classList.add(art)
  sp.textContent = spruch(art); sp.classList.add('zeigt')
}
/** Reaktion für die nächste Seite abholen (einmal). Die erste Karte bekommt einen Gruss. */
function reaktionHolen() {
  const r = state.reaktion || (state.queueIdx === 0 && !state.tipp && !state.flipped ? 'start' : null)
  state.reaktion = null
  return r
}

function renderStudy() {
  const { deck, queue, queueIdx, flipped } = state
  if (queueIdx >= queue.length) { navigate('summary'); return }

  const raw      = queue[queueIdx]
  if (raw.t && raw.t !== 'karte') { renderStudyAufgabe(raw); return }
  const settings = getSetSettings(deck.name)
  // Nur die Anzeige dreht sich — der Fortschritt hängt weiter an der Original-Vorderseite.
  const card      = settings.reversed ? { ...raw, front: raw.back, back: raw.front } : raw
  const cardState = getCardState(raw.quelle || deck.name, raw.id)
  // Beim Tippen steht das Ergebnis auf derselben Seite: Das Hirn reagiert darauf.
  const TIPP_ART = { richtig: 'gut', beinahe: 'fast', falsch: 'weg', aufgegeben: 'weg' }
  const reaktion = state.tipp ? TIPP_ART[state.tipp.ergebnis] : reaktionHolen()

  root.innerHTML = `
    <div class="screen study-screen">
      <header class="study-header">
        <button class="kopf-x" data-action="back-to-set" aria-label="Zurück">←</button>
        <div class="study-deck-name">${escHtml(deck.name)}${settings.reversed ? ' <span class="reversed-badge">⇄</span>' : ''}${settings.tippen ? ' <span class="reversed-badge">⌨</span>' : ''}</div>
        <div class="study-progress-text">${queueIdx + 1} / ${queue.length}</div>
      </header>
      <div class="study-progress-bar">
        <div class="study-progress-fill" style="width:${(queueIdx / queue.length) * 100}%"></div>
      </div>

      <main class="study-main">
        ${begleiterHtml(cardState, reaktion)}

        ${settings.tippen ? tippAnsicht(card) : `
        <div class="card-scene" id="card-scene">
          <div class="card-flip ${flipped ? 'is-flipped' : ''}" id="card-flip">
            <div class="card-face card-front">
              <div class="card-content">
                <div class="card-face-label">Frage</div>
                <div class="card-text">${renderMarkdown(card.front)}</div>
              </div>
              <button class="btn btn-reveal" id="reveal-btn">Antwort zeigen</button>
            </div>
            <div class="card-face card-back">
              <div class="card-content">
                <div class="card-face-label">Antwort</div>
                <div class="card-text">${renderMarkdown(card.back)}</div>
              </div>
              <div class="grade-buttons">
                <button class="grade-btn grade-again"  data-grade="0"><b class="grade-icon">✗</b><span>Nicht gewusst</span></button>
                <button class="grade-btn grade-good"   data-grade="2"><b class="grade-icon">✓</b><span>Gewusst</span></button>
              </div>
            </div>
          </div>
        </div>`}

        <div class="study-hint" id="study-hint">
          ${settings.tippen || flipped ? '' : 'Karte antippen oder «Antwort zeigen»'}
        </div>
      </main>
    </div>
  `

  if (settings.tippen) { verdrahteTippen(card); return }

  document.getElementById('card-scene').addEventListener('click', e => {
    if (!state.flipped && !e.target.closest('button')) flipCard()
  })
  document.getElementById('reveal-btn')?.addEventListener('click', flipCard)
  document.querySelectorAll('.grade-btn').forEach(btn => {
    btn.addEventListener('click', () => gradeCard(parseInt(btn.dataset.grade)))
  })
}

/** Eine Aufgabe (Auswahl, Lücke, Zuordnen …) im normalen Lernablauf. */
function renderStudyAufgabe(raw) {
  const { deck, queue, queueIdx } = state
  const cardState = getCardState(raw.quelle || deck.name, raw.id)
  const box = h('div', { class: 'stack' }), fb = h('div')
  const kopfzeile = document.createElement('template'); kopfzeile.innerHTML = begleiterHtml(cardState, reaktionHolen())
  root.replaceChildren(h('div', { class: 'screen study-screen' },
    h('header', { class: 'study-header' },
      h('button', { class: 'kopf-x', 'data-action': 'back-to-set', 'aria-label': 'Zurück' }, '←'),
      h('div', { class: 'study-deck-name' }, deck.name),
      h('div', { class: 'study-progress-text' }, (queueIdx + 1) + ' / ' + queue.length)),
    h('div', { class: 'study-progress-bar' }, h('div', { class: 'study-progress-fill', style: 'width:' + (queueIdx / queue.length * 100) + '%' })),
    h('main', { class: 'study-main' },
      kopfzeile.content.firstElementChild,
      h('div', { class: 'nv nv-in' }, box, fb))))
  renderAufgabe(raw, box, res => {
    const ok = res.r === 'richtig', nea = res.r === 'beinahe'
    begleiterReagiert(ok ? 'gut' : nea ? 'fast' : 'weg')
    fb.append(h('div', { class: 'fb ' + (ok ? 'ok' : nea ? 'near' : 'no') }, h('span', null, ok ? '✓' : nea ? '~' : '✕'),
      h('div', null, h('b', null, ok ? 'Richtig.' : nea ? 'Beinahe.' : 'Falsch.'), !ok ? ' Richtig: ' + res.correct : '',
        raw.erklaerung ? h('div', { style: 'margin-top:4px;font-weight:600' }, raw.erklaerung) : null)))
    if (!ok) {
      const eb = h('button', { class: 'btn ghost', style: 'height:42px;margin-top:8px', onclick: () => kopierenMitKi(promptErklaere(raw, res.given, { klasse: deck.klasse || '7', fach: deck.fach || '' }), eb) }, 'Erkläre mir das (Auftrag kopieren)')
      fb.append(eb)
    }
    fb.append(h('button', { class: 'btn', style: 'margin-top:8px', onclick: () => { state.letzteAntwort = res; gradeCard(gradeAus(res.r)) } }, 'Weiter'))
  })
}

// ── Antwort tippen ───────────────────────────────────────────────────────────
//
// Statt umdrehen: eintippen. Drei Ausgänge statt zwei — «beinahe» bestraft
// nicht, sondern fragt nach. Und bei «falsch» gibt es immer einen Ausweg:
// keine Lehrperson kann jedes Synonym auflisten, und eine App, die richtige
// Antworten als falsch abtut, benutzt niemand zweimal.

const TIPP_TEXTE = {
  richtig:   { titel: 'Richtig',       klasse: 'gut' },
  beinahe:   { titel: 'Fast',          klasse: 'fast' },
  falsch:    { titel: 'Falsch',        klasse: 'weg' },
  aufgegeben:{ titel: 'Nicht gewusst', klasse: 'weg' },
}

function tippAnsicht(card) {
  const tipp = state.tipp
  if (!tipp) {
    return `
      <div class="card-scene">
        <div class="card-tipp">
          <div class="card-content">
            <div class="card-face-label">Frage</div>
            <div class="card-text">${renderMarkdown(card.front)}</div>
          </div>
          <form class="tipp-form" id="tipp-form">
            <input class="tipp-feld" id="tipp-feld" type="text" inputmode="text"
              autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false"
              placeholder="Antwort eintippen…" aria-label="Deine Antwort" />
            <button class="btn btn-reveal" type="submit">Prüfen</button>
          </form>
          <button class="tipp-aufgeben" data-tipp="aufgeben">Weiss ich nicht</button>
        </div>
      </div>
    `
  }

  const t = TIPP_TEXTE[tipp.ergebnis]
  // Zwei gleichwertige Knöpfe gibt es nur bei «Fast» — dort ist die Sache
  // wirklich knapp. Bei «Falsch» bleibt der Ausweg als kleiner Link: er ist
  // für nicht aufgelistete Synonyme da, nicht für den Normalfall.
  const knoepfe = tipp.ergebnis === 'beinahe'
    ? `<button class="grade-btn grade-good tipp-haupt" data-grade="2">Zählt</button>
       <button class="grade-btn grade-again" data-grade="0">Nochmal</button>`
    : tipp.ergebnis === 'richtig'
      ? `<button class="grade-btn grade-good tipp-haupt" data-grade="2">Weiter</button>`
      : `<button class="grade-btn grade-again tipp-haupt" data-grade="0">Weiter</button>`

  return `
    <div class="card-scene">
      <div class="card-tipp tipp-${t.klasse}">
        <div class="card-content">
          <div class="card-face-label">Frage</div>
          <div class="card-text tipp-frage">${renderMarkdown(card.front)}</div>
        </div>
        <div class="tipp-urteil">
          <div class="tipp-titel">${t.titel}</div>
          ${tipp.eingabe ? `<div class="tipp-deine"><span>Du:</span> ${escHtml(tipp.eingabe)}</div>` : ''}
          <div class="tipp-richtige"><span>Antwort:</span> ${renderMarkdown(card.back)}</div>
        </div>
        <div class="grade-buttons tipp-knoepfe">${knoepfe}</div>
        ${tipp.ergebnis === 'falsch'
          ? `<button class="tipp-doch" data-grade="2">War doch richtig</button>`
          : ''}
      </div>
    </div>
  `
}

function verdrahteTippen(card) {
  const form = document.getElementById('tipp-form')
  if (form) {
    const feld = document.getElementById('tipp-feld')
    feld?.focus()
    form.addEventListener('submit', e => {
      e.preventDefault()
      const eingabe = feld?.value ?? ''
      const ergebnis = pruefeAntwort(eingabe, card.back)
      if (ergebnis === 'leer') { feld?.focus(); return }
      state.tipp = { eingabe: eingabe.trim(), ergebnis }
      render()
    })
    document.querySelector('[data-tipp="aufgeben"]')?.addEventListener('click', () => {
      state.tipp = { eingabe: '', ergebnis: 'aufgegeben' }
      render()
    })
    return
  }
  // Ergebnis steht: der Hauptknopf kriegt den Fokus, damit Enter weiterführt.
  document.querySelectorAll('[data-grade]').forEach(btn => {
    btn.addEventListener('click', () => gradeCard(parseInt(btn.dataset.grade)))
  })
  document.querySelector('.tipp-haupt')?.focus()
}

function flipCard() {
  if (state.flipped) return
  state.flipped = true
  document.getElementById('card-flip')?.classList.add('is-flipped')
  const hint = document.getElementById('study-hint')
  if (hint) hint.textContent = ''
}

function gradeCard(grade) {
  const { deck, queue, queueIdx } = state
  const raw = queue[queueIdx]
  const b = bewerte(raw.quelle || deck.name, raw.id, grade, raw.quelle ? undefined : state.faellig.has(raw.id))
  state.ausbeute += b.kruemel

  state.sessionGrades.push(grade)
  if (grade < 2) {
    const a = state.letzteAntwort
    const gegeben = a ? (a.given || '(leer)') : state.tipp ? (state.tipp.eingabe || '(aufgegeben)') : '(Karteikarte: ' + (grade === 1 ? 'nur teilweise gewusst' : 'nicht gewusst') + ')'
    state.sessionFehler.push({ frage: raw.t && raw.t !== 'karte' ? frageText(raw) : (raw.front ?? raw.vorne ?? ''), gegeben, richtig: a?.correct || (raw.t && raw.t !== 'karte' ? solText(raw) : (raw.back ?? raw.hinten ?? '')), quelle: raw.quelle })
  }
  // Bei Aufgaben und beim Tippen hat das Hirn schon reagiert; bei Karteikarten zeigt es die Reaktion auf der nächsten Karte.
  const schonGezeigt = (raw.t && raw.t !== 'karte') || state.tipp
  state.reaktion = schonGezeigt ? null : grade >= 2 ? 'gut' : grade === 1 ? 'fast' : 'weg'
  state.letzteAntwort = null
  state.queueIdx++
  state.flipped = false
  state.tipp = null

  // Am Ende der Einheit die Serie fortschreiben.
  if (state.queueIdx >= state.queue.length) {
    state.serieBonus = serieFortschreiben(today(), getTage(), nichtsMehrFaellig())
  }
  render()
}

/** Ist über alle gemerkten Sets nichts mehr fällig? Trägt die Serie an ruhigen Tagen. */
function nichtsMehrFaellig() {
  return alleDecks().every(deck => getDeckStats(deck, getProgress(deck.name)).dueCount === 0)
}

function startStudy(all = false) {
  const deck = state.deck
  if (!deck) return
  const progress = getProgress(deck.name)
  const queue = all ? getAllCardsSorted(deck, progress) : getDueCards(deck, progress)

  if (!queue.length) { showToast('Keine Karten fällig.', 'info'); return }
  // Fälligkeit jetzt festhalten: Krümel gibt es nur für Karten, die dran waren.
  // Beim Bewerten wäre die Karte längst auf «heute» gesetzt und damit nie fällig.
  const faellig = new Set(getDueCards(deck, progress, Infinity).map(c => c.id))
  navigate('study', {
    queue, queueIdx: 0, flipped: false, sessionGrades: [], sessionFehler: [],
    faellig, ausbeute: 0, serieBonus: null,
  })
}

/** Alle zuletzt falsch beantworteten Karten und Aufgaben, quer über alle Sets. */
function fehlerKarten() {
  const f = getFehler()
  if (!Object.keys(f).length) return []
  const out = []
  for (const d of alleDecks()) if (!istPausiert(d.name)) for (const c of d.cards) if (istFehler(f, d.name, c.id)) out.push({ ...c, quelle: d.name, fach: d.fach, klasse: d.klasse })
  return out
}
function startFehler() {
  const queue = fehlerKarten().slice(0, 30)
  if (!queue.length) { showToast('Keine offenen Fehler.', 'info'); return }
  navigate('study', { deck: { name: 'Meine Fehler', cards: queue, virtuell: true }, queue, queueIdx: 0, flipped: false, sessionGrades: [], sessionFehler: [], faellig: new Set(), ausbeute: 0, serieBonus: null })
}

const BEISPIEL = { titel: 'Beispiel: Schweiz-Quiz', fach: 'Geografie', items: [
  { t: 'mc', frage: 'Welche Stadt ist die Hauptstadt der Schweiz?', optionen: ['Zürich', 'Bern', 'Genf', 'Basel'], richtig: 1, erklaerung: 'Bern ist die Bundesstadt.' },
  { t: 'luecke', text: 'Die ___ fliesst durch Bern, der ___ durch Basel.', antworten: ['Aare', 'Rhein'] },
  { t: 'richtigfalsch', aussage: 'Der Genfersee liegt im Osten der Schweiz.', richtig: false, korrektur: 'Er liegt im Westen.' },
  { t: 'zahlen', frage: 'Wie viele Kantone hat die Schweiz?', antwort: 26, einheit: '', toleranz: 0 },
  { t: 'kreuztabelle', frage: 'Kreuze an, in welcher Sprachregion die Stadt liegt.', zeilen: ['Lugano', 'Lausanne', 'Luzern'], spalten: ['Deutsch', 'Französisch', 'Italienisch'], kreuze: [['Italienisch'], ['Französisch'], ['Deutsch']] },
] }
function beispielSet() {
  const r = toItems({ v: 2, ...BEISPIEL })
  const set = saveLibSet({ id: neueId(), titel: BEISPIEL.titel, fach: BEISPIEL.fach, klasse: '7', created: Date.now(), typ: 'test', items: r.items })
  navigate('set', { deck: libDeck(set) })
}

function confirmReset() {
  const deck = state.deck
  if (!deck) return
  if (confirm(`Fortschritt von «${deck.name}» zurücksetzen? Alle Karten kommen wieder in Stufe 1.`)) {
    resetProgress(deck.name)
    showToast('Fortschritt zurückgesetzt — alle Karten in Stufe 1', 'info')
    render()
  }
}

// ── Zusammenfassung ──────────────────────────────────────────────────────────

function renderSummary() {
  const { deck, sessionGrades } = state
  const total = sessionGrades.length
  const good  = sessionGrades.filter(g => g >= 2).length
  const again = sessionGrades.filter(g => g === 0).length
  const hard  = sessionGrades.filter(g => g === 1).length
  const pct   = total > 0 ? Math.round((good / total) * 100) : 0
  const stats = getDeckStats(deck, getProgress(deck.name))
  const masteredPct = sitztAnteil(deck, getProgress(deck.name)).anteil

  const message = pct >= 90 ? 'Ausgezeichnet! 🎉'
    : pct >= 70 ? 'Sehr gut!'
    : pct >= 50 ? 'Weiter so!'
    : 'Übung macht den Meister.'

  root.innerHTML = `
    <div class="screen summary-screen">
      <div class="summary-card">
        <img class="summary-hirn" src="${import.meta.env.BASE_URL}hirn.png" alt="" width="96" height="96" />
        <h1 class="summary-title">Portion geschafft!</h1>
        <p>${message}</p>
        <p>${deck.virtuell ? (again ? `${again} davon ${again === 1 ? 'bleibt' : 'bleiben'} auf deiner Fehlerliste.` : 'Alle Fehler ausgebügelt.') : stats.dueCount > 0 ? `Noch ${stats.dueCount} Karten in diesem Set fällig.` : 'Für heute alles gefüttert — in diesem Set.'}</p>
        <div class="summary-stats">
          <div class="stat-item"><div class="stat-num">${total}</div><div class="stat-lbl">Gelernt</div></div>
          <div class="stat-item stat-green"><div class="stat-num">${good}</div><div class="stat-lbl">Gewusst</div></div>
          <div class="stat-item stat-red"><div class="stat-num">${again}</div><div class="stat-lbl">Nicht gewusst</div></div>
        </div>
        ${hard ? `<div class="summary-mastered">${hard} beinahe richtig</div>` : ''}
        <div class="summary-pct">${pct}% gewusst</div>
        <div class="summary-bar-wrap">
          <div class="summary-bar"><div class="summary-bar-fill" style="width:${pct}%"></div></div>
        </div>
        ${state.ausbeute > 0
          ? `<div class="summary-kruemel">+${state.ausbeute} Krümel</div>`
          : `<div class="summary-kruemel summary-kruemel-leer">Keine neuen Krümel — die kommen, wenn die Karten wieder dran sind.</div>`}
        ${state.serieBonus?.neueMarke
          ? `<div class="summary-serie">🔥 ${state.serieBonus.neueMarke} Tage in Folge — Bonus: +${state.serieBonus.bonus} Krümel</div>`
          : ''}
        <div class="summary-mastered" ${deck.virtuell ? 'hidden' : ''}>${masteredPct > 0
          ? `${masteredPct}% des Sets sitzt sicher`
          : 'Noch nichts in Stufe 4 — das kommt, wenn die Karten wieder dran sind.'}</div>
        <div class="summary-actions">
          ${state.sessionFehler.length ? `<button class="btn btn-study-all" data-action="fehler-erklaeren">Alle Fehler erklären lassen (Auftrag kopieren)</button>` : ''}
          ${deck.virtuell ? `${fehlerKarten().length ? '<button class="btn btn-study" data-action="fehler">Fehler nochmals üben</button>' : ''}<button class="btn btn-primary" data-action="home">Zur Übersicht</button>` : `
          ${stats.dueCount > 0
            ? `<button class="btn btn-study" data-action="study-more">Nachschlag nehmen (${Math.min(ROUND_SIZE, stats.dueCount)})</button>`
            : ''}
          <button class="btn btn-study-all" data-action="study-all">Alles üben</button>
          <button class="btn btn-primary" data-action="back-to-set">Zum Set</button>`}
        </div>
      </div>
    </div>
  `
}

// ── Laden ────────────────────────────────────────────────────────────────────

/** Womit Auszeichnungen freigeschaltet werden. */
function auszeichnungsStand() {
  const durchgefuettert = alleDecks().filter(deck => istDurchgefuettert(deck, getProgress(deck.name))).length
  return { durchgefuettert, serieRekord: getSerie().rekord }
}

function renderLaden() {
  const { total } = getKruemel()
  const look   = getLook()
  const besitz = getBesitz()
  const stand  = auszeichnungsStand()

  const kachel = (platzId, teil, aktivId, bild) => {
    const istAuszeichnung = !!teil.bedingung
    const freigeschaltet  = istAuszeichnung ? verdient(teil, stand) : null
    const hat = istAuszeichnung
      ? freigeschaltet
      : teil.preis === 0 || besitz.has(schluessel(platzId, teil.id))
    const traegt = (aktivId ?? null) === (teil.id ?? null)
    const zustand = traegt ? 'traegt' : hat ? 'hat'
      : istAuszeichnung ? 'gesperrt'
      : total >= teil.preis ? 'kaufbar' : 'zuteuer'
    const fuss = traegt ? '<span class="laden-marke">getragen</span>'
      : istAuszeichnung
        ? (freigeschaltet
            ? '<span class="laden-marke">verdient</span>'
            : `<span class="laden-bedingung">${escHtml(BEDINGUNGEN[teil.bedingung].text)}</span>`)
      : hat ? '<span class="laden-marke laden-marke-still">im Besitz</span>'
      : `${teil.preis} Krümel`
    return `
      <button class="laden-kachel laden-${zustand}"
        data-action="laden-tipp" data-platz="${platzId}" data-teil="${teil.id ?? ''}"
        ${zustand === 'zuteuer' || zustand === 'gesperrt' ? 'aria-disabled="true"' : ''}>
        <div class="laden-vorschau">${bild}</div>
        <div class="laden-titel">${escHtml(teil.titel)}</div>
        <div class="laden-preis">${fuss}</div>${teil.saison ? `<small>${SAISONEN[teil.saison].titel} · ${SAISONEN[teil.saison].zeitraum}</small>` : ''}
      </button>
    `
  }

  const abschnitte = PLAETZE.map(platz => `
    <section class="laden-abschnitt">
      <h2 class="laden-h2">${platz.titel}</h2>
      <div class="laden-gitter">
        ${platz.teile.filter(t => saisonSichtbar(t, besitz.has(schluessel(platz.id, t.id)))).map(t => kachel(platz.id, t, look[platz.id], teilVorschauHtml(platz.id, t.id))).join('')}
      </div>
    </section>
  `).join('')

  root.innerHTML = `
    <div class="screen laden-screen">
      <header class="app-header">
        <button class="kopf-x" data-action="home" aria-label="Zurück">←</button>
        <div class="shop-titel">${sym('laden')}Shop</div>
        <div class="laden-konto">${total.toLocaleString('de-CH')} Krümel</div>
      </header>

      <main class="laden-main">
        <div class="laden-buehne">${avatarHtml(look, 'avatar-gross')}</div>

        <section class="laden-abschnitt">
          <h2 class="laden-h2">Hintergrund</h2>
          <div class="laden-gitter">
            ${HINTERGRUENDE.filter(h => saisonSichtbar(h, besitz.has(schluessel('hg', h.id)))).map(h => kachel('hg', h, look.hintergrund, teilVorschauHtml('hg', h.id))).join('')}
          </div>
        </section>

        ${abschnitte}

        <p class="laden-fuss">
          Krümel gibt es fürs Üben, nie fürs Kaufen. Nichts hier macht das Lernen leichter —
          es sieht nur besser aus.
        </p>
      </main>
    </div>
  `
}

/** Tippen auf eine Kachel: tragen, wenn vorhanden — sonst kaufen. */
function ladenTipp(platzId, teilRoh) {
  const teilId = teilRoh === '' ? null : teilRoh
  const liste  = platzId === 'hg' ? HINTERGRUENDE : PLAETZE.find(p => p.id === platzId).teile
  const teil   = liste.find(t => (t.id ?? null) === teilId)
  if (!teil) return

  const feld = platzId === 'hg' ? 'hintergrund' : platzId

  if (teil.bedingung) {
    if (verdient(teil, auszeichnungsStand())) { setLook(feld, teilId); render() }
    else showToast(`«${teil.titel}» gibt es nicht zu kaufen: ${BEDINGUNGEN[teil.bedingung].text}.`)
    return
  }

  if (teil.preis === 0 || getBesitz().has(schluessel(platzId, teilId))) {
    setLook(feld, teilId)
    render()
    return
  }

  if (!saisonKaufbar(teil)) { showToast(`«${teil.titel}» ist vom ${SAISONEN[teil.saison].zeitraum} erhältlich.`); render(); return }
  const { total } = getKruemel()
  if (total < teil.preis) {
    showToast(`«${teil.titel}» kostet ${teil.preis} Krümel — dir fehlen noch ${teil.preis - total}.`)
    return
  }
  if (!confirm(`«${teil.titel}» für ${teil.preis} Krümel kaufen?`)) return
  if (!saisonKaufbar(teil)) { showToast('Die Saison ist inzwischen beendet.'); render(); return }
  if (!zahleKruemel(teil.preis)) { showToast('Das reicht nicht.', 'error'); return }
  kaufen(platzId, teilId)
  setLook(feld, teilId)
  showToast(`«${teil.titel}» gehört dir.`, 'success')
  render()
}

// ── App behalten: zum Startbildschirm hinzufügen ─────────────────────────────
//
// Ohne das ist die App nach dem Schliessen des Tabs praktisch weg — und iOS räumt
// die Daten von Websites, die nicht auf dem Startbildschirm liegen, nach einigen
// Wochen Nichtnutzung ab.
//
// ⚠️ Was hier möglich ist, entscheidet die Plattform, nicht wir:
//   • Android/Chrome: `beforeinstallprompt` → ein Tipp, dann der native Ja/Nein-Dialog.
//   • iOS/Safari:     es gibt **keine** Programmierschnittstelle dafür. Apple lässt
//     das Hinzufügen nur über «Teilen → Zum Home-Bildschirm» zu. Mehr als eine
//     gute Anleitung ist technisch nicht drin.
//   • In-App-Browser (Instagram, WhatsApp, Teams …): dort fehlt der Menüpunkt oft
//     ganz — dann muss die Seite zuerst in Safari bzw. Chrome geöffnet werden.
//     Das ist die häufigste Stolperstelle, darum wird sie erkannt.

const KEY_INSTALL_HINT = 'zk:hint:install'
let installPrompt = null

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true
}
function isIos() {
  const ua = navigator.userAgent
  // iPadOS meldet sich als Macintosh — Touch verrät es.
  return /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}
function isInAppBrowser() {
  const ua = navigator.userAgent
  return /FBAN|FBAV|Instagram|Line\/|Twitter|WhatsApp|Snapchat|LinkedInApp|MicroMessenger|Teams/i.test(ua)
    || /\bwv\b/.test(ua)
}
function hintDismissed() {
  try { return localStorage.getItem(KEY_INSTALL_HINT) === 'weg' } catch { return false }
}

/** installiert | in-app | prompt | ios | menue | unklar */
function installState() {
  if (isStandalone())    return 'installiert'
  if (isInAppBrowser())  return 'in-app'
  if (installPrompt)     return 'prompt'
  if (isIos())           return 'ios'
  // Firefox und Samsung Internet kennen `beforeinstallprompt` nicht, haben den
  // Punkt aber im Menü. Auf dem Desktop schweigen wir lieber.
  if (navigator.maxTouchPoints > 0) return 'menue'
  return 'unklar'
}

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault()
  installPrompt = e
  render()
})

window.addEventListener('appinstalled', () => {
  installPrompt = null
  showToast('Hirnfutter liegt jetzt auf deinem Startbildschirm.', 'success')
  render()
})

const TEILEN_ICON = `<svg class="ios-share-icon" viewBox="0 0 24 24" aria-hidden="true">
  <path d="M12 3v12M12 3l-3.5 3.5M12 3l3.5 3.5" fill="none" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M6 11H4.5v9h15v-9H18" fill="none" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round"/>
</svg>`

function installBanner() {
  const zustand = installState()
  if (zustand === 'installiert' || zustand === 'unklar' || hintDismissed()) return ''

  const grund = 'Dann bleiben deine Sets und dein Fortschritt erhalten — und du kannst auch ohne Internet üben.'
  const text = zustand === 'in-app'
    ? 'Du bist gerade in der Vorschau einer anderen App. Öffne diese Seite in <strong>Safari</strong> bzw. <strong>Chrome</strong> — nur dort lässt sie sich auf den Startbildschirm legen.'
    : zustand === 'menue'
      ? `Leg Hirnfutter über das Browser-Menü auf deinen Startbildschirm. ${grund}`
      : `Leg Hirnfutter auf deinen Startbildschirm. ${grund}`

  const knopf = zustand === 'prompt'
    ? `<button class="btn btn-primary btn-sm" data-action="install">${sym('installieren')}Hinzufügen</button>`
    : zustand === 'ios'
      ? `<button class="btn btn-primary btn-sm" data-action="ios-guide">So geht's</button>`
      : ''

  return `
    <div class="install-hint">
      <div class="install-hint-text">${text}</div>
      <div class="install-hint-actions">
        ${knopf}
        <button class="btn btn-ghost btn-sm" data-action="dismiss-hint">Später</button>
      </div>
    </div>
  `
}

/** Android/Chrome: ein Tipp, dann entscheidet der Schüler im Systemdialog. */
async function doInstall() {
  if (!installPrompt) return
  installPrompt.prompt()
  try {
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'dismissed') showToast('Kein Problem — du kannst das später nachholen.')
  } catch {}
  installPrompt = null
  render()
}

/**
 * iOS: Apple bietet keinen Weg, den Dialog selbst zu öffnen. Bleibt eine
 * Anleitung, die genau zeigt, wo getippt werden muss.
 */
function showIosGuide() {
  document.getElementById('ios-guide')?.remove()
  const iPad = /ipad/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
  const wo = iPad ? 'oben rechts' : 'unten in der Mitte'

  const el = document.createElement('div')
  el.id = 'ios-guide'
  el.className = 'guide-overlay'
  el.innerHTML = `
    <div class="guide-card" role="dialog" aria-modal="true" aria-labelledby="guide-titel">
      <h2 class="guide-titel" id="guide-titel">In drei Schritten auf den Startbildschirm</h2>
      <ol class="guide-steps">
        <li><span class="guide-num">1</span>
          <span>Tippe ${wo} auf ${TEILEN_ICON} <strong>Teilen</strong>.</span></li>
        <li><span class="guide-num">2</span>
          <span>Wisch die Liste nach unten bis <strong>«Zum Home-Bildschirm»</strong>.</span></li>
        <li><span class="guide-num">3</span>
          <span>Oben rechts auf <strong>«Hinzufügen»</strong> — fertig.</span></li>
      </ol>
      <p class="guide-fuss">Danach startest du Hirnfutter wie eine normale App —
        mit deinen Sets und deinem Fortschritt.</p>
      <button class="btn btn-primary" data-action="close-guide">Verstanden</button>
    </div>
  `
  document.body.appendChild(el)
  el.addEventListener('click', e => { if (e.target === el) closeIosGuide() })
}

/** Kurze Erklärung der Begriffe. Erreichbar vom Start und von jeder Set-Seite. */
function showHilfe() {
  document.getElementById('hilfe')?.remove()
  const punkt = (t, text) => `<li><span><strong>${t}</strong><br>${text}</span></li>`
  const el = document.createElement('div')
  el.id = 'hilfe'
  el.className = 'guide-overlay'
  el.innerHTML = `
    <div class="guide-card hilfe-card" role="dialog" aria-modal="true" aria-labelledby="hilfe-titel">
      <h2 class="guide-titel" id="hilfe-titel">So funktioniert Hirnfutter</h2>
      <ul class="hilfe-liste">
        ${punkt('Die fünf Stufen', 'Jede Karte und jede Aufgabe liegt auf einer Stufe. Neu beginnt alles auf Stufe 1. Weisst du die Antwort, steigt sie eine Stufe auf. Weisst du sie nicht, geht sie zurück auf Stufe 1.')}
        ${punkt('Fällig', 'Je höher die Stufe, desto länger die Pause bis zum nächsten Mal. «Fällig» heisst: Heute ist diese Karte wieder dran. Ist nichts fällig, hast du für heute alles gemacht.')}
        ${punkt('Sitzt', 'Eine Karte «sitzt», wenn sie auf Stufe 4 oder 5 liegt. Du hast sie also mehrmals richtig gewusst, mit Pausen dazwischen. Darum bringt es mehr, jeden Tag kurz zu üben als einmal lang.')}
        ${punkt('Krümel', 'Krümel bekommst du, wenn eine fällige Karte eine Stufe aufsteigt. Im Shop tauschst du sie gegen Sachen für dein Hirn. Wer zusätzlich übt, lernt mehr, bekommt dafür aber keine Krümel.')}
        ${punkt('Üben und Blatt', 'Bei «Üben» kommt eine Aufgabe nach der anderen. «Blatt» zeigt alle Aufgaben wie eine Prüfung: ausfüllen, auswerten, auf Wunsch drucken.')}
        ${punkt('Prüfung', 'Trag auf der Seite eines Sets das Datum der Prüfung ein. Dann steht das Set auf dem Start zuoberst. Nach der Prüfung nimmst du es vom Start.')}
        ${punkt('Deine Daten', 'Alles liegt nur auf diesem Gerät. In der Bibliothek unter «Daten sichern» lädst du eine Sicherung herunter, zum Beispiel vor einem Handywechsel.')}
      </ul>
      <button class="btn btn-primary" data-action="close-hilfe">Verstanden</button>
    </div>
  `
  document.body.appendChild(el)
  el.addEventListener('click', e => { if (e.target === el) el.remove() })
}

function closeIosGuide() {
  document.getElementById('ios-guide')?.remove()
}

// ── Klicks ───────────────────────────────────────────────────────────────────

// Zeilen, die wie Knöpfe wirken (role="button"), reagieren auch auf Enter und Leertaste.
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return
  const el = e.target
  if (el?.getAttribute?.('role') !== 'button' || el.tagName === 'BUTTON') return
  e.preventDefault(); el.click()
})

document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]')
  if (!el) return
  const { action, setName } = el.dataset

  if (action === 'nav')           geheZu(el.dataset.ziel)
  if (action === 'open-lib') {
    const ls = getLibSet(el.dataset.libId)
    if (ls?.neu) { ls.neu = false; updateLibSet(ls, null, { still: true }) }
    if (ls) navigate('set', { deck: libDeck(ls) })
  }
  if (action === 'satz')          navigate('set', { satz: el.dataset.modus || 'blatt' })
  if (action === 'fehler')        startFehler()
  if (action === 'fehler-erklaeren') {
    const proto = state.sessionFehler.map((f, i) => (i + 1) + '. Aufgabe: ' + f.frage + (f.quelle ? ' (aus «' + f.quelle + '»)' : '') + '\n   Seine Antwort: ' + f.gegeben + '\n   Richtig: ' + f.richtig).join('\n')
    kopierenMitKi(promptFehlerErklaerung(state.deck.name, proto, { klasse: state.deck.klasse || '7', fach: state.deck.fach || '' }), el)
  }
  if (action === 'klassencode' || action === 'ios-guide') fensterScharf()
  if (action === 'klassencode')   klassencodeDialog(r => { showToast('«' + anzeigeName(r.klasse.name) + '» hinzugefügt: ' + (r.ergebnis.neu + r.ergebnis.geaendert) + (r.ergebnis.neu + r.ergebnis.geaendert === 1 ? ' Set' : ' Sets'), 'success'); render() })
  if (action === 'beispiel')      beispielSet()
  if (action === 'home')          goHome()
  if (action === 'back-to-set')   state.deck?.virtuell ? goHome() : navigate('set')
  if (action === 'study')         startStudy()
  if (action === 'study-all')     startStudy(true)
  if (action === 'study-more')    startStudy()
  if (action === 'reset')         confirmReset()
  if (action === 'pause-an')      { setzePause(state.deck.name, true); showToast('«' + state.deck.name + '» ist vom Start genommen. Du findest es in der Bibliothek.'); render() }
  if (action === 'pause-aus')     { setzePause(state.deck.name, false); showToast('«' + state.deck.name + '» ist wieder auf dem Start.', 'success'); render() }
  if (action === 'pruef-weg')     { setzePruefung(state.deck.name, ''); showToast('Prüfungstermin entfernt.'); render() }
  if (action === 'pruef-fertig')  { setzePruefung(setName, ''); setzePause(setName, true); showToast('«' + setName + '» ist vom Start genommen. Du findest es in der Bibliothek.'); render() }
  if (action === 'pruef-behalten') { setzePruefung(setName, ''); render() }
  if (action === 'sichern')       { sicherungLaden(); showToast('Sicherung heruntergeladen. Bewahre die Datei gut auf.', 'success'); render() }
  if (action === 'sichern-spaeter') { sicherungSpaeter(); render() }
  if (action === 'hilfe')         { fensterScharf(); showHilfe() }
  if (action === 'laden')         navigate('laden')
  if (action === 'laden-tipp')    ladenTipp(el.dataset.platz, el.dataset.teil)
  if (action === 'install')       doInstall()
  if (action === 'ios-guide')     showIosGuide()
  if (action === 'close-guide')   closeIosGuide()
  if (action === 'close-hilfe')   document.getElementById('hilfe')?.remove()
  if (action === 'dismiss-hint')  { try { localStorage.setItem(KEY_INSTALL_HINT, 'weg') } catch {}; render() }

  if (action === 'open-set') {
    const entry = getSets().find(s => s.name === setName)
    if (entry) navigate('set', { deck: toDeck(entry.name, entry.cards) })
  }
  if (action === 'forget-set') {
    e.stopPropagation()
    if (confirm(`«${setName}» aus der Liste nehmen? Der Fortschritt bleibt gespeichert — über den Link ist alles wieder da.`)) {
      forgetSet(setName)
      render()
    }
  }
})

document.addEventListener('change', e => {
  if (e.target.classList.contains('reverse-cb')) {
    const settings = getSetSettings(state.deck.name)
    settings.reversed = e.target.checked
    saveSetSettings(state.deck.name, settings)
    showToast(settings.reversed ? 'Rückseite zuerst' : 'Vorderseite zuerst')
  }
  if (e.target.classList.contains('pruef-in')) {
    const d = e.target.value
    if (d && d < today()) { showToast('Das Datum liegt in der Vergangenheit.', 'error'); render(); return }
    setzePruefung(state.deck.name, d)
    if (d && getSetSettings(state.deck.name).pause) setzePause(state.deck.name, false) // mit Termin gehört es wieder auf den Start
    showToast(d ? 'Gemerkt: ' + pruefText(d) + '. Das Set steht jetzt auf dem Start zuoberst.' : 'Prüfungstermin entfernt.', 'success', 4000)
    render()
  }
  if (e.target.classList.contains('tippen-cb')) {
    const settings = getSetSettings(state.deck.name)
    settings.tippen = e.target.checked
    saveSetSettings(state.deck.name, settings)
    showToast(settings.tippen ? 'Antwort tippen' : 'Karte umdrehen')
  }
})

// ── Kleinkram ────────────────────────────────────────────────────────────────

function showToast(msg, type = 'info', dauer = 2800) {
  document.getElementById('toast')?.remove()
  const t = document.createElement('div')
  t.id = 'toast'
  t.className = `toast toast-${type}`
  t.textContent = msg
  document.body.appendChild(t)
  requestAnimationFrame(() => t.classList.add('toast-show'))
  setTimeout(() => { t.classList.remove('toast-show'); setTimeout(() => t.remove(), 300) }, dauer)
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function escAttr(s) {
  return escHtml(s).replace(/"/g, '&quot;')
}

function renderMarkdown(text) {
  if (!text) return ''
  return String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>')
    .replace(/\$[^$]+\$/g, s => mathHtml(s))
}

let vollGemeldet = 0
window.addEventListener('zk:voll', () => { if (Date.now() - vollGemeldet > 8000) { vollGemeldet = Date.now(); showToast('Speicher voll: Das konnte nicht gespeichert werden. Lösche alte Sets oder sichere deine Daten in der Bibliothek.', 'error') } })

openFromHash()

// Klassen im Hintergrund abgleichen: beim Start und wenn die App wieder sichtbar wird.
function klassenAbgleich() {
  alleAbgleichen().then(r => {
    if (!r || !(r.neu || r.geaendert || r.entfernt)) return
    const teile = []
    if (r.neu) teile.push(r.neu + (r.neu === 1 ? ' neues Set' : ' neue Sets'))
    if (r.geaendert) teile.push(r.geaendert + ' aktualisiert')
    if (r.entfernt) teile.push(r.entfernt + ' entfernt')
    showToast((r.klassen.length ? r.klassen.map(anzeigeName).join(', ') + ': ' : '') + teile.join(', '), 'success')
    if (['home', 'bibliothek'].includes(state.view)) render()
  }).catch(() => {})
}
klassenAbgleich()
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') klassenAbgleich() })

