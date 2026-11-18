// Vorlesen: Das Handy liest eine Karte vor, mit der Stimme der passenden Sprache.
// Alles läuft im Browser (Web Speech API): kein fremder Dienst, kein Konto, nichts verlässt das Gerät
// ausser dort, wo das Betriebssystem selbst eine Online-Stimme verwendet.

export const kannVorlesen = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance === 'function'

const HINWEISE = {
  'fr-FR': { zeichen: /[éèêëçàâîïôûùœ]/i, woerter: /\b(le|la|les|un|une|des|du|est|et|je|tu|il|elle|nous|vous|ils|elles|ne|pas|avec|pour|dans|sur|c'est|qu'|l'|d'|j')/gi },
  'en-GB': { zeichen: /\b\w+ing\b/i, woerter: /\b(the|a|an|is|are|was|and|to|of|you|it|what|this|that|with|have|has|do|does|my|your|in|on)\b/gi },
  'de-CH': { zeichen: /[äöü]/i, woerter: /\b(der|die|das|und|ist|ein|eine|nicht|ich|du|wir|sie|es|mit|zu|den|dem|im|auf|wie|was)\b/gi },
}
const FREMDSPRACHE = { Englisch: 'en-GB', Französisch: 'fr-FR' }

/**
 * Welche Sprache hat dieser Text? Zuerst nach Merkmalen (Akzente, häufige Wörter),
 * sonst nach der Seite: In Sprachfächern steht vorne die Fremdsprache, hinten Deutsch.
 */
export function spracheRaten(text, fach, seite) {
  const t = String(text || '')
  const punkte = Object.entries(HINWEISE).map(([lang, h]) => [lang, (t.match(h.woerter) || []).length * 2 + (h.zeichen.test(t) ? 3 : 0)])
  punkte.sort((a, b) => b[1] - a[1])
  const fremd = FREMDSPRACHE[fach]
  if (punkte[0][1] > 0 && punkte[0][1] > punkte[1][1]) {
    // In einem Sprachfach nur zwischen Fremdsprache und Deutsch wählen
    if (fremd && punkte[0][0] !== fremd && punkte[0][0] !== 'de-CH') return seite === 'front' ? fremd : 'de-CH'
    return punkte[0][0]
  }
  if (fremd) return seite === 'front' ? fremd : 'de-CH'
  return 'de-CH'
}

/** Text fürs Vorlesen säubern: Formeln, Formatierung und Hinweise wie «(f)» weg. */
function sprechText(text) {
  return String(text || '')
    .replace(/\$[^$]*\$/g, ' ')
    .replace(/[*_`#>]/g, '')
    .replace(/\((?:m|f|n|pl|m\/f|f\/m)\.?\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

let stimmen = []
function stimmenLaden() { try { stimmen = window.speechSynthesis.getVoices() || [] } catch { stimmen = [] } }
if (kannVorlesen()) { stimmenLaden(); window.speechSynthesis.addEventListener?.('voiceschanged', stimmenLaden) }

/** Beste Stimme: genau die Sprache (z. B. de-CH), sonst dieselbe Sprache aus einem anderen Land. */
function stimmeFuer(lang) {
  if (!stimmen.length) stimmenLaden()
  const genau = stimmen.filter(v => v.lang?.toLowerCase().replace('_', '-') === lang.toLowerCase())
  const gleich = stimmen.filter(v => v.lang?.toLowerCase().startsWith(lang.slice(0, 2)))
  const ersatz = lang === 'de-CH' ? stimmen.filter(v => /^de-de/i.test(v.lang?.replace('_', '-'))) : []
  const liste = genau.length ? genau : ersatz.length ? ersatz : gleich
  // Natürlich klingende Stimmen zuerst: Premium/Erweitert (iPhone), Natural/Neural (Edge, Windows), Google (Android, Chrome).
  // Die einfachen Grundstimmen klingen oft roboterhaft und kommen nur, wenn es nichts anderes gibt.
  const guete = v => /premium|enhanced|erweitert|natural|neural|siri/i.test(v.name) ? 3 : /google/i.test(v.name) ? 2 : /compact|kompakt|espeak/i.test(v.name) ? 0 : 1
  return [...liste].sort((a, b) => guete(b) - guete(a))[0] || null
}

let aktiverKnopf = null
export function stopp() {
  if (!kannVorlesen()) return
  try { window.speechSynthesis.cancel() } catch {}
  aktiverKnopf?.classList.remove('spricht'); aktiverKnopf = null
}

/** Vorlesen. Ein zweiter Tipp auf denselben Knopf hält an. */
export function vorlesen(text, lang, knopf) {
  if (!kannVorlesen()) return
  const war = aktiverKnopf
  stopp()
  if (knopf && war === knopf) return
  const satz = sprechText(text)
  if (!satz) return
  const u = new SpeechSynthesisUtterance(satz)
  u.lang = lang
  const v = stimmeFuer(lang); if (v) u.voice = v
  u.rate = lang === 'de-CH' ? 1 : 0.9 // Fremdsprachen etwas langsamer
  if (knopf) { aktiverKnopf = knopf; knopf.classList.add('spricht') }
  u.onend = u.onerror = () => { if (aktiverKnopf === knopf) { knopf?.classList.remove('spricht'); aktiverKnopf = null } }
  window.speechSynthesis.speak(u)
}
