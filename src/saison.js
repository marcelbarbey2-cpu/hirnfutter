// Nach einer Änderung neu bauen und dist hochladen. Keine Käufe werden entfernt.
// Modus: 'auto' = jährlich nach Datum, 'aus' = kein Verkauf, 'an' = sofort.
export const SAISONEN = {
 halloween: { titel: 'Halloween', modus: 'auto', von: 1025, bis: 1031, zeitraum: '25.–31. Oktober' },
 weihnachten: { titel: 'Weihnachten', modus: 'auto', von: 1201, bis: 1226, zeitraum: '1.–26. Dezember' },
}
export function saisonKaufbar(teil, datum = new Date()) {
 if (!teil.saison) return true
 const s = SAISONEN[teil.saison]
 if (!s || s.modus === 'aus') return false
 if (s.modus === 'an') return true
 if (s.modus !== 'auto' || !Number.isFinite(datum.getTime())) return false
 const tag = (datum.getMonth()+1)*100 + datum.getDate()
 return tag >= s.von && tag <= s.bis
}
export function saisonSichtbar(teil, imBesitz, datum = new Date()) {
 return imBesitz || saisonKaufbar(teil, datum)
}
