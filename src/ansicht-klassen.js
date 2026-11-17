// Ansichten für Klassencodes: Dialog «Klassencode eingeben» (Schüler) und Lehrermodus.
import { h, kopieren } from './dom.js'
import { getLib } from './bibliothek.js'
import {
  serverBereit, zeigeCode, klasseBeitreten,
  getLehrercode, lehrerAnmelden, lehrerAbmelden, lehrerUebersicht,
  klasseAnlegen, klasseAendern, klasseLoeschen, klasseWiederherstellen,
  setLoeschen, setWiederherstellen, veroeffentlichen, aufGeraetHolen, ungespeichert,
  serverPasst, anzeigeName,
  verwLehrer, verwLehrerNeu, verwSperren, verwNeuerCode, verwLoeschen, verwUebergeben, klasseBeitretenLp, klasseVerlassenLp,
} from './klassen.js'
import { symEl } from './symbole.js'

// ── Dialog für Schüler ───────────────────────────────────────────────────────

/** Öffnet ein Fenster zum Eintippen des Klassencodes. fertig(ergebnis) nach Erfolg. */
export function klassencodeDialog(fertig) {
  const meldung = h('div')
  const inp = h('input', { class: 'in kc-in', placeholder: 'z. B. K7Q 4MP', maxlength: 9, autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false', inputmode: 'text' })
  const zu = () => { hg.remove(); document.removeEventListener('keydown', esc) }
  const esc = e => { if (e.key === 'Escape') zu() }
  const los = async () => {
    knopf.disabled = true; knopf.textContent = 'Wird geladen …'; meldung.replaceChildren()
    try {
      const r = await klasseBeitreten(inp.value)
      zu(); fertig && fertig(r)
    } catch (e) {
      meldung.replaceChildren(h('div', { class: 'fb no', style: 'margin:0' }, h('span', null, '✕'), h('div', null, e.message)))
      knopf.disabled = false; knopf.textContent = 'Hinzufügen'
    }
  }
  const knopf = h('button', { class: 'btn', onclick: los }, 'Hinzufügen')
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') los() })
  const hg = h('div', { class: 'nv kc-hg', onclick: e => { if (e.target === hg) zu() } },
    h('div', { class: 'kc-box', role: 'dialog', 'aria-label': 'Klassencode eingeben' },
      h('h2', { style: 'margin:0' }, 'Klassencode eingeben'),
      h('div', { style: 'font-size:15px;font-weight:600;color:var(--text-2);line-height:1.4' }, 'Den Code bekommst du von deiner Lehrperson. Danach erscheinen ihre Sets hier, und neue kommen von selbst dazu.'),
      inp, meldung, knopf,
      h('button', { class: 'btn ghost', style: 'height:44px', onclick: zu }, 'Abbrechen')))
  document.body.append(hg)
  document.addEventListener('keydown', esc)
  setTimeout(() => inp.focus(), 50)
}

// ── Lehrermodus ──────────────────────────────────────────────────────────────

/** «So geht der Lehrermodus»: vier Schritte, mit Knöpfen dorthin, wo man sie erledigt. */
function anleitung(hooks, offen) {
  const schritt = (nr, titel, text, knopf) => h('div', { class: 'lp-schritt' },
    h('span', { class: 'lp-schritt-nr', 'aria-hidden': 'true' }, String(nr)),
    h('div', null, h('div', { class: 'lp-schritt-t' }, titel), h('div', { class: 'lp-hinweis' }, text), knopf || null))
  const angemeldet = !!getLehrercode()
  const zu = id => () => document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  return h('details', { class: 'lp-det lp-anleitung', open: offen },
    h('summary', null, 'So geht der Lehrermodus'),
    h('div', { class: 'lp-schritte' },
      schritt(1, 'Set erstellen', 'Du erstellst Sets genau wie die Schüler: unter «Erstellen». Fertige Sets liegen in deiner Bibliothek. Dort kannst du sie bearbeiten und in Themenordner legen.',
        angemeldet ? h('button', { class: 'lnk', onclick: () => hooks.erstellen() }, symEl('erstellen'), 'Zu «Erstellen» →') : null),
      schritt(2, 'Klasse anlegen', 'Einmal pro Klasse. Unterrichtest du in einer Klasse, die schon einen Code hat, trittst du ihr mit diesem Code bei. Die Schüler brauchen so nur einen Code.',
        angemeldet ? h('button', { class: 'lnk', onclick: zu('lp-klassen') }, 'Zu den Klassen ↓') : null),
      schritt(3, 'Set in die Klasse legen', 'Unter «Sets veröffentlichen» wählst du bei einem Set die Klasse. Oder in der Bibliothek bei einem Set: «⋯» → «In Klasse veröffentlichen».',
        angemeldet ? h('button', { class: 'lnk', onclick: zu('lp-pub') }, 'Zu «Sets veröffentlichen» ↓') : null),
      schritt(4, 'Klassencode den Schülern geben', 'Die Schüler tippen den Code einmal in Hirnfutter ein. Danach kommen neue Sets von selbst dazu.'),
      h('div', { class: 'lp-hinweis', style: 'margin-top:4px' },
        h('b', null, 'Später: '), 'Ändern: In der Bibliothek bearbeiten, dann «Änderung an die Klasse schicken». Nach der Prüfung: In der Klasse «Für Schüler ausblenden». ',
        'Der Server kennt keine Schülernamen und keine Ergebnisse: Fortschritt und Noten bleiben auf den Geräten der Schüler.')))
}

const L = { daten: null, laedt: false, fehler: '', meldung: '', offen: new Set(), verw: null, neuCode: null }
const anz = (n, typ) => n + (typ === 'karten' ? (n === 1 ? ' Karte' : ' Karten') : (n === 1 ? ' Aufgabe' : ' Aufgaben'))
const tage = t => Math.max(0, Math.ceil((t + (L.daten?.papierkorbTage || 30) * 86400000 - Date.now()) / 86400000))

export function renderLehrer(root, hooks) {
  const zeichne = () => renderLehrer(root, hooks)
  const seite = h('div', { class: 'seite', style: 'padding-bottom:24px' })
  // Vor der Anmeldung keine Reiter: Die Seite fragt nur nach dem Lehrercode, wie der Schüler-Start nach dem Klassencode.
  const angemeldet = !!getLehrercode()
  root.replaceChildren(h('div', { class: 'screen nv' }, hooks.kopf('Lehrermodus'), seite, ...(angemeldet ? [hooks.nav()] : [])))

  if (!serverBereit()) {
    seite.append(h('div', { class: 'fb near' }, h('span', null, '!'), h('div', null, 'Der Klassen-Server ist noch nicht eingerichtet. Trag seine Adresse in src/server-adresse.js ein.')))
    return
  }

  const melde = (text, art = 'ok') => { L.meldung = { text, art }; zeichne() }
  const tu = async (fn, okText) => {
    try { await fn(); await laden(); if (okText) L.meldung = { text: okText, art: 'ok' } }
    catch (e) { L.meldung = { text: e.message, art: 'no' } }
    zeichne()
  }
  const laden = async () => { L.daten = await lehrerUebersicht(); L.fehler = ''; if (L.daten.lehrer.admin) L.verw = (await verwLehrer()).lehrer }

  // Anmelden
  if (!getLehrercode()) {
    const inp = h('input', { class: 'in lp-login-in', placeholder: 'Lehrercode', 'aria-label': 'Lehrercode', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'characters' })
    const fb = h('div')
    const knopf = h('button', { class: 'btn', onclick: () => los() }, symEl('anmelden'), 'Anmelden')
    const los = async () => {
      if (!inp.value.trim()) return inp.focus()
      knopf.disabled = true; knopf.textContent = 'Wird geprüft …'
      try { await lehrerAnmelden(inp.value); await laden(); L.meldung = ''; L.anleitung = true; hooks.angemeldet() }
      catch (e) { knopf.disabled = false; knopf.textContent = 'Anmelden'; fb.replaceChildren(h('div', { class: 'fb no' }, h('span', null, '✕'), h('div', null, e.status === 401 ? 'Diesen Lehrercode kennt der Server nicht.' : e.message))) }
    }
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') los() })
    seite.classList.add('lp-login')
    seite.append(
      h('div', { class: 'lp-login-karte' },
        h('img', { class: 'lp-login-hirn', src: import.meta.env.BASE_URL + 'hirn.png', alt: '', width: 96, height: 96 }),
        h('div', { class: 'lp-login-titel' }, 'Für Lehrpersonen'),
        h('p', { class: 'lp-login-text' }, 'Melde dich mit deinem Lehrercode an. Danach legst du Klassen an und gibst deine Sets für sie frei. Die Schüler tippen einmal den Klassencode ein und haben danach alle Sets.'),
        inp, fb, knopf,
        h('div', { class: 'lp-login-klein' }, 'Den Lehrercode erhältst du von der Verwaltung. An einem geteilten Computer meldest du dich danach wieder ab.')),
      anleitung(hooks, false),
      h('button', { class: 'lnk lp-login-weg', onclick: () => hooks.heim() }, 'Zur Schüler-App →'))
    setTimeout(() => inp.focus(), 50)
    return
  }

  if (!L.daten && !L.laedt) {
    L.laedt = true
    laden().catch(e => { L.fehler = e.message; if (e.status === 401 || e.status === 403) { lehrerAbmelden(); L.fehler = e.status === 403 ? 'Dein Lehrercode ist gesperrt.' : 'Dein Lehrercode gilt nicht mehr.' } })
      .finally(() => { L.laedt = false; zeichne() })
  }
  if (L.laedt || !L.daten) {
    seite.append(L.fehler ? h('div', { class: 'fb no' }, h('span', null, '✕'), h('div', null, L.fehler)) : h('div', { style: 'font-weight:700;color:var(--text-2)' }, 'Wird geladen …'),
      L.fehler ? h('button', { class: 'btn ghost', onclick: () => { L.fehler = ''; zeichne() } }, 'Nochmals versuchen') : null)
    return
  }

  const D = L.daten
  const klassen = D.klassen.filter(k => !k.geloescht)
  const setsServer = D.sets.filter(s => !s.geloescht)
  const setNach = new Map(D.sets.map(s => [s.id, s]))
  const lokal = getLib().filter(s => !s.quelle)
  const lokalNachId = new Map(lokal.filter(s => s.lp).map(s => [s.lp.id, s]))

  if (L.beigetreten) { L.meldung = { text: 'Du bist «' + L.beigetreten + '» beigetreten.', art: 'ok' }; L.beigetreten = null }
  if (L.meldung) seite.append(h('div', { class: 'fb ' + (L.meldung.art === 'no' ? 'no' : 'ok') }, h('span', null, L.meldung.art === 'no' ? '✕' : '✓'), h('div', null, L.meldung.text)))
  L.meldung = ''

  seite.append(h('div', { class: 'lp-kopf' },
    h('div', null, h('div', { class: 'lbl' }, 'Angemeldet als'), h('div', { style: 'font-weight:800;font-size:18px' }, D.lehrer.name),
      D.lehrer.admin ? h('div', { class: 'lp-meta' }, 'Verwaltung: Du wirst abgemeldet, sobald du die App schliesst.') : null),
    h('button', { class: 'lnk', onclick: () => { lehrerAbmelden(); L.daten = null; hooks.weg() } }, symEl('abmelden'), 'Abmelden')))
  // Die Anleitung ist offen, solange es noch keine Klasse gibt, und gleich nach der Anmeldung.
  seite.append(anleitung(hooks, L.anleitung || !klassen.length))
  L.anleitung = false

  // Klassen
  // Klassenname: auswählen statt tippen. Das Schuljahr setzt die App, der Name zählt danach jedes Jahr von selbst hoch.
  const schuljahr = (() => { const d = new Date(), y = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1, zz = n => String(n % 100).padStart(2, '0'); return zz(y) + '_' + zz(y + 1) })()
  const wahl = (wert, opts) => h('select', { class: 'in', onchange: () => neuZeigen() }, opts.map(([v, t]) => h('option', { value: v, selected: v === wert }, t)))
  const neuArt = wahl('E', [['E', 'Sek E'], ['B', 'Sek B'], ['P', 'Sek P'], ['X', 'Kurs oder anderer Name']])
  const neuStufe = wahl('1', [['1', '1. Sek'], ['2', '2. Sek'], ['3', '3. Sek']])
  const neuBuch = wahl('a', 'abcdefghpq'.split('').map(b => [b, 'Klasse ' + b])) // Sek P: nur p und q
  const neuName = h('input', { class: 'in', placeholder: 'Name, z. B. Wahlfach Informatik', maxlength: 60, autocomplete: 'off', oninput: () => neuZeigen() })
  const neuVorschau = h('div', { class: 'lp-hinweis' })
  const neuTitel = () => neuArt.value === 'X' ? neuName.value.trim()
    : schuljahr + '_Sek_' + neuArt.value + '_' + (neuArt.value !== 'B' ? ['', 'I', 'II', 'III'][neuStufe.value] + neuBuch.value : neuStufe.value + neuBuch.value.toUpperCase())
  function neuZeigen() {
    const frei = neuArt.value === 'X'
    neuStufe.hidden = neuBuch.hidden = frei; neuName.hidden = !frei
    const p = neuArt.value === 'P'
    ;[...neuBuch.options].forEach(o => { o.textContent = 'Klasse ' + (neuArt.value === 'B' ? o.value.toUpperCase() : o.value); o.hidden = o.disabled = p !== 'pq'.includes(o.value) })
    if (neuBuch.selectedOptions[0]?.disabled) neuBuch.value = p ? 'p' : 'a'
    // Sek P gibt es nur in der 1. und 2. Sek (danach Gymnasium).
    const s3 = neuStufe.querySelector('option[value="3"]'); s3.hidden = s3.disabled = p
    if (p && neuStufe.value === '3') neuStufe.value = '2'
    const t = neuTitel()
    neuVorschau.replaceChildren(frei ? 'Dieser Name bleibt, wie er ist. Er zählt nicht von selbst ins nächste Schuljahr.' : h('span', null, 'Name: ', h('b', null, t), ' · Die Schüler sehen: ', h('b', null, anzeigeName(t))))
  }
  neuZeigen()
  const neuKnopf = h('button', { class: 'btn ghost', style: 'height:46px', onclick: () => { const n = neuTitel(); if (!n) return neuName.focus(); tu(() => klasseAnlegen(n), 'Klasse «' + n + '» angelegt.') } }, symEl('plus'), 'Klasse anlegen')
  neuName.addEventListener('keydown', e => { if (e.key === 'Enter') neuKnopf.click() })
  seite.append(h('h2', { id: 'lp-klassen' }, 'Klassen (' + klassen.length + ')'))
  if (!klassen.length) seite.append(h('div', { class: 'lp-hinweis' }, 'Leg eine Klasse an oder tritt einer bestehenden bei. Die Schüler brauchen pro Klasse nur einen Code.'))
  for (const k of klassen) seite.append(klasseKarte(k))
  const beiIn = h('input', { class: 'in', placeholder: 'Klassencode, z. B. K7Q 4MP', maxlength: 9, autocapitalize: 'characters', autocomplete: 'off' })
  const beiKnopf = h('button', { class: 'btn ghost', style: 'height:46px', onclick: () => { if (!beiIn.value.trim()) return beiIn.focus(); tu(async () => { const k = await klasseBeitretenLp(beiIn.value); L.meldung = null; L.beigetreten = k.name }, null) } }, 'Beitreten')
  beiIn.addEventListener('keydown', e => { if (e.key === 'Enter') beiKnopf.click() })
  seite.append(
    h('details', { class: 'lp-det', open: !klassen.length }, h('summary', null, 'Neue Klasse anlegen'),
      h('div', { class: 'lp-neu' }, h('div', { class: 'lp-hinweis' }, 'Für deine eigene Klasse (als Klassenlehrperson) oder für einen Kurs, der quer durch Klassen geht.'),
        h('div', { class: 'lp-hinweis' }, 'Sek-Klassen zählen jedes Jahr am 1. August von selbst hoch (aus der 1. Sek wird die 2. Sek). Nach der 3. Sek wird die Klasse archiviert, bei Sek P schon nach der 2. Sek.'),
        h('div', { class: 'lp-wahl3' }, neuArt, neuStufe, neuBuch), neuName, neuVorschau, neuKnopf)),
    h('details', { class: 'lp-det', open: !klassen.length }, h('summary', null, 'Bestehender Klasse beitreten'),
      h('div', { class: 'lp-neu' }, h('div', { class: 'lp-hinweis' }, 'Du unterrichtest ein Fach in einer Klasse, die schon einen Code hat? Gib ihn ein. Danach legst du deine Sets in dieselbe Klasse, und die Schüler brauchen keinen zweiten Code.'), beiIn, beiKnopf)))

  function klasseKarte(k) {
    const ich = D.lehrer.id
    const ordnung = (a, b) => (a.fach || '').localeCompare(b.fach || '', 'de') || (a.thema || '￿').localeCompare(b.thema || '￿', 'de', { numeric: true }) || (a.titel || '').localeCompare(b.titel || '', 'de')
    const meine = k.sets.filter(e => e.lp === ich && setNach.has(e.id) && !setNach.get(e.id).geloescht).sort((a, b) => ordnung(setNach.get(a.id), setNach.get(b.id)))
    const andere = k.sets.filter(e => e.lp !== ich && e.meta && !e.meta.geloescht).sort((a, b) => ordnung(a.meta, b.meta))
    const sichtbarAlle = k.sets.filter(e => e.sichtbar && e.meta && !e.meta.geloescht).length
    const nameVon = id => (D.namen || {})[id] || ''
    const cb = h('button', { class: 'lnk', onclick: () => kopieren(zeigeCode(k.code), cb) }, 'Code kopieren')
    const nameIn = h('input', { class: 'in', value: k.name, maxlength: 60 })
    const loesch = h('button', { class: 'lnk', onclick: () => { if (!loesch.dataset.a) { loesch.dataset.a = 1; loesch.textContent = 'Wirklich löschen? Auch die Sets der anderen verschwinden aus der Klasse.'; return } tu(() => klasseLoeschen(k.code), 'Klasse in den Papierkorb gelegt.') } }, 'Löschen')
    const verlass = h('button', { class: 'lnk', onclick: () => { if (!verlass.dataset.a) { verlass.dataset.a = 1; verlass.textContent = 'Wirklich? Deine Sets verschwinden aus der Klasse.'; return } tu(() => klasseVerlassenLp(k.code), 'Du bist aus «' + k.name + '» ausgetreten.') } }, 'Klasse verlassen')
    const eigeneEintraege = () => k.sets.filter(e => e.lp === ich).map(e => ({ id: e.id, sichtbar: e.sichtbar }))
    const setsListe = h('div', { class: 'lp-sets' },
      meine.length ? meine.map(e => {
        const st = setNach.get(e.id)
        return h('div', { class: 'lp-set' + (e.sichtbar ? '' : ' aus') },
          h('div', { class: 'lp-set-t' }, st.titel, h('span', { class: 'lp-meta' }, [st.fach, st.thema].filter(Boolean).map(x => x + ' · ').join('') + anz(st.n, st.typ) + (e.sichtbar ? '' : ' · ausgeblendet'))),
          h('button', { class: 'lnk', onclick: () => tu(() => klasseAendern(k.code, { sets: eigeneEintraege().map(x => x.id === e.id ? { ...x, sichtbar: !e.sichtbar } : x) })) }, e.sichtbar ? 'Für Schüler ausblenden' : 'Für Schüler wieder zeigen'),
          h('button', { class: 'lnk', onclick: () => tu(() => klasseAendern(k.code, { sets: eigeneEintraege().filter(x => x.id !== e.id) }), '«' + st.titel + '» aus der Klasse genommen.') }, 'Freigabe für diese Klasse entfernen'))
      }) : h('div', { class: 'lp-hinweis' }, 'Von dir noch keine Sets. Veröffentliche unten ein Set in diese Klasse.'),
      andere.length ? h('div', { class: 'lbl', style: 'margin-top:8px' }, 'Von anderen Lehrpersonen') : null,
      ...andere.map(e => h('div', { class: 'lp-set fremd' + (e.sichtbar ? '' : ' aus') },
        h('div', { class: 'lp-set-t' }, e.meta.titel, h('span', { class: 'lp-meta' }, [e.meta.fach, e.meta.thema, nameVon(e.lp), anz(e.meta.n, e.meta.typ)].filter(Boolean).join(' · ') + (e.sichtbar ? '' : ' · ausgeblendet'))))))
    const leitest = k.leitest
    const det = h('details', { class: 'lp-det', open: L.offen.has(k.code) },
      h('summary', null, 'Sets in der Klasse (' + sichtbarAlle + ')'), setsListe,
      h('div', { class: 'lp-akt' },
        leitest ? h('label', { class: 'lp-umben' }, nameIn, h('button', { class: 'lnk', onclick: () => { const n = nameIn.value.trim(); if (n && n !== k.name) tu(() => klasseAendern(k.code, { name: n }), 'Umbenannt.') } }, 'Umbenennen')) : null,
        leitest ? h('button', { class: 'lnk', onclick: () => tu(() => klasseAendern(k.code, { archiviert: !k.archiviert }), k.archiviert ? 'Klasse wieder aktiv.' : 'Klasse archiviert. Der Code gilt nicht mehr, die Sets bleiben bei den Lehrpersonen.') }, k.archiviert ? 'Wieder aktivieren' : 'Archivieren') : null,
        leitest ? loesch : verlass))
    det.addEventListener('toggle', () => det.open ? L.offen.add(k.code) : L.offen.delete(k.code))
    const lehrerNamen = k.lehrer.map(nameVon).filter(Boolean)
    // Neues Schuljahr: Die Sets vom letzten Jahr sind noch sichtbar. Einmal fragen, ob sie ausgeblendet werden sollen.
    const jahrKey = 'zk:jahr:' + k.code
    const jahrGesehen = (() => { try { return localStorage.getItem(jahrKey) } catch { return null } })()
    const sichtbarMeine = meine.filter(e => e.sichtbar).length
    const jahrMerken = () => { try { localStorage.setItem(jahrKey, String(k.jahrNeu)) } catch {} }
    const jahrBox = k.jahrNeu && !k.archiviert && Date.now() - k.jahrNeu < 120 * 86400000 && jahrGesehen !== String(k.jahrNeu) && sichtbarMeine
      ? h('div', { class: 'lp-neucode' },
          h('b', null, 'Neues Schuljahr'),
          h('div', { class: 'lp-hinweis' }, 'Die Klasse heisst jetzt «' + k.name + '». ' + (sichtbarMeine === 1 ? 'Dein Set vom letzten Jahr ist' : 'Deine ' + sichtbarMeine + ' Sets vom letzten Jahr sind') + ' für die Schüler noch sichtbar.'),
          h('button', { class: 'btn ghost lp-btn', onclick: () => { jahrMerken(); tu(() => klasseAendern(k.code, { sets: eigeneEintraege().map(x => ({ ...x, sichtbar: false })) }), 'Ausgeblendet. Was du wieder brauchst, blendest du unter «Sets in der Klasse» einzeln ein.') } }, 'Alle meine Sets ausblenden'),
          h('button', { class: 'lnk', onclick: () => { jahrMerken(); zeichne() } }, 'So lassen'))
      : null
    return h('div', { class: 'lp-klasse' + (k.archiviert ? ' archiv' : '') },
      h('div', { class: 'lp-klasse-kopf' },
        h('div', null, h('div', { class: 'lp-klasse-name' }, k.name),
          h('div', { class: 'lp-meta' }, k.archiviert ? 'Archiviert: Schüler können den Code nicht mehr verwenden' : sichtbarAlle + (sichtbarAlle === 1 ? ' Set' : ' Sets') + ' sichtbar für die Schüler'),
          h('div', { class: 'lp-meta' }, (leitest ? 'Du leitest die Klasse' : 'Geleitet von ' + nameVon(k.ersteller)) + (lehrerNamen.length > 1 ? ' · ' + lehrerNamen.length + ' Lehrpersonen: ' + lehrerNamen.join(', ') : ''))),
        h('div', { class: 'lp-code' + (k.archiviert ? ' aus' : '') }, zeigeCode(k.code))),
      k.archiviert ? null : cb, jahrBox, det)
  }

  // Veröffentlichen: das in der Bibliothek gewählte Set zuoberst, sonst alle eigenen Sets nach Fach und Thema.
  const fokus = L.fokus && lokal.find(s => s.id === L.fokus)
  L.fokus = null
  seite.append(h('h2', { id: 'lp-pub' }, 'Sets veröffentlichen'))
  if (!lokal.length) seite.append(h('div', { class: 'lp-hinweis' }, 'Auf diesem Gerät gibt es noch keine eigenen Sets. Erstelle eines unter «Erstellen».'))
  else if (!klassen.length) seite.append(h('div', { class: 'lp-hinweis' }, 'Leg zuerst eine Klasse an oder tritt einer bei.'))
  else {
    if (fokus) {
      const box = h('div', { class: 'lp-fokus' }, h('div', { class: 'lbl' }, 'Aus der Bibliothek gewählt'), pubZeile(fokus))
      seite.append(box)
      setTimeout(() => box.scrollIntoView({ block: 'center' }), 30)
    }
    seite.append(h('div', { class: 'lp-hinweis' }, 'Tipp: In der Bibliothek kannst du bei jedem Set unter «⋯» ein Thema festlegen. Die Schüler sehen deine Sets dann in denselben Ordnern.'))
    const faecher = [...new Set(lokal.map(s => s.fach || 'Ohne Fach'))].sort((a, b) => a.localeCompare(b, 'de'))
    for (const f of faecher) {
      const inFach = lokal.filter(s => (s.fach || 'Ohne Fach') === f)
      const offen = inFach.filter(s => ungespeichert(s)).length
      const themen = [...new Set(inFach.map(s => s.thema || ''))].sort((a, b) => !a ? 1 : !b ? -1 : a.localeCompare(b, 'de', { numeric: true }))
      const key = 'pub|' + f
      const det = h('details', { class: 'lp-fach', open: L.offen.has(key) },
        h('summary', null, h('span', null, f), offen ? h('span', { class: 'lp-offen' }, offen + ' zu aktualisieren') : null, h('span', { class: 'bib-n' }, inFach.length)),
        ...themen.flatMap(t => [themen.length > 1 || t ? h('div', { class: 'bib-fach-lbl' }, t || 'Ohne Thema') : null,
          ...inFach.filter(s => (s.thema || '') === t).map(pubZeile)]))
      det.addEventListener('toggle', () => det.open ? L.offen.add(key) : L.offen.delete(key))
      seite.append(det)
    }
  }

  function pubZeile(s) {
    const m = s.lp && setNach.get(s.lp.id)
    const geloescht = m?.geloescht
    const drin = m ? klassen.filter(k => k.sets.some(e => e.id === m.id)) : []
    const frei = klassen.filter(k => !drin.includes(k) && !k.archiviert)
    const wahl = h('select', { class: 'in lp-wahl' }, h('option', { value: '' }, drin.length ? '+ in weitere Klasse …' : 'Klasse wählen …'), frei.map(k => h('option', { value: k.code }, k.name)))
    const status = !m ? 'noch nicht veröffentlicht' : geloescht ? 'im Papierkorb' : ungespeichert(s) ? 'geändert, noch nicht aktualisiert' : 'veröffentlicht'
    const knoepfe = []
    if (!geloescht) {
      if (frei.length) knoepfe.push(wahl, h('button', { class: 'btn ghost lp-btn', onclick: () => { if (!wahl.value) return wahl.focus(); tu(() => veroeffentlichen(s, wahl.value), '«' + s.titel + '» veröffentlicht.') } }, m ? 'Hinzufügen' : 'Veröffentlichen'))
      if (m && ungespeichert(s)) knoepfe.push(h('button', { class: 'btn lp-btn', onclick: () => tu(() => veroeffentlichen(s), 'Aktualisiert. Die Schüler bekommen die neue Fassung beim nächsten Öffnen.') }, 'Aktualisieren'))
    }
    return h('div', { class: 'lp-pub' + (m && !geloescht ? ' ist' : '') },
      h('div', { class: 'lp-set-t' }, s.titel, h('span', { class: 'lp-meta' }, status + (drin.length ? ' · in ' + drin.map(k => k.name).join(', ') : ''))),
      knoepfe.length ? h('div', { class: 'lp-pub-akt' }, knoepfe) : null)
  }

  // Veröffentlichte Sets, die auf diesem Gerät fehlen (anderer Computer)
  const fehlen = setsServer.filter(s => !lokalNachId.has(s.id))
  if (fehlen.length) {
    seite.append(h('h2', null, 'Auf anderen Geräten veröffentlicht'),
      h('div', { class: 'lp-hinweis' }, 'Diese Sets hast du an einem anderen Gerät veröffentlicht. Hol sie hierher, um sie zu bearbeiten.'))
    for (const s of fehlen) seite.append(h('div', { class: 'lp-pub ist' },
      h('div', { class: 'lp-set-t' }, s.titel, h('span', { class: 'lp-meta' }, anz(s.n, s.typ))),
      h('div', { class: 'lp-pub-akt' }, h('button', { class: 'btn ghost lp-btn', onclick: () => tu(() => aufGeraetHolen(s.id), '«' + s.titel + '» ist jetzt auf diesem Gerät.') }, 'Auf dieses Gerät holen'))))
  }

  // Veröffentlichte Sets löschen
  if (setsServer.length) {
    const det = h('details', { class: 'lp-det' }, h('summary', null, 'Veröffentlichte Sets löschen (' + setsServer.length + ')'),
      ...setsServer.map(s => {
        const b = h('button', { class: 'lnk', onclick: () => { if (!b.dataset.a) { b.dataset.a = 1; b.textContent = 'Wirklich?'; return } tu(() => setLoeschen(s.id), '«' + s.titel + '» in den Papierkorb gelegt. Bei den Schülern verschwindet es beim nächsten Öffnen.') } }, 'Löschen')
        return h('div', { class: 'lp-set' }, h('div', { class: 'lp-set-t' }, s.titel), b)
      }))
    seite.append(det)
  }

  // Papierkorb
  const kWeg = D.klassen.filter(k => k.geloescht), sWeg = D.sets.filter(s => s.geloescht)
  if (kWeg.length || sWeg.length) {
    seite.append(h('details', { class: 'lp-det' }, h('summary', null, 'Papierkorb (' + (kWeg.length + sWeg.length) + ')'),
      h('div', { class: 'lp-hinweis' }, 'Gelöschtes bleibt ' + D.papierkorbTage + ' Tage hier und verschwindet danach endgültig.'),
      ...kWeg.map(k => h('div', { class: 'lp-set' }, h('div', { class: 'lp-set-t' }, 'Klasse ' + k.name, h('span', { class: 'lp-meta' }, 'noch ' + tage(k.geloescht) + ' Tage')),
        h('button', { class: 'lnk', onclick: () => tu(() => klasseWiederherstellen(k.code), 'Klasse wiederhergestellt.') }, 'Wiederherstellen'))),
      ...sWeg.map(s => h('div', { class: 'lp-set' }, h('div', { class: 'lp-set-t' }, s.titel, h('span', { class: 'lp-meta' }, 'noch ' + tage(s.geloescht) + ' Tage')),
        h('button', { class: 'lnk', onclick: () => tu(() => setWiederherstellen(s.id), '«' + s.titel + '» wiederhergestellt.') }, 'Wiederherstellen')))))
  }

  if (D.lehrer.admin) {
    const warn = h('div')
    seite.append(warn)
    serverPasst().then(ok => { if (ok === false) warn.append(h('div', { class: 'fb near' }, h('span', null, '!'), h('div', null, 'Der Server bei Cloudflare ist älter als diese App. Füg den neuen Code aus server/worker.js beim Worker «hirnfutter-server» ein, sonst fehlen einzelne Funktionen.'))) })
    seite.append(verwaltung())
  }
  seite.append(h('button', { class: 'lnk', style: 'margin-top:8px', onclick: () => { L.daten = null; zeichne() } }, '↻ Neu laden'))

  function verwaltung() {
    const box = h('div', { class: 'lp-verw' }, h('h2', { style: 'margin:0' }, 'Verwaltung: Lehrpersonen'),
      h('div', { class: 'lp-hinweis' }, 'Hier stellst du Lehrercodes für Kolleginnen und Kollegen aus. Ein Code wird nur einmal angezeigt: Schreib ihn ab oder schick ihn gleich weiter.'))
    if (L.neuCode) {
      const cb = h('button', { class: 'btn ghost lp-btn', onclick: () => kopieren(L.neuCode.code, cb) }, 'Code kopieren')
      box.append(h('div', { class: 'lp-neucode' },
        h('div', { class: 'lbl' }, 'Lehrercode für ' + L.neuCode.name),
        h('div', { class: 'lp-code', style: 'font-size:22px;text-align:center' }, L.neuCode.code),
        h('div', { class: 'lp-hinweis' }, 'Die Lehrperson öffnet Hirnfutter, geht in der Bibliothek ganz unten auf «Für Lehrpersonen: Lehrermodus» und gibt diesen Code ein.'),
        cb))
      L.neuCode = null
    }
    const nameIn = h('input', { class: 'in', placeholder: 'Name, wie ihn die Schüler sehen, z. B. R. Müller', maxlength: 60 })
    const neu = h('button', { class: 'btn ghost lp-btn', onclick: () => {
      const n = nameIn.value.trim(); if (!n) return nameIn.focus()
      tu(async () => { const r = await verwLehrerNeu(n); L.neuCode = { name: r.name, code: r.code } }, n + ' ist eingetragen.')
    } }, 'Lehrercode ausstellen')
    nameIn.addEventListener('keydown', e => { if (e.key === 'Enter') neu.click() })
    box.append(h('div', { class: 'lp-neu' }, nameIn, neu))
    const liste = L.verw || []
    if (!liste.length) box.append(h('div', { class: 'lp-hinweis' }, 'Noch keine Lehrpersonen eingetragen.'))
    for (const p of liste) {
      const ersetzen = h('button', { class: 'lnk', onclick: () => {
        if (!ersetzen.dataset.a) { ersetzen.dataset.a = 1; ersetzen.textContent = 'Alten Code wirklich ersetzen?'; return }
        tu(async () => { const r = await verwNeuerCode(p.id); L.neuCode = { name: r.name, code: r.code } }, 'Neuer Code für ' + p.name + '. Der alte gilt nicht mehr.')
      } }, 'Neuen Code ausstellen')
      const kl = (p.klassenListe || []).filter(k => !k.geloescht)
      const allein = kl.filter(k => k.leitet && k.lehrer.length <= 1), weiter = kl.filter(k => k.leitet && k.lehrer.length > 1)
      const folgen = [p.sets ? p.sets + (p.sets === 1 ? ' Set wird' : ' Sets werden') + ' gelöscht' : '',
        allein.length ? (allein.length === 1 ? 'die Klasse ' : 'die Klassen ') + allein.map(k => '«' + k.name + '»').join(', ') + (allein.length === 1 ? ' wird' : ' werden') + ' aufgelöst' : '',
        weiter.length ? 'die Leitung von ' + weiter.map(k => '«' + k.name + '»').join(', ') + ' geht an eine andere Lehrperson der Klasse' : ''].filter(Boolean)
      const loeschen = h('button', { class: 'lnk lp-gefahr', onclick: () => {
        if (!loeschen.dataset.a) { loeschen.dataset.a = 1; loeschen.textContent = 'Endgültig löschen' + (folgen.length ? ' (' + folgen.join('; ') + ')' : '') + '? Das lässt sich nicht rückgängig machen. Sperren geht auch.'; return }
        tu(async () => { await verwLoeschen(p.id) }, p.name + ' ist gelöscht.')
      } }, 'Löschen')
      box.append(h('div', { class: 'lp-set' + (p.aktiv ? '' : ' aus') },
        h('div', { class: 'lp-set-t' }, p.name, h('span', { class: 'lp-meta' }, (p.aktiv ? '' : 'gesperrt · ') + p.klassen + (p.klassen === 1 ? ' Klasse' : ' Klassen') + ' · ' + p.sets + (p.sets === 1 ? ' Set' : ' Sets'))),
        h('button', { class: 'lnk', onclick: () => tu(() => verwSperren(p.id, !p.aktiv), p.name + (p.aktiv ? ' gesperrt.' : ' entsperrt.')) }, p.aktiv ? 'Sperren' : 'Entsperren'),
        ersetzen, loeschen,
        null))
    }
    // Alle Klassen der Schule auf einen Blick: Code, Leitung, übergeben, löschen.
    const alle = [], gesehen = new Set()
    for (const p of liste) for (const k of p.klassenListe || []) if (k.leitet && !gesehen.has(k.code)) { gesehen.add(k.code); alle.push({ ...k, leiter: p }) }
    for (const k of D.klassen) if (k.ersteller === D.lehrer.id && !gesehen.has(k.code)) { gesehen.add(k.code); alle.push({ code: k.code, name: k.name, lehrer: k.lehrer, archiviert: !!k.archiviert, geloescht: !!k.geloescht, leiter: { id: D.lehrer.id, name: D.lehrer.name } }) }
    alle.sort((x, y) => x.name.localeCompare(y.name, 'de', { numeric: true }))
    box.append(h('h2', { style: 'margin:10px 0 0' }, 'Alle Klassen (' + alle.filter(k => !k.geloescht).length + ')'))
    if (!alle.length) box.append(h('div', { class: 'lp-hinweis' }, 'Noch keine Klassen.'))
    for (const k of alle) {
      if (k.geloescht) { box.append(h('div', { class: 'lp-vk' },
        h('span', null, k.name, h('span', { class: 'lp-meta' }, 'im Papierkorb · geleitet von ' + k.leiter.name)),
        h('button', { class: 'lnk', onclick: () => tu(() => klasseWiederherstellen(k.code), '«' + k.name + '» wiederhergestellt.') }, 'Wiederherstellen'))); continue }
      const andere = liste.filter(x => x.id !== k.leiter.id && x.aktiv)
      const wahl = h('select', { class: 'in', style: 'height:36px;font-size:13px;width:auto' }, h('option', { value: '' }, 'Leitung übergeben an …'), andere.map(x => h('option', { value: x.id }, x.name)))
      wahl.addEventListener('change', () => { if (wahl.value) tu(() => verwUebergeben(k.code, wahl.value), '«' + k.name + '» wird jetzt von ' + andere.find(x => x.id === wahl.value).name + ' geleitet.') })
      const weg = h('button', { class: 'lnk lp-gefahr', onclick: () => {
        if (!weg.dataset.a) { weg.dataset.a = 1; weg.textContent = 'Wirklich löschen? Die Schüler verlieren den Zugang, die Sets aller Lehrpersonen verschwinden aus der Klasse. 30 Tage im Papierkorb.'; return }
        tu(() => klasseLoeschen(k.code), '«' + k.name + '» liegt im Papierkorb. Unter «Alle Klassen» lässt sie sich 30 Tage lang wiederherstellen.')
      } }, 'Klasse löschen')
      box.append(h('div', { class: 'lp-vk' },
        h('span', null, k.name, h('span', { class: 'lp-meta' }, 'geleitet von ' + k.leiter.name + ((k.lehrer || []).length > 1 ? ' · ' + k.lehrer.length + ' Lehrpersonen' : '') + (k.archiviert ? ' · archiviert' : ''))),
        h('span', { class: 'lp-code' + (k.archiviert ? ' aus' : ''), style: 'font-size:16px;padding:5px 8px' }, zeigeCode(k.code)),
        andere.length ? wahl : null, weg))
    }
    return box
  }
}
/** Aus der Bibliothek: dieses Set im Lehrermodus zuoberst zeigen. */
export const lehrerFokus = id => { L.fokus = id }
export const lehrerZuruecksetzen = () => { L.daten = null; L.fehler = ''; L.meldung = '' }
