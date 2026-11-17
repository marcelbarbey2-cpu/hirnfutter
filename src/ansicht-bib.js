// Bibliothek: alle Sets verwalten, Sets einfügen.
import { h, kopieren } from './dom.js'
import { parseAnswer, TNAME, MIX, frageText, solText } from './format.js'
import { getLib, getLibSet, saveLibSet, updateLibSet, deleteLibSet, neueId } from './bibliothek.js'
import { getSets, sicherung, wiederherstellen, sicherungInfo, setsAufGeraet, istPausiert, setzePause, sicherungGemacht } from './storage.js'
import { setLink } from './teilen.js'
import { getKlassen, klasseVerlassen, alleAbgleichen, eigeneKopie, serverBereit, zeigeCode, getLehrercode, anzeigeName, ungespeichert, veroeffentlichen, appStand } from './klassen.js'
import { klassencodeDialog, lehrerFokus } from './ansicht-klassen.js'
import { symEl } from './symbole.js'
import { TYP_INFO } from './erstellen.js'

function exportText(s) {
  if (s.typ === 'tutor') return JSON.stringify({ t: 'lektion', titel: s.lektion.titel, klasse: s.klasse, ziele: s.lektion.ziele, schritte: s.lektion.schritte })
  return JSON.stringify({ v: 2, titel: s.titel, fach: s.fach, items: s.items })
}

const ui = { q: '', typ: 'alle', fach: 'alle', sort: 'neu', auf: new Set(), offen: new Set(), edit: null, weg: null }
const FACH_ORDER = [...Object.keys(MIX)]

/** Ein Set bearbeiten: Titel, einzelne Aufgaben entfernen, einfache Lösungen korrigieren. */
function renderBearbeiten(root, hooks, set) {
  const zu = () => { ui.edit = null; hooks.neu() }
  const sichern = () => updateLibSet(set)
  const titel = h('input', { class: 'in', value: set.titel })
  const inp = (wert, fn, ph) => h('input', { class: 'in', value: wert, placeholder: ph || '', onchange: e => { fn(e.target.value); sichern() } })
  const felder = it => {
    if (it.t === 'karte') return [inp(it.vorne, v => { it.vorne = v }, 'Vorderseite'), inp(it.hinten, v => { it.hinten = v }, 'Rückseite')]
    if (it.t === 'zahlen') return [h('div', { class: 'ed-f' }, frageText(it)), inp(String(it.antwort), v => { const n = Number(String(v).replace(',', '.')); if (!isNaN(n)) it.antwort = n }, 'Lösung')]
    if ((it.t === 'luecke' || it.t === 'wortbanken' || it.t === 'tabelle') && Array.isArray(it.antworten))
      return [h('div', { class: 'ed-f' }, frageText(it)), ...it.antworten.map((a, i) => inp(a, v => { if (v.trim()) it.antworten[i] = v.trim() }, 'Lösung ' + (i + 1)))]
    return [h('div', { class: 'ed-f' }, frageText(it)), it.t === 'info' ? null : h('div', { class: 'ed-l' }, 'Lösung: ' + solText(it))]
  }
  root.replaceChildren(h('div', { class: 'screen nv' },
    h('div', { class: 'top' }, h('button', { class: 'x', 'aria-label': 'Zurück', onclick: zu }, '←'), h('span', null, 'Set bearbeiten')),
    h('div', { class: 'seite', style: 'padding-bottom:24px' },
      h('div', { class: 'lbl' }, 'Titel'), titel,
      h('button', { class: 'btn ghost', style: 'height:44px', onclick: () => { const t = titel.value.trim(); if (t && t !== set.titel) { updateLibSet(set, t); hooks.neu() } } }, 'Titel ändern (Fortschritt bleibt)'),
      h('div', { class: 'lbl', style: 'margin-top:8px' }, set.items.length + ' Einträge'),
      ...set.items.map((it, n) => h('div', { class: 'kk ed' },
        h('button', { class: 'vs-x', 'aria-label': 'Entfernen', onclick: () => { set.items.splice(n, 1); sichern(); hooks.neu() } }, '✕'),
        h('span', { class: 'lbl' }, TNAME[it.t] || it.t), ...felder(it))),
      h('button', { class: 'btn', onclick: zu }, 'Fertig'))))
}

/** Eingabe «Thema» im Menü ⋯: bestehende Themen des Fachs zur Auswahl, oder ein neues eintippen. Leer = kein Thema. */
function themaFeld(x, hooks) {
  const fach = x.s.fach || ''
  const themen = [...new Set(getLib().filter(s => !s.quelle && (s.fach || '') === fach && s.thema).map(s => s.thema))].sort((a, b) => a.localeCompare(b, 'de', { numeric: true }))
  const listId = 'th-' + x.id
  const inp = h('input', { class: 'in bib-thema', list: listId, value: x.s.thema || '', placeholder: 'kein Thema', maxlength: 40, autocomplete: 'off',
    onchange: e => {
      const t = e.target.value.trim().replace(/\s+/g, ' ')
      if (t === (x.s.thema || '')) return
      x.s.thema = t; updateLibSet(x.s)
      ui.auf.add(fach || 'Ohne Fach') // das Fach offen lassen, damit man sieht, wohin das Set gegangen ist
      if (t) ui.offen.add('f|' + (fach || 'Ohne Fach') + '|' + t)
      ui.meldung = t ? '«' + x.titel + '» liegt jetzt im Thema «' + t + '».' : '«' + x.titel + '» hat kein Thema mehr.'
      hooks.neu()
    } })
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur() })
  return h('label', { class: 'lbl' }, 'Thema ', inp, h('datalist', { id: listId }, themen.map(t => h('option', { value: t }))))
}

function klassenBereich(hooks) {
  const kl = getKlassen()
  const datum = t => t ? new Date(t).toLocaleString('de-CH', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'noch nie'
  const box = h('div', { class: 'bib-klassen' },
    h('div', { class: 'bib-klassen-kopf' }, h('h2', { style: 'margin:0' }, 'Meine Klassen'),
      h('button', { class: 'btn ghost', style: 'height:40px;padding:0 14px;font-size:15px', onclick: () => klassencodeDialog(r => { ui.meldung = '«' + anzeigeName(r.klasse.name) + '» hinzugefügt: ' + (r.ergebnis.neu + r.ergebnis.geaendert) + (r.ergebnis.neu + r.ergebnis.geaendert === 1 ? ' Set.' : ' Sets.'); RE() }) }, symEl('code'), 'Klassencode')),
    kl.length ? null : h('div', { style: 'font-size:15px;font-weight:600;color:var(--text-2)' }, 'Hast du von deiner Lehrperson einen Klassencode bekommen? Tippe ihn hier ein.'),
    ...kl.map(k => {
      const weg = h('button', { class: 'lnk', onclick: () => { if (!weg.dataset.a) { weg.dataset.a = 1; weg.textContent = 'Wirklich? Die Sets der Klasse verschwinden.'; return } klasseVerlassen(k.code); RE() } }, 'Entfernen')
      return h('div', { class: 'bib-klasse' },
        h('div', null, h('div', { style: 'font-weight:800' }, anzeigeName(k.name), k.lehrer ? h('span', { class: 'bib-klasse-lp' }, ' · ' + k.lehrer) : null),
          h('div', { class: 'bib-meta' }, zeigeCode(k.code) + ' · ' + (k.archiviert ? 'archiviert' : k.fehlt ? 'gibt es nicht mehr' : 'aktualisiert ' + datum(k.stand)))),
        weg)
    }),
    kl.length ? h('button', { class: 'lnk', onclick: async e => { e.target.textContent = 'Wird aktualisiert …'; const r = await alleAbgleichen({ sofort: true }); ui.meldung = r ? (r.neu || r.geaendert || r.entfernt ? r.neu + ' neu, ' + r.geaendert + ' geändert, ' + r.entfernt + ' entfernt.' : 'Alles aktuell.') : ''; RE() } }, '↻ Jetzt aktualisieren') : null,
    // Für Schüler kein Hinweis auf den Lehrermodus: Lehrpersonen kommen über die eigene Adresse …/lehrer.
    getLehrercode() ? h('button', { class: 'lnk', style: 'font-size:13px', onclick: () => H.lehrer() }, 'Zum Lehrermodus →') : null)
  return box
}
export function sicherungLaden() {
  const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(sicherung())], { type: 'application/json' })), download: 'hirnfutter-sicherung-' + new Date().toISOString().slice(0, 10) + '.json' })
  document.body.append(a); a.click(); a.remove()
  sicherungGemacht()
}
let RE = () => {}, H = {}
/** Zurück-Taste: «Set bearbeiten» schliessen. @returns {boolean} ob etwas zu schliessen war */
export function bibZurueck() { if (!ui.edit) return false; ui.edit = null; return true }

export function renderBibliothek(root, hooks) {
  RE = hooks.neu; H = hooks
  const weg = ui.weg
  if (ui.edit) { const s = getLibSet(ui.edit); if (s) return renderBearbeiten(root, hooks, s); ui.edit = null }
  const meldung = h('div')
  const imp = h('textarea', { class: 'in code', placeholder: 'Set als Text oder Link hier einfügen' })
  const lib = getLib()
  const links = getSets()
  const loeschen = (text, fn) => { const b = h('button', { class: 'lnk', onclick: () => { if (b.dataset.a) fn(); else { b.dataset.a = '1'; b.textContent = 'Wirklich?' } } }, text); return b }
  const datum = t => t ? new Date(t).toLocaleDateString('de-CH', { day: 'numeric', month: 'numeric' }) : ''

  // Alle Sets in eine einheitliche Form bringen.
  const alle = []
  for (const s of lib) {
    const n = s.items.filter(i => i.t !== 'info').length
    const typ = s.typ === 'karten' ? 'karten' : 'test'
    alle.push({ id: s.id, kind: 'lib', typ, titel: s.titel, fach: s.fach || '', n, einheit: typ === 'karten' ? (n === 1 ? 'Karte' : 'Karten') : (n === 1 ? 'Aufgabe' : 'Aufgaben'), created: s.created || 0, s })
  }
  for (const e of links) alle.push({ id: e.name, kind: 'link', typ: 'karten', titel: e.name, fach: '', n: e.cards.length, einheit: 'Karten', created: 0, e })

  const faecher = [...new Set(alle.map(x => x.fach || 'Ohne Fach'))].sort((a, b) => {
    const ia = FACH_ORDER.indexOf(a), ib = FACH_ORDER.indexOf(b)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b)
  })

  const treffer = alle.filter(x =>
    (ui.typ === 'alle' || x.typ === ui.typ) &&
    (ui.fach === 'alle' || (x.fach || 'Ohne Fach') === ui.fach) &&
    (!ui.q.trim() || (x.titel + ' ' + (x.s?.thema || '')).toLowerCase().includes(ui.q.trim().toLowerCase())))
  treffer.sort((a, b) => ui.sort === 'az' ? a.titel.localeCompare(b.titel, 'de') : b.created - a.created || a.titel.localeCompare(b.titel, 'de'))

  const lpAn = !!getLehrercode() && serverBereit()
  const zeile = x => {
    const akt = h('div', { class: 'bib-akt no-print', hidden: true })
    if (x.kind === 'lib') {
      const cp = h('button', { class: 'lnk', onclick: () => kopieren(exportText(x.s), cp) }, 'Als Text kopieren')
      const weitere = h('details', { class: 'bib-weitere' }, h('summary', null, 'Weitere'), cp)
      const sf = h('select', { class: 'in bib-fach', onchange: e => { x.s.fach = e.target.value; updateLibSet(x.s); hooks.neu() } },
        [...FACH_ORDER, ...(FACH_ORDER.includes(x.fach) || !x.fach ? [] : [x.fach])].map(f => h('option', { value: f, selected: f === x.fach }, f)))
      if (!x.fach) sf.prepend(h('option', { value: '', selected: true }, 'Fach wählen …'))
      const tl = h('button', { class: 'lnk', onclick: async () => {
        const url = await setLink(x.s)
        if (navigator.share) { try { await navigator.share({ title: x.titel, url }); return } catch {} }
        kopieren(url, tl)
      } }, 'Teilen (Link)')
      if (x.s.quelle) akt.append(
        h('div', { style: 'flex-basis:100%;font-size:13px;font-weight:600;color:var(--text-2)' }, 'Von deiner Lehrperson. Es wird automatisch aktualisiert und lässt sich nicht verändern.'),
        h('button', { class: 'lnk', onclick: () => { const k = eigeneKopie(x.s); ui.meldung = '«' + k.titel + '» gespeichert. Diese Kopie kannst du bearbeiten.'; hooks.neu() } }, 'Als eigene Kopie speichern'), tl, weitere)
      else akt.append(h('label', { class: 'lbl' }, 'Fach ', sf), themaFeld(x, hooks),
        lpAn && x.s.lp && ungespeichert(x.s) ? h('button', { class: 'btn lp-btn', style: 'flex-basis:100%', onclick: async e => {
          e.target.disabled = true; e.target.textContent = 'Wird geschickt …'
          try { await veroeffentlichen(x.s); ui.meldung = '«' + x.titel + '» ist aktualisiert. Die Schüler bekommen die neue Fassung beim nächsten Öffnen.' }
          catch (f) { ui.meldung = 'Das hat nicht geklappt: ' + f.message }
          hooks.neu()
        } }, 'Änderung an die Klasse schicken') : null,
        lpAn ? h('button', { class: 'lnk', onclick: () => { lehrerFokus(x.id); hooks.lehrer() } }, x.s.lp ? 'In weitere Klasse veröffentlichen' : 'In Klasse veröffentlichen') : null,
        h('button', { class: 'lnk', onclick: () => { ui.edit = x.id; hooks.neu(); window.scrollTo(0, 0) } }, symEl('bearbeiten'), 'Bearbeiten'), tl, weitere,
        h('button', { class: 'lnk', onclick: () => { ui.weg = x.s; deleteLibSet(x.id); hooks.neu() } }, 'Löschen'))
    } else akt.append(loeschen('Aus Liste nehmen', () => hooks.vergiss(x.id)))
    const pause = istPausiert(x.titel)
    akt.prepend(h('button', { class: 'lnk', style: 'flex-basis:100%;text-align:left', onclick: () => {
      setzePause(x.titel, !pause)
      ui.meldung = pause ? '«' + x.titel + '» ist wieder auf dem Start.' : '«' + x.titel + '» ist vom Start genommen. Es bleibt hier in der Bibliothek.'
      hooks.neu()
    } }, pause ? 'Wieder auf den Start' : 'Vom Start nehmen (fertig geübt)'))
    const mehr = h('button', { class: 'bib-mehr', 'aria-label': 'Aktionen für «' + x.titel + '»', title: 'Aktionen', 'aria-expanded': 'false', onclick: () => { akt.hidden = !akt.hidden; mehr.classList.toggle('on', !akt.hidden); mehr.setAttribute('aria-expanded', String(!akt.hidden)) } }, '⋯')
    return h('div', { class: 'bib-row' + (pause ? ' pausiert' : '') },
      h('div', { class: 'bib-zeile' },
        h('div', { class: 'bib-main', role: 'button', tabindex: '0', onclick:() => x.kind === 'lib' ? hooks.oeffneLib(x.id) : hooks.oeffneLink(x.id) },
          h('div', { class: 'bib-t' }, x.s?.neu ? h('span', { class: 'neu-chip' }, 'NEU') : null, x.titel),
          h('div', { class: 'bib-meta' }, h('span', { class: 'tab ' + TYP_INFO[x.typ].css }, TYP_INFO[x.typ].tab), (x.s?.quelle && x.fach ? x.fach + ' · ' : '') + x.n + ' ' + x.einheit + (x.created && !x.s?.quelle ? ' · ' + datum(x.created) : '') + (x.s?.lp && lpAn ? (ungespeichert(x.s) ? ' · Änderung noch nicht bei der Klasse' : ' · veröffentlicht') : '') + (pause ? ' · nicht auf dem Start' : ''))),
        mehr),
      akt)
  }

  const suche = !!ui.q.trim()
  const fachSort = (a, b) => { const ia = FACH_ORDER.indexOf(a), ib = FACH_ORDER.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b, 'de') }

  // Themen-Ordner: zu, ausser bei der Suche, wenn man ihn geöffnet hat oder wenn ein neues Set darin liegt.
  const ordner = (key, thema, liste) => {
    const offen = suche || ui.offen.has(key)
    const d = h('details', { class: 'bib-ordner', open: offen },
      h('summary', null, h('span', null, thema), liste.some(x => x.s?.neu) ? h('span', { class: 'neu-chip' }, 'NEU') : null, h('span', { class: 'bib-n' }, liste.length)),
      h('div', null, liste.map(zeile)))
    d.addEventListener('toggle', () => { if (suche) return; d.open ? ui.offen.add(key) : ui.offen.delete(key) })
    return d
  }
  /** Erst die Ordner (nach Name), dann die Sets ohne Thema. */
  const mitOrdnern = (praefix, liste) => {
    const themen = new Map(), lose = []
    for (const x of liste) { const t = (x.s?.thema || '').trim(); if (!t) lose.push(x); else { if (!themen.has(t)) themen.set(t, []); themen.get(t).push(x) } }
    const namen = [...themen.keys()].sort((a, b) => a.localeCompare(b, 'de', { numeric: true }))
    return [...namen.map(t => ordner(praefix + '|' + t, t, themen.get(t))), ...lose.map(zeile)]
  }

  const klassen = getKlassen()
  const kGruppen = klassen.map(k => {
    const liste = treffer.filter(x => x.s?.quelle?.code === k.code)
    const kf = [...new Set(liste.map(x => x.fach || 'Ohne Fach'))].sort(fachSort)
    const inhalt = kf.length === 1 ? mitOrdnern('k|' + k.code + '|' + kf[0], liste)
      : kf.flatMap(f => [h('div', { class: 'bib-fach-lbl' }, f), ...mitOrdnern('k|' + k.code + '|' + f, liste.filter(x => (x.fach || 'Ohne Fach') === f))])
    return { f: '📚 ' + anzeigeName(k.name), klasse: k, liste, inhalt }
  }).filter(g => g.liste.length)
  const gruppen = [...kGruppen, ...faecher.map(f => {
    const liste = treffer.filter(x => !x.s?.quelle && (x.fach || 'Ohne Fach') === f)
    return { f, liste, inhalt: liste.length ? mitOrdnern('f|' + f, liste) : [] }
  })].filter(g => g.liste.length)
  const chips = (k, opts) => h('div', { class: 'bib-chips' }, opts.map(([v, t]) => h('button', { class: 'bib-chip' + (ui[k] === v ? ' on' : ''), onclick: () => { ui[k] = v; hooks.neu() } }, t)))

  const filter = h('div', { class: 'bib-filter' },
    h('input', { class: 'in', type: 'search', placeholder: 'Sets durchsuchen …', value: ui.q, oninput: e => { ui.q = e.target.value; clearTimeout(ui.tm); ui.tm = setTimeout(() => { hooks.neu(); const i = document.querySelector('.bib-filter input'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length) } }, 250) } }),
    null) // Die früheren Filterreihen (Art, Fach, Sortierung) braucht es nicht mehr: Die Fächer sind die Übersicht.

  const inhalt = !alle.length
    ? h('div', { style: 'font-size:15px;color:var(--text-2);font-weight:600' }, 'Noch keine Sets. Erstelle eines unter «Erstellen».')
    : !treffer.length
      ? h('div', { style: 'font-size:15px;color:var(--text-2);font-weight:600' }, 'Nichts gefunden.')
      : h('div', { class: 'bib-liste' }, gruppen.map(g => {
        // Normalzustand: zu. Offen bleibt nur, was man in dieser Sitzung selbst aufgeklappt hat (und alles bei der Suche).
        const d = h('details', { class: 'bib-grp', open: suche || ui.auf.has(g.f) },
          h('summary', null, h('span', null, g.f, g.klasse ? h('span', { class: 'bib-klasse-tag' }, 'Klasse') : null),
            g.liste.some(x => x.s?.neu) ? h('span', { class: 'neu-chip' }, 'NEU') : null, h('span', { class: 'bib-n' }, g.liste.length)),
          h('div', null, g.inhalt))
        d.addEventListener('toggle', () => { if (suche) return; d.open ? ui.auf.add(g.f) : ui.auf.delete(g.f) })
        return d
      }))

  root.replaceChildren(h('div', { class: 'screen nv' }, hooks.kopf('Bibliothek'),
    h('div', { class: 'seite', style: 'padding-bottom:20px' },
      h('h2', null, 'Meine Sets (' + treffer.length + (treffer.length !== alle.length ? ' von ' + alle.length : '') + ')'),
      ui.weg ? h('div', { class: 'fb near' }, h('span', null, '🗑'), h('div', null, '«' + ui.weg.titel + '» gelöscht. ',
        h('button', { class: 'lnk', style: 'display:inline;padding:0;text-decoration:underline', onclick: () => { saveLibSet(weg); hooks.neu() } }, 'Rückgängig'))) : null,
      ui.meldung ? h('div', { class: 'fb ok' }, h('span', null, '✓'), h('div', null, ui.meldung)) : null,
      alle.length > 4 ? filter : null,
      inhalt,
      serverBereit() && (!getLehrercode() || getKlassen().length) ? klassenBereich() : null, // Lehrpersonen brauchen keinen Klassencode
      h('details', { class: 'bib-imp' }, h('summary', null, symEl('sichern'), 'Daten sichern'),
        h('div', { style: 'display:flex;flex-direction:column;gap:10px;margin-top:10px' },
          h('div', { style: 'font-size:13px;font-weight:600;color:var(--text-2);line-height:1.4' }, 'Alle Sets, dein Fortschritt und deine Krümel liegen nur auf diesem Gerät. Sichere sie als Datei, z. B. vor einem Handywechsel.'),
          h('button', { class: 'btn ghost', style: 'height:44px', onclick: sicherungLaden }, 'Sicherung herunterladen'),
          (() => { const f = h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: async () => {
              const d = f.files[0]; if (!d) return
              f.value = '' // dieselbe Datei soll sich nochmals wählen lassen
              let obj = null, info = null
              try { obj = JSON.parse(await d.text()); info = sicherungInfo(obj) } catch {}
              if (!info) return sm.replaceChildren(h('div', { class: 'fb no' }, h('span', null, '✕'), h('div', null, 'Diese Datei ist keine Hirnfutter-Sicherung.')))
              // Erst zeigen, was passiert: Wiederherstellen ersetzt, was jetzt auf dem Gerät liegt.
              const vom = info.datum ? new Date(info.datum).toLocaleDateString('de-CH', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
              const jetzt = setsAufGeraet()
              const sets = n => n + (n === 1 ? ' Set' : ' Sets')
              const los = h('button', { class: 'btn', onclick: () => {
                const n = wiederherstellen(obj)
                sm.replaceChildren(h('div', { class: 'fb ' + (n > 0 ? 'ok' : 'no') }, h('span', null, n > 0 ? '✓' : '✕'), h('div', null, n > 0 ? 'Wiederhergestellt. Die App lädt neu …' : 'In dieser Sicherung steht nichts.')))
                if (n > 0) setTimeout(() => location.reload(), 1200)
              } }, 'Ja, ersetzen')
              sm.replaceChildren(h('div', { class: 'bib-warn' },
                h('b', null, 'Achtung: Das ersetzt, was jetzt auf diesem Gerät ist.'),
                h('div', null, 'In der Sicherung' + (vom ? ' vom ' + vom : '') + ': ' + sets(info.sets) + '.'),
                h('div', null, 'Jetzt auf diesem Gerät: ' + sets(jetzt) + (jetzt ? '. Diese Sets, der Fortschritt und die Krümel werden überschrieben.' : '.')),
                jetzt ? h('button', { class: 'btn ghost', style: 'height:44px', onclick: sicherungLaden }, 'Zuerst den heutigen Stand sichern') : null,
                los,
                h('button', { class: 'btn ghost', style: 'height:44px', onclick: () => sm.replaceChildren() }, 'Abbrechen')))
            } })
            const sm = h('div')
            return h('div', { style: 'display:flex;flex-direction:column;gap:10px' }, f, h('button', { class: 'btn ghost', style: 'height:44px', onclick: () => f.click() }, 'Sicherung wiederherstellen'), sm) })())),
      h('details', { class: 'bib-imp' }, h('summary', null, 'Set einfügen'),
        h('div', { style: 'display:flex;flex-direction:column;gap:10px;margin-top:10px' },
      imp,
      h('button', { class: 'btn ghost', style: 'height:44px', onclick: () => {
        const t = imp.value.trim(); meldung.replaceChildren()
        if (!t) return
        const m = t.match(/#d=([A-Za-z0-9_-]+)/)
        if (m) return hooks.linkOeffnen('#d=' + m[1])
        const tutor = /"t"\s*:\s*"lektion"|"s"\s*:\s*"(erklaeren|beispiel|aufgabe|zusammenfassung)"/.test(t)
        if (tutor) return meldung.append(h('div', { class: 'fb no' }, h('span', null, '✕'), h('div', null, 'Tutor-Lektionen gibt es nicht mehr. Erstelle stattdessen ein Aufgabenset.')))
        const p = parseAnswer(t, 'test')
        if (!p.ok) return meldung.append(h('div', { class: 'fb no' }, h('span', null, '✕'), h('div', null, p.problems.join(' '))))
        const set = { id: neueId(), titel: p.titel || 'Eingefügtes Set', fach: p.fach || '', klasse: '7', created: Date.now() }
        set.items = p.items; set.typ = p.items.every(i => i.t === 'karte') ? 'karten' : 'test'
        saveLibSet(set); hooks.neu()
      } }, 'Einfügen'), meldung)),
      h('div', { style: 'font-size:13px;font-weight:600;color:var(--text-2);text-align:center;margin-top:6px' }, 'Hirnfutter · Stand ' + appStand())),
    hooks.nav()))
  ui.weg = null // «Rückgängig» gilt nur bis zur nächsten Aktion
  ui.meldung = ''
}
