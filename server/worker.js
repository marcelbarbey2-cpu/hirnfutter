// Hirnfutter-Server: Klassencodes für Lehrpersonen.
// Cloudflare Worker mit einem KV-Speicher (Bindung: HF) und einem Geheimnis ADMIN_KEY.
// Gespeichert wird nur Lernmaterial: Klassen, Sets und Lehrpersonen (Name + Hash des Lehrercodes).
// Keine Schülerdaten. Schüler lesen nur, ohne Anmeldung.
//
// Schlüssel im Speicher:
//   lp:<hash>      → { id, name, aktiv, erstellt }          Lehrperson, gefunden über den Hash ihres Codes
//   lpid:<id>      → { hash }                               Rückverweis für die Verwaltung
//   idx:<lpId>     → { klassen: [code], sets: [id] }        alles, was einer Lehrperson gehört
//   kl:<CODE>      → { code, ersteller, lehrer: [lpId], name, sets: [{ id, lp, sichtbar, meta }], archiviert, geaendert, geloescht }
//                    Eine Klasse kann mehrere Lehrpersonen haben. Jede verwaltet nur ihre eigenen Sets darin;
//                    umbenennen, archivieren und löschen darf nur, wer sie angelegt hat (oder die Verwaltung).
//   set:<id>       → { id, lp, titel, fach, thema, typ, n, geaendert, geloescht, inhalt }
//   lehrerliste    → [lpId]                                 für die Verwaltung
// Gelöschtes wird mit Ablaufzeit (30 Tage) neu geschrieben: der Papierkorb räumt sich selbst auf.

const VERSION = '2026-11-17' // muss zu SERVER_VERSION in src/server-adresse.js passen
const ZEICHEN = '23456789ABCDEFGHJKMNPQRSTUVWXYZ' // ohne 0/O, 1/I/L
const PAPIERKORB_TAGE = 30
const MAX_SET_BYTES = 300_000
const MAX_SETS_PRO_KLASSE = 200

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() })
    try {
      return await route(request, env)
    } catch (e) {
      if (e instanceof Fehler) return json({ fehler: e.message }, e.status)
      console.error(e)
      return json({ fehler: 'Serverfehler' }, 500)
    }
  },
}

class Fehler extends Error { constructor(status, msg) { super(msg); this.status = status } }

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  }
}
function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors(), ...extra } })
}

async function route(req, env) {
  const url = new URL(req.url)
  const teile = url.pathname.replace(/\/+$/, '').split('/').filter(Boolean).map(decodeURIComponent)
  const m = req.method

  // ── öffentlich (Schüler) ──
  if (m === 'GET' && teile.length === 0) return json({ app: 'hirnfutter-server', ok: true, version: VERSION })
  if (m === 'GET' && teile[0] === 'k' && teile.length === 2) return klasseLesen(env, normCode(teile[1]))
  if (m === 'GET' && teile[0] === 's' && teile.length === 2) return setLesen(env, teile[1], normCode(url.searchParams.get('k') || ''))

  // ── Lehrperson ──
  if (teile[0] === 'lp') {
    const lp = await lehrer(req, env)
    const [, was, id, aktion] = teile
    if (m === 'GET' && !was) return json(await uebersicht(env, lp))
    if (was === 'klasse') {
      if (m === 'POST' && !id) return json(await klasseNeu(env, lp, await body(req)), 201)
      const code = normCode(id)
      if (m === 'PATCH' && !aktion) return json(await klasseAendern(env, lp, code, await body(req)))
      if (m === 'DELETE' && !aktion) return json(await klasseLoeschen(env, lp, code))
      if (m === 'POST' && aktion === 'wiederherstellen') return json(await klasseWieder(env, lp, code))
      if (m === 'POST' && aktion === 'beitreten') return json(await klasseBeitreten(env, lp, code))
      if (m === 'POST' && aktion === 'verlassen') return json(await klasseVerlassen(env, lp, code))
    }
    if (was === 'set') {
      if (m === 'PUT') return json(await setSpeichern(env, lp, id, await body(req)))
      if (m === 'DELETE' && !aktion) return json(await setLoeschen(env, lp, id))
      if (m === 'POST' && aktion === 'wiederherstellen') return json(await setWieder(env, lp, id))
      if (m === 'GET' && !aktion) return json(await setFuerLehrer(env, lp, id))
    }
  }

  // ── Verwaltung ──
  if (teile[0] === 'admin') {
    await admin(req, env)
    const [, was, id, aktion] = teile
    if (was === 'lehrer') {
      if (m === 'GET' && !id) return json(await lehrerListe(env))
      if (m === 'POST' && !id) return json(await lehrerNeu(env, await body(req)), 201)
      if (m === 'POST' && aktion === 'sperren') return json(await lehrerAktiv(env, id, false))
      if (m === 'POST' && aktion === 'entsperren') return json(await lehrerAktiv(env, id, true))
      if (m === 'POST' && aktion === 'neuer-code') return json(await lehrerNeuerCode(env, id))
      if (m === 'DELETE' && id && !aktion) return json(await lehrerLoeschen(env, id))
    }
    if (was === 'klasse' && m === 'POST' && aktion === 'uebergeben') return json(await klasseUebergeben(env, normCode(id), await body(req)))
    // Notfall-Recht der Verwaltung: Sets anderer Lehrpersonen in einer Klasse ansehen, ausblenden, entfernen, löschen
    if (was === 'klasse' && m === 'GET' && id && !aktion) return json(await verwKlasse(env, normCode(id)))
    if (was === 'klasse' && m === 'POST' && aktion === 'set' && teile[4] && teile[5]) return json(await verwKlasseSet(env, normCode(id), teile[4], teile[5]))
    if (was === 'set' && m === 'DELETE' && id && !aktion) return json(await verwSetLoeschen(env, id, true))
    if (was === 'set' && m === 'POST' && id && aktion === 'wiederherstellen') return json(await verwSetLoeschen(env, id, false))
  }
  throw new Fehler(404, 'Unbekannte Adresse')
}

// ── Hilfen ──────────────────────────────────────────────────────────────────

const normCode = c => String(c || '').toUpperCase().replace(/[^0-9A-Z]/g, '')
function zufall(n) {
  const b = new Uint8Array(n); crypto.getRandomValues(b)
  return [...b].map(x => ZEICHEN[x % ZEICHEN.length]).join('')
}
async function hash(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text).trim()))
  return [...new Uint8Array(d)].map(x => x.toString(16).padStart(2, '0')).join('')
}
async function body(req) {
  const t = await req.text()
  if (t.length > MAX_SET_BYTES * 1.2) throw new Fehler(413, 'Zu gross')
  try { return t ? JSON.parse(t) : {} } catch { throw new Fehler(400, 'Ungültige Daten') }
}
const get = async (env, k) => { const v = await env.HF.get(k); return v ? JSON.parse(v) : null }
const put = (env, k, v, opt) => env.HF.put(k, JSON.stringify(v), opt)
const ablauf = { expirationTtl: PAPIERKORB_TAGE * 86400 }
const jetzt = () => Date.now()
const text = (v, max = 80) => String(v ?? '').trim().slice(0, max)

function bearer(req) { const a = req.headers.get('Authorization') || ''; return a.startsWith('Bearer ') ? a.slice(7).trim() : '' }

async function lehrer(req, env) {
  const code = bearer(req)
  if (!code) throw new Fehler(401, 'Lehrercode fehlt')
  if (env.ADMIN_KEY && code === env.ADMIN_KEY) return { id: 'admin', name: env.ADMIN_NAME || 'Verwaltung', admin: true }
  const lp = await get(env, 'lp:' + await hash(normCode(code)))
  if (!lp) throw new Fehler(401, 'Lehrercode unbekannt')
  if (!lp.aktiv) throw new Fehler(403, 'Dieser Lehrercode ist gesperrt')
  return lp
}
async function admin(req, env) {
  if (!env.ADMIN_KEY || bearer(req) !== env.ADMIN_KEY) throw new Fehler(401, 'Nur für die Verwaltung')
}
const idxLesen = async (env, lp) => (await get(env, 'idx:' + lp.id)) || { klassen: [], sets: [] }
const idxSchreiben = (env, lp, idx) => put(env, 'idx:' + lp.id, idx)

/** Ältere Einträge (eine Lehrperson pro Klasse) in die neue Form bringen und den Namen ins aktuelle Schuljahr schieben. */
function klasseNorm(k) {
  if (!k) return k
  if (!k.ersteller) k.ersteller = k.lp
  if (!Array.isArray(k.lehrer)) k.lehrer = [k.ersteller]
  delete k.lp
  for (const e of k.sets) if (!e.lp) e.lp = k.ersteller
  if (fortschreiben(k)) gerollt.add(k)
  return k
}
const gerollt = new WeakSet() // Klassen, deren Name sich beim Laden geändert hat: beim Lesen einmal zurückschreiben
const zurueckschreiben = (env, k) => gerollt.has(k) ? put(env, 'kl:' + k.code, k, k.geloescht ? ablauf : undefined) : null

// ── Schuljahr: Klassennamen wie 26_27_Sek_E_Ia, 26_27_Sek_P_Ip (Sek E und P: römisch + klein) oder 26_27_Sek_B_1A (Sek B: arabisch + gross) ──
// Ab dem 1. August zählt der Name von selbst hoch (26_27_Sek_E_Ia → 27_28_Sek_E_IIa).
// Nach der letzten Sek wird die Klasse einmal archiviert (abgeschlossen); von Hand wieder aktivieren bleibt möglich.
// Sek P endet nach der 2. Sek (danach Gymnasium), Sek E und Sek B nach der 3. Sek.
const KLASSEN_RX = /^(\d{2})_(\d{2})_sek_([ebp])_(iii|ii|i|[123])([a-z])$/i
const ROEMISCH = ['', 'I', 'II', 'III']
function schuljahr(d = new Date()) { const y = d.getUTCFullYear(); return (d.getUTCMonth() >= 7 ? y : y - 1) % 100 } // ab August
function klassenName(jahr, sys, stufe, buchstabe) {
  const zz = n => String(n % 100).padStart(2, '0')
  return zz(jahr) + '_' + zz(jahr + 1) + '_Sek_' + sys + '_' + (sys !== 'B' ? ROEMISCH[stufe] + buchstabe.toLowerCase() : stufe + buchstabe.toUpperCase())
}
function fortschreiben(k, d = new Date()) {
  const m = KLASSEN_RX.exec(String(k.name || '').trim())
  if (!m || k.abgeschlossen) return false
  const start = +m[1], diff = (schuljahr(d) - start + 100) % 100
  if (diff === 0 || diff > 10) return false // gleiches Schuljahr, oder Name liegt in der Zukunft
  const sys = m[3].toUpperCase(), alt = /\d/.test(m[4]) ? +m[4] : ROEMISCH.indexOf(m[4].toUpperCase())
  const stufe = alt + diff
  if (stufe > (sys === 'P' ? 2 : 3)) { k.abgeschlossen = true; k.archiviert = true; k.geaendert = jetzt(); return true }
  k.name = klassenName(start + diff, sys, stufe, m[5]); k.geaendert = jetzt()
  k.jahrNeu = jetzt() // Lehrpersonen sehen damit den Hinweis, die Sets vom letzten Jahr auszublenden
  return true
}
const leitet = (k, lp) => lp.admin || k.ersteller === lp.id
async function meineKlasse(env, lp, code) {
  const k = klasseNorm(await get(env, 'kl:' + code))
  if (!k || !(k.lehrer.includes(lp.id) || lp.admin)) throw new Fehler(404, 'Klasse nicht gefunden')
  return k
}
async function geleiteteKlasse(env, lp, code) {
  const k = await meineKlasse(env, lp, code)
  if (!leitet(k, lp)) throw new Fehler(403, 'Das darf nur, wer die Klasse angelegt hat')
  return k
}
async function namen(env, ids) {
  const out = {}
  for (const id of new Set(ids)) out[id] = id === 'admin' ? (env.ADMIN_NAME || 'Verwaltung') : ((await get(env, 'lpname:' + id))?.name || '')
  return out
}
async function eigenesSet(env, lp, id) {
  const s = await get(env, 'set:' + id)
  if (!s || s.lp !== lp.id) throw new Fehler(404, 'Set nicht gefunden')
  return s
}
const setMeta = s => ({ id: s.id, titel: s.titel, fach: s.fach, thema: s.thema || '', typ: s.typ, n: s.n, geaendert: s.geaendert, geloescht: s.geloescht || null })

// ── Schüler ─────────────────────────────────────────────────────────────────

async function klasseLesen(env, code) {
  const k = klasseNorm(await get(env, 'kl:' + code))
  if (!k || k.geloescht) throw new Fehler(404, 'Diesen Klassencode gibt es nicht')
  await zurueckschreiben(env, k)
  if (k.archiviert) return json({ code: k.code, name: k.name, archiviert: true, sets: [] }, 410)
  const n = await namen(env, k.lehrer)
  const sets = k.sets.filter(e => e.sichtbar && e.meta && !e.meta.geloescht).map(e => ({ ...e.meta, von: n[e.lp] || '' }))
  return json({ code: k.code, name: k.name, lehrer: k.lehrer.map(id => n[id]).filter(Boolean), sets }, 200, { 'Cache-Control': 'no-store' })
}

async function setLesen(env, id, code) {
  const k = await get(env, 'kl:' + code)
  if (!k || k.geloescht || k.archiviert || !k.sets.some(e => e.id === id && e.sichtbar)) throw new Fehler(404, 'Set nicht verfügbar')
  const s = await get(env, 'set:' + id)
  if (!s || s.geloescht) throw new Fehler(404, 'Set nicht verfügbar')
  return json({ ...setMeta(s), inhalt: s.inhalt }, 200, { 'Cache-Control': 'no-store' })
}

// ── Lehrperson ──────────────────────────────────────────────────────────────

/** Kopie der Set-Angaben in jeder Klasse der Lehrperson nachführen, die das Set enthält. */
async function metaVerteilen(env, lp, s) {
  const meta = setMeta(s)
  for (const c of (await idxLesen(env, lp)).klassen) {
    const k = klasseNorm(await get(env, 'kl:' + c))
    if (!k || !k.sets.some(e => e.id === s.id)) continue
    k.sets = k.sets.map(e => e.id === s.id ? { ...e, meta } : e)
    await put(env, 'kl:' + c, k, k.geloescht ? ablauf : undefined)
  }
}

async function uebersicht(env, lp) {
  const idx = await idxLesen(env, lp)
  const klassen = [], sets = []
  for (const c of idx.klassen) {
    const k = klasseNorm(await get(env, 'kl:' + c))
    if (!k || !k.lehrer.includes(lp.id)) continue
    await zurueckschreiben(env, k)
    if (k.geloescht && !leitet(k, lp)) continue // von der Klassenlehrperson gelöscht
    klassen.push({ ...k, leitest: leitet(k, lp) })
  }
  for (const id of idx.sets) { const s = await get(env, 'set:' + id); if (s) sets.push(setMeta(s)) }
  // Abgelaufenes aus dem Papierkorb aus dem Verzeichnis streichen
  const alleNamen = await namen(env, klassen.flatMap(k => [...k.lehrer, ...k.sets.map(e => e.lp)]))
  if (klassen.length !== idx.klassen.length || sets.length !== idx.sets.length) {
    await idxSchreiben(env, lp, { klassen: klassen.map(k => k.code), sets: sets.map(s => s.id) })
  }
  return { lehrer: { id: lp.id, name: lp.name, admin: !!lp.admin }, klassen, sets, namen: alleNamen, papierkorbTage: PAPIERKORB_TAGE }
}

async function klasseNeu(env, lp, b) {
  const name = text(b.name, 60)
  if (!name) throw new Fehler(400, 'Name fehlt')
  let code
  for (let i = 0; i < 8; i++) { const c = zufall(6); if (!(await env.HF.get('kl:' + c))) { code = c; break } }
  if (!code) throw new Fehler(500, 'Kein freier Code gefunden')
  const k = { code, ersteller: lp.id, lehrer: [lp.id], name, sets: [], archiviert: false, geaendert: jetzt(), geloescht: null }
  await put(env, 'kl:' + code, k)
  const idx = await idxLesen(env, lp); idx.klassen.push(code); await idxSchreiben(env, lp, idx)
  return k
}

async function klasseAendern(env, lp, code, b) {
  const k = await meineKlasse(env, lp, code)
  if (k.geloescht) throw new Fehler(409, 'Klasse ist im Papierkorb')
  if ((b.name != null || b.archiviert != null) && !leitet(k, lp)) throw new Fehler(403, 'Das darf nur, wer die Klasse angelegt hat')
  if (b.name != null) { const n = text(b.name, 60); if (n && n !== k.name) { k.name = n; k.abgeschlossen = false; fortschreiben(k) } }
  if (b.archiviert != null) k.archiviert = !!b.archiviert
  if (Array.isArray(b.sets)) {
    const eigene = new Set((await idxLesen(env, lp)).sets)
    const neu = []
    for (const e of b.sets.slice(0, MAX_SETS_PRO_KLASSE)) {
      const id = text(e?.id, 20)
      if (!eigene.has(id) || neu.some(x => x.id === id)) continue
      const alt = k.sets.find(x => x.id === id)
      let meta = alt?.meta
      if (!meta) { const s = await get(env, 'set:' + id); if (!s) continue; meta = setMeta(s) }
      neu.push({ id, lp: lp.id, sichtbar: e.sichtbar !== false, meta })
    }
    // Nur die eigenen Einträge werden ersetzt; die Sets der anderen Lehrpersonen bleiben.
    k.sets = [...k.sets.filter(e => e.lp !== lp.id), ...neu].slice(0, MAX_SETS_PRO_KLASSE)
  }
  k.geaendert = jetzt()
  await put(env, 'kl:' + code, k)
  return k
}

async function klasseLoeschen(env, lp, code) {
  const k = await geleiteteKlasse(env, lp, code)
  k.geloescht = jetzt()
  await put(env, 'kl:' + code, k, ablauf)
  return k
}
async function klasseWieder(env, lp, code) {
  const k = await geleiteteKlasse(env, lp, code)
  k.geloescht = null; k.geaendert = jetzt()
  await put(env, 'kl:' + code, k)
  return k
}

async function klasseBeitreten(env, lp, code) {
  const k = klasseNorm(await get(env, 'kl:' + code))
  if (!k || k.geloescht) throw new Fehler(404, 'Diesen Klassencode gibt es nicht')
  if (!k.lehrer.includes(lp.id)) { k.lehrer.push(lp.id); k.geaendert = jetzt(); await put(env, 'kl:' + code, k) }
  const idx = await idxLesen(env, lp)
  if (!idx.klassen.includes(code)) { idx.klassen.push(code); await idxSchreiben(env, lp, idx) }
  return k
}

async function klasseVerlassen(env, lp, code) {
  const k = await meineKlasse(env, lp, code)
  if (k.ersteller === lp.id) throw new Fehler(409, 'Du hast die Klasse angelegt. Lösche sie oder lass sie von der Verwaltung übergeben.')
  k.lehrer = k.lehrer.filter(id => id !== lp.id)
  k.sets = k.sets.filter(e => e.lp !== lp.id)
  k.geaendert = jetzt()
  await put(env, 'kl:' + code, k, k.geloescht ? ablauf : undefined)
  const idx = await idxLesen(env, lp)
  idx.klassen = idx.klassen.filter(c => c !== code); await idxSchreiben(env, lp, idx)
  return { ok: true }
}

/** id = 'neu' legt an. body: { titel, fach, thema?, typ, inhalt, klassen?: [code] }. thema = Ordner, in dem die Schüler das Set sehen. */
async function setSpeichern(env, lp, id, b) {
  const inhalt = b.inhalt
  if (!inhalt || !Array.isArray(inhalt.items) || !inhalt.items.length) throw new Fehler(400, 'Set ohne Inhalt')
  if (JSON.stringify(inhalt).length > MAX_SET_BYTES) throw new Fehler(413, 'Set zu gross')
  const titel = text(b.titel || inhalt.titel, 80)
  if (!titel) throw new Fehler(400, 'Titel fehlt')
  let s
  if (id === 'neu') {
    let neuId
    for (let i = 0; i < 8; i++) { const c = zufall(10); if (!(await env.HF.get('set:' + c))) { neuId = c; break } }
    s = { id: neuId, lp: lp.id }
    const idx = await idxLesen(env, lp); idx.sets.push(neuId); await idxSchreiben(env, lp, idx)
  } else {
    s = await eigenesSet(env, lp, id)
  }
  Object.assign(s, {
    titel, fach: text(b.fach || inhalt.fach, 40), thema: text(b.thema, 40), typ: b.typ === 'karten' ? 'karten' : 'test',
    n: inhalt.items.filter(i => i && i.t !== 'info').length,
    inhalt: { v: inhalt.v || 2, titel, fach: text(b.fach || inhalt.fach, 40), items: inhalt.items },
    geaendert: jetzt(), geloescht: null,
  })
  await put(env, 'set:' + s.id, s)
  if (id !== 'neu') await metaVerteilen(env, lp, s)
  for (const c of (Array.isArray(b.klassen) ? b.klassen : []).map(normCode)) {
    const k = await get(env, 'kl:' + c)
    klasseNorm(k)
    if (k && !k.geloescht && k.lehrer.includes(lp.id) && !k.sets.some(e => e.id === s.id)) { k.sets.push({ id: s.id, lp: lp.id, sichtbar: true, meta: setMeta(s) }); k.geaendert = jetzt(); await put(env, 'kl:' + c, k) }
  }
  return setMeta(s)
}

async function setFuerLehrer(env, lp, id) { const s = await eigenesSet(env, lp, id); return { ...setMeta(s), inhalt: s.inhalt } }

async function setLoeschen(env, lp, id) {
  const s = await eigenesSet(env, lp, id)
  s.geloescht = jetzt()
  await put(env, 'set:' + id, s, ablauf)
  await metaVerteilen(env, lp, s)
  return setMeta(s)
}
async function setWieder(env, lp, id) {
  const s = await eigenesSet(env, lp, id)
  s.geloescht = null; s.geaendert = jetzt()
  await put(env, 'set:' + id, s)
  await metaVerteilen(env, lp, s)
  return setMeta(s)
}

// ── Verwaltung ──────────────────────────────────────────────────────────────

async function lehrerListe(env) {
  const ids = (await get(env, 'lehrerliste')) || []
  const out = []
  for (const id of ids) {
    const ref = await get(env, 'lpid:' + id); if (!ref) continue
    const lp = await get(env, 'lp:' + ref.hash); if (!lp) continue
    const idx = await idxLesen(env, lp)
    const klassenListe = []
    for (const c of idx.klassen) {
      const k = klasseNorm(await get(env, 'kl:' + c))
      if (k) await zurueckschreiben(env, k)
      if (k && k.lehrer.includes(lp.id)) klassenListe.push({ code: k.code, name: k.name, leitet: k.ersteller === lp.id, lehrer: k.lehrer, archiviert: !!k.archiviert, geloescht: !!k.geloescht, sets: k.sets.filter(e => e.lp === lp.id && e.sichtbar && e.meta && !e.meta.geloescht).length })
    }
    out.push({ id: lp.id, name: lp.name, aktiv: lp.aktiv, erstellt: lp.erstellt, klassen: klassenListe.filter(k => !k.geloescht).length, sets: idx.sets.length, klassenListe })
  }
  return { lehrer: out }
}
/** Verwaltung: eine Klasse mit allen Sets aller Lehrpersonen. */
async function verwKlasse(env, code) {
  const k = klasseNorm(await get(env, 'kl:' + code))
  if (!k) throw new Fehler(404, 'Klasse nicht gefunden')
  const n = await namen(env, k.sets.map(e => e.lp))
  const sets = []
  for (const e of k.sets) {
    const s = await get(env, 'set:' + e.id) // aktueller Stand, auch ob es im Papierkorb liegt
    const meta = s ? setMeta(s) : e.meta
    if (meta) sets.push({ ...meta, id: e.id, lp: e.lp, von: n[e.lp] || '', sichtbar: !!e.sichtbar, geloescht: !!(s ? s.geloescht : meta.geloescht) })
  }
  return { code: k.code, name: k.name, sets }
}
/** Verwaltung: ein Set in einer Klasse ausblenden, wieder zeigen oder aus der Klasse nehmen – egal, wem es gehört. */
async function verwKlasseSet(env, code, setId, tat) {
  const k = klasseNorm(await get(env, 'kl:' + code))
  if (!k) throw new Fehler(404, 'Klasse nicht gefunden')
  const id = text(setId, 20)
  if (!k.sets.some(e => e.id === id)) throw new Fehler(404, 'Set nicht in dieser Klasse')
  if (tat === 'ausblenden' || tat === 'zeigen') k.sets = k.sets.map(e => e.id === id ? { ...e, sichtbar: tat === 'zeigen' } : e)
  else if (tat === 'entfernen') k.sets = k.sets.filter(e => e.id !== id)
  else throw new Fehler(400, 'Unbekannte Aktion')
  k.geaendert = jetzt()
  await put(env, 'kl:' + code, k, k.geloescht ? ablauf : undefined)
  return verwKlasse(env, code)
}
/** Verwaltung: ein Set löschen (30 Tage Papierkorb) oder wiederherstellen. Die Lehrperson sieht es in ihrem Papierkorb. */
async function verwSetLoeschen(env, setId, loeschen) {
  const id = text(setId, 20)
  const s = await get(env, 'set:' + id)
  if (!s) throw new Fehler(404, 'Set nicht gefunden')
  s.geloescht = loeschen ? jetzt() : null
  if (!loeschen) s.geaendert = jetzt()
  await put(env, 'set:' + id, s, loeschen ? ablauf : undefined)
  await metaVerteilen(env, { id: s.lp }, s) // in allen Klassen der Besitzerin nachführen
  return setMeta(s)
}

/** Die Leitung einer Klasse an eine andere Lehrperson geben, die schon dabei ist (oder dazukommt). */
async function klasseUebergeben(env, code, b) {
  const k = klasseNorm(await get(env, 'kl:' + code))
  if (!k) throw new Fehler(404, 'Klasse nicht gefunden')
  const neu = text(b.lp, 20)
  const ref = await get(env, 'lpid:' + neu)
  if (!ref) throw new Fehler(404, 'Lehrperson nicht gefunden')
  if (!k.lehrer.includes(neu)) {
    k.lehrer.push(neu)
    const idx = (await get(env, 'idx:' + neu)) || { klassen: [], sets: [] }
    if (!idx.klassen.includes(code)) { idx.klassen.push(code); await put(env, 'idx:' + neu, idx) }
  }
  k.ersteller = neu; k.geaendert = jetzt()
  await put(env, 'kl:' + code, k, k.geloescht ? ablauf : undefined)
  return { code, ersteller: neu }
}

async function lehrerSpeichern(env, lp, code) {
  const h = await hash(normCode(code))
  await put(env, 'lp:' + h, lp)
  await put(env, 'lpid:' + lp.id, { hash: h })
  await put(env, 'lpname:' + lp.id, { name: lp.name })
}
async function lehrerNeu(env, b) {
  const name = text(b.name, 60)
  if (!name) throw new Fehler(400, 'Name fehlt')
  const lp = { id: zufall(8), name, aktiv: true, erstellt: jetzt() }
  const code = zufall(4) + '-' + zufall(4) + '-' + zufall(4)
  await lehrerSpeichern(env, lp, code)
  const liste = (await get(env, 'lehrerliste')) || []; liste.push(lp.id); await put(env, 'lehrerliste', liste)
  return { ...lp, code } // der Code wird nur dieses eine Mal gezeigt
}
async function lehrerFinden(env, id) {
  const ref = await get(env, 'lpid:' + id); if (!ref) throw new Fehler(404, 'Lehrperson nicht gefunden')
  const lp = await get(env, 'lp:' + ref.hash); if (!lp) throw new Fehler(404, 'Lehrperson nicht gefunden')
  return { lp, hash: ref.hash }
}
async function lehrerAktiv(env, id, aktiv) {
  const { lp, hash: h } = await lehrerFinden(env, id)
  lp.aktiv = aktiv
  await put(env, 'lp:' + h, lp)
  return { id: lp.id, name: lp.name, aktiv }
}
/**
 * Lehrperson endgültig löschen. Ihre Sets werden gelöscht und verschwinden aus allen Klassen.
 * Klassen, die sie leitet: Sind andere Lehrpersonen dabei, übernimmt die nächste die Leitung; sonst wird die Klasse aufgelöst.
 * Klassen, in denen sie nur mitunterrichtet: Sie tritt aus.
 */
async function lehrerLoeschen(env, id) {
  const { lp, hash: h } = await lehrerFinden(env, id)
  const idx = await idxLesen(env, lp)
  const erg = { name: lp.name, sets: 0, aufgeloest: 0, uebergeben: 0, verlassen: 0 }
  for (const c of idx.klassen) {
    const k = klasseNorm(await get(env, 'kl:' + c))
    if (!k || !k.lehrer.includes(lp.id)) continue
    k.lehrer = k.lehrer.filter(x => x !== lp.id)
    k.sets = k.sets.filter(e => e.lp !== lp.id)
    if (k.ersteller === lp.id) {
      if (!k.lehrer.length) { await env.HF.delete('kl:' + c); erg.aufgeloest++; continue }
      k.ersteller = k.lehrer[0]; erg.uebergeben++
    } else erg.verlassen++
    k.geaendert = jetzt()
    await put(env, 'kl:' + c, k, k.geloescht ? ablauf : undefined)
  }
  for (const s of idx.sets) { await env.HF.delete('set:' + s); erg.sets++ }
  for (const k of ['lp:' + h, 'lpid:' + lp.id, 'lpname:' + lp.id, 'idx:' + lp.id]) await env.HF.delete(k)
  const liste = (await get(env, 'lehrerliste')) || []
  await put(env, 'lehrerliste', liste.filter(x => x !== lp.id))
  return erg
}
async function lehrerNeuerCode(env, id) {
  const { lp, hash: alt } = await lehrerFinden(env, id)
  await env.HF.delete('lp:' + alt)
  const code = zufall(4) + '-' + zufall(4) + '-' + zufall(4)
  lp.aktiv = true
  await lehrerSpeichern(env, lp, code)
  return { id: lp.id, name: lp.name, code }
}
