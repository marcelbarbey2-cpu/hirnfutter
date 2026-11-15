// Ein Set als Link: `#d=z…` (deflate-raw, base64url) — dasselbe Format, das die App beim Öffnen liest.
function b64url(u8) {
  let s = ''
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
export async function setLink(set) {
  const json = JSON.stringify({ v: 2, titel: set.titel, fach: set.fach, items: set.items })
  const basis = location.origin + location.pathname
  try {
    if (typeof CompressionStream === 'function') {
      const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'))
      return basis + '#d=z' + b64url(new Uint8Array(await new Response(stream).arrayBuffer()))
    }
  } catch {}
  return basis + '#d=r' + b64url(new TextEncoder().encode(json))
}
