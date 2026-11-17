// Kleine DOM-Hilfe: Texte werden immer als Text eingesetzt, nie als HTML.
if (typeof Element !== 'undefined' && !Element.prototype.__hfPatched) {
  const _ap = Element.prototype.append, _rc = Element.prototype.replaceChildren
  const cl = a => a.flat(Infinity).filter(x => x != null && x !== false).flatMap(x => typeof x === 'string' || typeof x === 'number' ? mathNodes(String(x)) : [x])
  Element.prototype.append = function (...a) { return _ap.apply(this, cl(a)) }
  Element.prototype.replaceChildren = function (...a) { return _rc.apply(this, cl(a)) }
  Element.prototype.__hfPatched = true
}
const MATH = /\$([^$\s](?:[^$]*?[^$\s])?)\$/g
let katexP = null
const ladeKatex = () => katexP || (katexP = Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(([m]) => m.default))
const fuelle = (sp, tex) => ladeKatex().then(k => { sp.innerHTML = k.renderToString(tex, { throwOnError: false, output: 'html' }) }).catch(() => {})
export function mathNodes(str) {
  if (str.indexOf('$') < 0) return [document.createTextNode(str)]
  const out = []; let last = 0, m; MATH.lastIndex = 0
  while ((m = MATH.exec(str))) {
    if (m.index > last) out.push(document.createTextNode(str.slice(last, m.index)))
    const sp = document.createElement('span'); sp.className = 'fml'; sp.textContent = m[1]
    fuelle(sp, m[1])
    out.push(sp); last = m.index + m[0].length
  }
  if (!out.length) return [document.createTextNode(str)]
  if (last < str.length) out.push(document.createTextNode(str.slice(last)))
  return out
}
/** Für Stellen, die mit innerHTML arbeiten: Platzhalter setzen, nach dem Einfügen `mathFuellen(root)` rufen. */
export function mathHtml(html) {
  if (html.indexOf('$') < 0) return html
  return html.replace(MATH, (_, tex) => '<span class="fml" data-tex="' + tex.replace(/"/g, '&quot;') + '">' + tex + '</span>')
}
export function mathFuellen(root) {
  root.querySelectorAll('.fml[data-tex]').forEach(sp => { const t = sp.dataset.tex.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'); sp.removeAttribute('data-tex'); fuelle(sp, t) })
}
export function h(tag, props, ...kids) {
  const e = document.createElement(tag)
  if (props) for (const k in props) {
    const v = props[k]
    if (v == null || v === false) continue
    if (k === 'class') e.className = v
    else if (k === 'style') e.style.cssText = v
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v)
    else if (k === 'value') e.value = v
    else e.setAttribute(k, v === true ? '' : v)
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue
    if (c.nodeType) e.append(c); else e.append(...mathNodes(String(c)))
  }
  return e
}
export async function kopieren(text, btn) {
  let ok = false
  try { await navigator.clipboard.writeText(text); ok = true } catch {}
  if (!ok) {
    const t = h('textarea', { style: 'position:fixed;opacity:0' }); t.value = text
    document.body.append(t); t.select()
    try { ok = document.execCommand('copy') } catch {}
    t.remove()
  }
  if (btn) { const o = btn.innerHTML; btn.textContent = ok ? '✓ Kopiert' : 'Nicht kopiert: bitte von Hand markieren'; setTimeout(() => btn.innerHTML = o, 1800) } // innerHTML: das Icon bleibt
  return ok
}

/** Die KIs, die Hirnfutter vorschlägt. Nur hier ändern (z. B. wegen Altersgrenzen der Anbieter). */
export const KIS = [['ChatGPT', 'https://chatgpt.com/'], ['Claude', 'https://claude.ai/new'], ['Gemini', 'https://gemini.google.com/app']]
/** Auftrag kopieren und gleich zeigen, wie es weitergeht: eine KI öffnen und dort einfügen. */
export async function kopierenMitKi(text, btn) {
  await kopieren(text, btn)
  if (!btn || btn.nextElementSibling?.classList.contains('ki-nach')) return
  btn.after(h('div', { class: 'ki-nach' }, 'Kopiert. Öffne jetzt eine KI und füge den Auftrag dort ein:',
    h('div', { class: 'ki-reihe' }, KIS.map(([n, u]) => h('a', { href: u, target: '_blank', rel: 'noopener' }, n + ' ↗')))))
}
