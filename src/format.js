/* ===== Reine Funktionen: Einlesen, Prüfen, Prompts (ohne DOM) ===== */
import { fnv } from './storage.js'
export { fnv }
const BT='```';
const nz=s=>String(s==null?'':s).toLowerCase().normalize('NFC').replace(/[„“”"«»‚‘’'.,;:!?()]/g,'').replace(/\s+/g,' ').trim();
function lev(a,b){const m=a.length,n=b.length;if(!m)return n;if(!n)return m;let p=[...Array(n+1).keys()];for(let i=1;i<=m;i++){const c=[i];for(let j=1;j<=n;j++)c[j]=Math.min(p[j]+1,c[j-1]+1,p[j-1]+(a[i-1]===b[j-1]?0:1));p=c}return p[n]}
function cmp(given,answers){const g=nz(given);let best='falsch';for(const a of [].concat(answers)){const n=nz(a);if(g===n&&n!=='')return 'richtig';if(n.length>3&&g&&lev(g,n)<=1)best='beinahe'}return best}
function shuffle(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}

/* --- JSON reparieren --- */
function extractBlock(t){
  const m=[...t.matchAll(/```(?:json|JSON)?[ \t]*\r?\n?([\s\S]*?)```/g)];
  if(m.length)return m.map(x=>x[1]).sort((a,b)=>b.length-a.length)[0];
  const o=t.indexOf('```');
  if(o>=0){const nl=t.indexOf('\n',o);return nl>=0?t.slice(nl+1):t.slice(o+3)}
  return t}
function fixQuotes(t){
  return t.replace(/([\{\[,:]\s*)[“”„]/g,'$1"').replace(/[“”„](\s*[,\}\]:])/g,'"$1').replace(/[“”„]/g,"'")}
function fixStrings(t){let o='',s=false,e=false;
  for(const c of t){
    if(s){ if(e){o+=c;e=false;continue}
      if(c==='\\'){o+=c;e=true;continue}
      if(c==='"'){s=false;o+=c;continue}
      if(c==='\n'){o+='\\n';continue}
      if(c==='\r')continue;
      if(c==='\t'){o+=' ';continue}
      o+=c}
    else{ if(c==='"')s=true; o+=c}}
  return o}
function cutOuter(t){const a=t.search(/[\{\[]/);if(a<0)return t;let b=Math.max(t.lastIndexOf('}'),t.lastIndexOf(']'));return b>a?t.slice(a,b+1):t.slice(a)}
const LATEX='frac|dfrac|sqrt|times|cdot|neq|leq|geq|le|ge|ne|approx|pi|alpha|beta|gamma|delta|theta|lambda|mu|sigma|omega|rightarrow|Rightarrow|leftarrow|to|text|textbf|mathrm|left|right|div|pm|infty|sum|int|angle|circ|cdots|ldots|bar|overline|vec|sin|cos|tan|log|ln|nu|rho|tau|phi|varphi|epsilon|bigl|bigr|quad|neg|nabla|perp|parallel|triangle|degree|binom';
function fixLatex(t){return t.replace(new RegExp('(^|[^\\\\])\\\\(?=(?:'+LATEX+')(?![a-zA-Z]))','g'),'$1\\\\')}
function repairAll(t){t=extractBlock(t);t=fixLatex(t);t=fixQuotes(t);t=cutOuter(t);t=t.replace(/,\s*([}\]])/g,'$1');t=fixStrings(t);return t}
function tryParse(t){try{return {ok:true,val:JSON.parse(t)}}catch(e){return {ok:false}}}
function salvage(t){
  const st=[];let s=false,e=false;const cuts=[];
  for(let i=0;i<t.length;i++){const c=t[i];
    if(s){if(e)e=false;else if(c==='\\')e=true;else if(c==='"')s=false;continue}
    if(c==='"'){s=true;continue}
    if(c==='{'||c==='[')st.push(c);
    else if(c==='}'||c===']'){st.pop();if(c==='}')cuts.push([i,st.length])}}
  const target=t[0]==='{'?2:1;const closer=t[0]==='{'?']}':']';
  for(let k=cuts.length-1;k>=0;k--){if(cuts[k][1]===target){const r=tryParse(t.slice(0,cuts[k][0]+1)+closer);if(r.ok)return r}}
  return {ok:false}}
function parseLines(raw){
  const objs=[];let failed=0,lastFailed=false;
  const lines=extractBlock(raw).split(/\r?\n/).map(l=>l.trim()).filter(l=>l&&!l.startsWith('```'));
  for(const l of lines){
    const r=tryParse(repairAll(l.replace(/,\s*$/,'')));
    if(r.ok&&r.val&&typeof r.val==='object'){objs.push(r.val);lastFailed=false}else{failed++;lastFailed=true}}
  return {objs,failed,truncated:lastFailed,n:lines.length}}
function parseRaw(raw){
  const info={mode:'json',truncated:false,failedLines:0};
  const t=repairAll(raw);
  let r=tryParse(t);
  if(r.ok)return {val:r.val,info};
  r=salvage(t);
  if(r.ok){info.truncated=true;info.mode='gekuerzt';return {val:r.val,info}}
  const L=parseLines(raw);
  if(L.objs.length){info.mode='zeilen';info.truncated=L.truncated;info.failedLines=L.failed;return {val:{_lines:L.objs},info}}
  return {val:null,info}}

/* --- Aufgaben normalisieren --- */
const tkey=s=>String(s||'').toLowerCase().replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/[^a-z]/g,'');
const TA={kreuztabelle:'kreuztabelle',kreuzmatrix:'kreuztabelle',matrix:'kreuztabelle',kreuzwort:'kreuzwort',kreuzwoerter:'kreuzwort',kreuzwortraetsel:'kreuzwort',kreuzwoerterraetsel:'kreuzwort',raetsel:'kreuzwort',tabelle:'tabelle',tabellen:'tabelle',lueckentabelle:'tabelle',karte:'karte',karteikarte:'karte',card:'karte',karten:'karte',mc:'mc',multiplechoice:'mc',auswahl:'mc',luecke:'luecke',luecken:'luecke',lueckentext:'luecke',zuordnen:'zuordnen',zuordnung:'zuordnen',ordnen:'ordnen',woerterordnen:'ordnen',reihenfolge:'reihenfolgen',reihenfolgen:'reihenfolgen',wortbank:'wortbanken',wortbanken:'wortbanken',richtigfalsch:'richtigfalsch',fehlersuche:'fehlersuche',kurzantwort:'kurzantworten',kurzantworten:'kurzantworten',zahl:'zahlen',zahlen:'zahlen',info:'info',abschnitt:'info',merkkasten:'info'};
const TNAME={kreuztabelle:'Kreuztabelle',kreuzwort:'Kreuzworträtsel',tabelle:'Tabelle',karte:'Karte',mc:'Multiple Choice',luecke:'Lückentext',zuordnen:'Zuordnen',ordnen:'Wörter ordnen',reihenfolgen:'Reihenfolge',wortbanken:'Wortbank',richtigfalsch:'Richtig/Falsch',fehlersuche:'Fehlersuche',kurzantworten:'Kurzantwort',zahlen:'Zahl',info:'Abschnitt'};
const pick=(o,...ks)=>{for(const k of ks){if(o[k]!=null&&o[k]!=='')return o[k]}return undefined};
const str=v=>v==null?'':(typeof v==='object'?(v.text!=null?String(v.text):JSON.stringify(v)):String(v)).trim();
const arr=v=>Array.isArray(v)?v:(v==null||v===''?[]:[v]);
const bool=v=>v===true||/^(true|ja|richtig|wahr|yes|1)$/i.test(String(v).trim());
const blanks=s=>(String(s).match(/_{2,}/g)||[]).length;
function num(v){if(typeof v==='number')return v;const s=String(v).replace(/['’\s]/g,'').replace(',','.').replace(/[^0-9.\-]/g,'');return s===''?NaN:parseFloat(s)}
import { normZeichnung } from './zeichnung.js'
function normTabelle(v){
  if(!v||typeof v!=='object')return null;
  let kopf=arr(v.kopf||v.header||v.spalten).map(str),z=arr(v.zeilen||v.rows||v.daten).map(r=>arr(r).map(str)).filter(r=>r.length);
  if(!z.length)return null;
  const n=Math.max(kopf.length,...z.map(r=>r.length));
  if(n>8||z.length>20)return null;
  if(kopf.length&&kopf.length<n)kopf=kopf.concat(Array(n-kopf.length).fill(''));
  return {kopf:kopf.some(Boolean)?kopf:[],zeilen:z.map(r=>r.concat(Array(n-r.length).fill('')))}}
function normItem(o,hint){
  if(!o||typeof o!=='object')return {err:'kein Objekt'};
  const t=TA[tkey(pick(o,'t','typ','type')||hint)];
  if(!t)return {err:'Typ nicht erkannt ('+(pick(o,'t','typ','type')||hint||'ohne Typ')+')'};
  const it={t};
  const hi=arr(o.hilfen).map(str).filter(Boolean);if(hi.length)it.hilfen=hi;
  const er=str(pick(o,'erklaerung','erklärung'));if(er)it.erklaerung=er;
  switch(t){
  case'karte':{it.vorne=str(pick(o,'vorne','front','frage','begriff'));it.hinten=str(pick(o,'hinten','back','antwort','loesung','lösung','definition'));
    if(!it.vorne||!it.hinten)return {err:'Karte ohne Vorder- oder Rückseite'};break}
  case'mc':{it.frage=str(pick(o,'frage','question','text'));
    it.optionen=arr(pick(o,'optionen','antworten','choices','options')).map(str).filter(Boolean);
    if(!it.frage||it.optionen.length<2)return {err:'Multiple Choice ohne Frage oder mit weniger als 2 Optionen'};
    const r=pick(o,'richtig','loesung','lösung','antwort','korrekt');
    if(typeof r==='number'||/^\d+$/.test(String(r))){it._r=Number(r)}
    else{let i=it.optionen.findIndex(x=>nz(x)===nz(r));
      if(i<0&&/^[a-h]$/i.test(String(r).trim()))i=String(r).trim().toLowerCase().charCodeAt(0)-97;
      if(i<0)return {err:'richtige Option nicht erkennbar: «'+str(r).slice(0,30)+'»'};it.richtig=i}
    break}
  case'luecke':{it.text=str(pick(o,'text','satz','frage'));
    it.antworten=arr(pick(o,'antworten','antwort','loesung','lösung')).map(str).filter(Boolean);
    const b=blanks(it.text);
    if(!b)return {err:'Lückentext ohne ___'};
    if(it.antworten.length!==b)return {err:'Lückentext: '+b+' Lücke(n), aber '+it.antworten.length+' Antwort(en)'};break}
  case'zuordnen':{it.anweisung=str(pick(o,'anweisung','frage'))||'Ordne zu.';
    it.paare=arr(pick(o,'paare','pairs')).map(p=>Array.isArray(p)?[str(p[0]),str(p[1])]:[str(pick(p,'links','left','a','begriff')),str(pick(p,'rechts','right','b','definition'))]).filter(p=>p[0]&&p[1]);
    if(it.paare.length<2)return {err:'Zuordnen mit weniger als 2 Paaren'};it.paare=it.paare.slice(0,8);break}
  case'ordnen':{it.satz=str(pick(o,'satz','text'));it.hinweis=str(pick(o,'hinweis','uebersetzung'));
    it.ablenker=arr(o.ablenker).map(str).filter(Boolean);it.varianten=arr(o.varianten).map(str).filter(Boolean);
    if(it.satz.split(/\s+/).length<3)return {err:'Satz zu kurz zum Ordnen'};break}
  case'reihenfolgen':{it.frage=str(pick(o,'frage','anweisung'))||'Bringe in die richtige Reihenfolge.';
    it.schritte=arr(pick(o,'schritte','elemente')).map(str).filter(Boolean);
    if(it.schritte.length<3)return {err:'Reihenfolge mit weniger als 3 Elementen'};it.schritte=it.schritte.slice(0,7);break}
  case'wortbanken':{it.text=str(o.text);it.antworten=arr(o.antworten).map(str).filter(Boolean);it.ablenker=arr(o.ablenker).map(str).filter(Boolean);
    const b=blanks(it.text);
    if(!b)return {err:'Wortbank ohne ___'};
    if(b!==it.antworten.length)return {err:'Wortbank: '+b+' Lücke(n), aber '+it.antworten.length+' Antwort(en)'};break}
  case'richtigfalsch':{it.aussage=str(pick(o,'aussage','frage','text'));
    if(!it.aussage)return {err:'Aussage fehlt'};
    if(pick(o,'richtig','loesung','antwort')===undefined)return {err:'Richtig/Falsch ohne Lösung'};
    it.richtig=bool(pick(o,'richtig','loesung','antwort'));
    it.begruendungen=arr(o.begruendungen).map(b=>typeof b==='string'?{text:b,richtig:false}:{text:str(b.text),richtig:bool(b.richtig)}).filter(b=>b.text);
    if(it.begruendungen.length&&!it.begruendungen.some(b=>b.richtig))it.begruendungen=[];break}
  case'fehlersuche':{it.satz=str(o.satz);it.fehlerfrei=bool(o.fehlerfrei);it.fehlerwort=str(o.fehlerwort);it.korrektur=str(o.korrektur);it.art=str(o.art);
    if(!it.satz)return {err:'Satz fehlt'};
    if(!it.fehlerfrei){if(!it.fehlerwort||!it.korrektur)return {err:'Fehlersuche ohne Fehlerwort oder Korrektur'};
      if(!it.satz.split(/\s+/).some(w=>nz(w)===nz(it.fehlerwort)))return {err:'Fehlerwort «'+it.fehlerwort+'» steht nicht im Satz'}}break}
  case'kurzantworten':{it.frage=str(o.frage);it.muster=str(pick(o,'muster','musterloesung','antwort'));it.kriterien=arr(o.kriterien).map(str).filter(Boolean);it.stichwoerter=arr(pick(o,'stichwoerter','stichwörter','schluesselwoerter','woerter','keywords')).map(str).filter(Boolean).slice(0,8);
    if(!it.frage||!it.muster)return {err:'Kurzantwort ohne Frage oder Muster'};{const z=Math.round(num(o.zeilen));if(z>=1)it.zeilen=Math.min(15,z)}break}
  case'info':{it.titel=str(o.titel);it.text=str(pick(o,'text','inhalt'));if(!it.titel&&!it.text)return {err:'Abschnitt ohne Titel und Text'};break}
  case'kreuztabelle':{it.frage=str(o.frage);it.zeilen=arr(o.zeilen).map(str).filter(Boolean);it.spalten=arr(o.spalten).map(str).filter(Boolean);
    if(it.zeilen.length<2||it.spalten.length<2||it.zeilen.length>12||it.spalten.length>8)return {err:'Kreuztabelle braucht 2–12 Zeilen und 2–8 Spalten'};
    const kr=arr(pick(o,'kreuze','loesung','lösung','antworten'));
    it.kreuze=it.zeilen.map((_,r)=>arr(kr[r]).map(c=>{if(typeof c==='number'||/^\d+$/.test(String(c).trim()))return Number(c);let i=it.spalten.findIndex(s=>nz(s)===nz(c));if(i<0&&/^[a-h]$/i.test(String(c).trim()))i=String(c).trim().toLowerCase().charCodeAt(0)-97;return i}).filter(c=>c>=0&&c<it.spalten.length));
    if(!it.kreuze.some(k=>k.length))return {err:'Kreuztabelle ohne Lösung (kreuze)'};break}
  case'kreuzwort':{it.frage=str(o.frage)||'Löse das Kreuzworträtsel.';
    it.woerter=arr(pick(o,'woerter','wörter','begriffe','items')).map(w=>Array.isArray(w)?{wort:str(w[0]),hinweis:str(w[1])}:{wort:str(pick(w,'wort','loesung','lösung','begriff')),hinweis:str(pick(w,'hinweis','frage','umschreibung','definition'))}).filter(w=>w.wort&&/[A-Za-zÄÖÜäöüß]{2,}/.test(w.wort));
    if(it.woerter.length<4||it.woerter.length>16)return {err:'Kreuzworträtsel braucht 4–16 Wörter'};break}
  case'tabelle':{it.frage=str(o.frage);it.tabelle=normTabelle(o.tabelle);
    if(!it.tabelle)return {err:'Tabelle ohne lesbare Zeilen'};
    const nb=it.tabelle.zeilen.flat().reduce((s,c)=>s+blanks(c),0);
    it.antworten=arr(pick(o,'antworten','antwort','loesung','lösung')).map(str);
    if(nb<1)return {err:'Tabelle ohne Lücken (___)'};
    if(it.antworten.length!==nb)return {err:'Tabelle: '+nb+' Lücken, aber '+it.antworten.length+' Antworten'};break}
  case'zahlen':{it.frage=str(o.frage);it.antwort=num(pick(o,'antwort','loesung','lösung'));it.einheit=str(o.einheit);it.toleranz=isNaN(num(o.toleranz))?0:Math.abs(num(o.toleranz));it.weg=str(o.weg);
    if(!it.frage||isNaN(it.antwort))return {err:'Zahlenaufgabe ohne Frage oder numerische Antwort'};break}
  }
  if(t!=='tabelle'&&t!=='karte'&&o.tabelle){const tb=normTabelle(o.tabelle);if(tb)it.tabelle=tb}
  if(t!=='karte'&&o.zeichnung){const zg=normZeichnung(o.zeichnung);if(zg)it.zeichnung=zg}
  return {item:it}}
function mainText(it){switch(it.t){case'karte':return it.vorne;case'mc':case'zahlen':case'kurzantworten':case'tabelle':case'kreuztabelle':return it.frage;case'kreuzwort':return it.frage+it.woerter[0].wort;case'zuordnen':return it.paare[0][0]+'|'+it.paare[1][0];case'reihenfolgen':return it.frage+it.schritte[0];case'richtigfalsch':return it.aussage;default:return it.satz||it.text||''}}
const itemKey=it=>it.t==='karte'?fnv(it.vorne):fnv(it.t+':'+mainText(it)+(it.zeichnung?'|'+JSON.stringify(it.zeichnung.punkte||it.zeichnung.werte||it.zeichnung.marken||it.zeichnung.ereignisse||''):''));
function solText(it){switch(it.t){
  case'karte':return it.hinten;
  case'mc':return it.optionen[it.richtig];
  case'luecke':return it.antworten.join(', ');
  case'zuordnen':return it.paare.map(p=>p[0]+' = '+p[1]).join('; ');
  case'ordnen':return it.satz;
  case'reihenfolgen':return it.schritte.join(' → ');
  case'wortbanken':{let i=0;return it.text.replace(/_{2,}/g,()=>it.antworten[i++])}
  case'richtigfalsch':{const b=(it.begruendungen||[]).find(b=>b.richtig);return (it.richtig?'Richtig':'Falsch')+(b?' ('+b.text+')':'')}
  case'fehlersuche':return it.fehlerfrei?'Kein Fehler':it.fehlerwort+' → '+it.korrektur;
  case'kurzantworten':return it.muster;
  case'zahlen':return (it.antwort+' '+it.einheit).trim();
  case'tabelle':return it.antworten.join(', ');
  case'kreuztabelle':return it.zeilen.map((z,r)=>z+': '+(it.kreuze[r].map(c=>it.spalten[c]).join(', ')||'–')).join('; ');
  case'kreuzwort':return it.woerter.map(w=>w.wort).join(', ');}
  return ''}
function frageText(it){switch(it.t){case'karte':return it.vorne;case'luecke':case'wortbanken':return it.text;case'zuordnen':return it.anweisung;case'ordnen':case'fehlersuche':return it.satz;case'richtigfalsch':return it.aussage;case'info':return it.titel||it.text;default:return it.frage||''}}

/* --- Ganzes Set aus der KI-Antwort --- */
function toItems(val,hintTypes){
  let raw=[];
  if(Array.isArray(val))raw=val.map(o=>({o}));
  else if(val&&val._lines)raw=val._lines.map(o=>({o}));
  else if(val&&typeof val==='object'){
    if(Array.isArray(val.items))raw=val.items.map(o=>({o}));
    else{let any=false;for(const k of Object.keys(val)){const ty=TA[tkey(k)];if(ty&&Array.isArray(val[k])){any=true;val[k].forEach(o=>raw.push({o,hint:ty}))}}
      if(!any){const ks=Object.keys(val);if(ks.length===1&&val[ks[0]]&&typeof val[ks[0]]==='object')return toItems(val[ks[0]]);if(val.t||val.vorne)raw=[{o:val}]}}}
  const items=[],problems=[];
  raw.forEach((r,i)=>{const n=normItem(r.o,r.hint);if(n.item)items.push(n.item);else problems.push('Aufgabe '+(i+1)+': '+n.err)});
  const mcs=items.filter(i=>i.t==='mc'&&i._r!==undefined);let base1=false;
  if(mcs.length){base1=mcs.some(i=>i._r===i.optionen.length)||(mcs.length>=5&&mcs.every(i=>i._r>=1));
    if(base1)problems.push('Hinweis: Die KI hat die richtige Option ab 1 gezählt, die App hat das umgerechnet.');
    for(const i of mcs){const idx=base1?i._r-1:i._r;delete i._r;if(idx>=0&&idx<i.optionen.length)i.richtig=idx;else i._bad=true}}
  const good=items.filter(i=>{if(i._bad){problems.push('Multiple Choice «'+i.frage.slice(0,40)+'»: Nummer der richtigen Option ausserhalb der Liste');return false}return true});
  return {items:good.map(ohneKopf).filter(Boolean),problems}}

// ── Blattkopf (Name, Klasse, Datum, Punkte, Note) ──
// Wer ein Papierblatt als Vorlage gibt, bekommt von der KI oft dessen Kopf mit. In der App braucht es ihn nicht:
// Man erstellt für sich selbst, und auch auf dem Ausdruck steht bewusst kein Name.
const KOPF_WORT='(?:vor-?\\s*und\\s*nachname|vorname|nachname|name|klasse|datum|punkte|punktzahl|note|zeit|unterschrift(?:\\s+der\\s+eltern)?)';
const KOPF_FELD=new RegExp(KOPF_WORT+'\\s*:?[\\s_.…]*(?:\\/\\s*\\d+)?','gi');
const KOPF_MARKE=new RegExp(KOPF_WORT+'\\s*(?::|_{2,}|\\.{3,}|…)','i');
/** Ist das eine reine Kopfzeile wie «Name: ____  Klasse: ____  Datum: ____»? */
function istKopfzeile(z){const t=String(z||'');return KOPF_MARKE.test(t)&&!t.replace(KOPF_FELD,'').replace(/\b(und|oder)\b/gi,'').replace(/[\s|·,;:\-–—_.…/()]/g,'')}
/** Abschnitt ohne Kopfzeilen. null, wenn danach nichts übrig bleibt. Andere Aufgaben bleiben unverändert. */
function ohneKopf(it){
  if(!it||it.t!=='info')return it;
  const text=String(it.text||'').split('\n').filter(z=>!istKopfzeile(z)).join('\n').trim();
  const titel=istKopfzeile(it.titel)?'':it.titel;
  let tabelle=it.tabelle;
  if(tabelle){const zellen=[...(tabelle.kopf||[]),...(tabelle.zeilen||[]).flat()].map(c=>String(c||'').trim()).filter(Boolean);
    if(zellen.length&&zellen.every(c=>istKopfzeile(c)||new RegExp('^'+KOPF_WORT+'$','i').test(c)||/^[_.…\s]+$/.test(c)))tabelle=undefined}
  if(!titel&&!text&&!tabelle&&!it.zeichnung)return null;
  if(titel===it.titel&&text===String(it.text||'').trim()&&tabelle===it.tabelle)return it;
  const neu={...it,titel,text};if(tabelle)neu.tabelle=tabelle;else delete neu.tabelle;return neu}
const SA={erklaeren:'erklaeren',erklaerung:'erklaeren',erklären:'erklaeren',beispiel:'beispiel',aufgabe:'aufgabe',zusammenfassung:'zusammenfassung'};
function normLektion(o,steps,problems){
  const L={titel:str(o.titel)||'Lektion',klasse:o.klasse,ziele:arr(o.ziele).map(str).filter(Boolean),schritte:[]};
  addSteps(L,steps,problems);return L}
function addSteps(L,steps,problems){
  const off=L.ziele.length&&steps.some(s=>Number(s.ziel)===L.ziele.length)&&!steps.some(s=>Number(s.ziel)===0)?1:0;
  steps.forEach((s,i)=>{
    const k=SA[tkey(s.s||s.schritt||s.typ||'')]||(s.item||s.frage?'aufgabe':s.text?'erklaeren':null);
    if(!k){problems.push('Schritt '+(L.schritte.length+1)+': Schritttyp nicht erkannt');return}
    const st={s:k};if(s.ziel!=null&&!isNaN(Number(s.ziel)))st.ziel=Number(s.ziel)-off;
    if(k==='aufgabe'){const n=normItem(s.item||s,s.t||s.itemtyp||'');
      if(!n.item){problems.push('Schritt '+(L.schritte.length+1)+' (Aufgabe): '+n.err);return}
      if(n.item._r!==undefined){const r=n.item._r;delete n.item._r;n.item.richtig=r;if(r>=n.item.optionen.length&&r-1<n.item.optionen.length)n.item.richtig=r-1;if(n.item.richtig>=n.item.optionen.length){problems.push('Schritt '+(L.schritte.length+1)+': Nummer der richtigen Option ausserhalb der Liste');return}}
      st.item=n.item;const h=arr(s.hilfen).map(str).filter(Boolean);if(h.length)st.hilfen=h}
    else{st.text=str(s.text);if(!st.text){problems.push('Schritt '+(L.schritte.length+1)+': ohne Text');return}}
    L.schritte.push(st)})}
function parseAnswer(raw,typ){
  const P=parseRaw(raw);const out={typ,titel:'',fach:'',items:[],lektion:null,problems:[],truncated:P.info.truncated,info:P.info,ok:false};
  if(!P.val){out.problems.push('Die Antwort enthält kein lesbares JSON.');return out}
  let val=P.val;
  if(typ==='tutor'){
    let head=null,steps=[];
    if(val._lines){const ls=val._lines;head=ls.find(o=>tkey(o.t)==='lektion'||o.ziele)||{};steps=ls.filter(o=>o!==head)}
    else{if(!val.schritte&&Object.keys(val).length===1&&typeof Object.values(val)[0]==='object')val=Object.values(val)[0];head=val;steps=arr(val.schritte)}
    out.lektion=normLektion(head,steps,out.problems);out.titel=out.lektion.titel;
    out.ok=out.lektion.schritte.length>0;
    if(!out.ok)out.problems.push('Keine brauchbaren Schritte gefunden.');
    return out}
  const r=toItems(val);out.items=r.items;out.problems=r.problems;
  out.titel=(val&&!Array.isArray(val)&&val.titel)?str(val.titel):'';out.fach=(val&&!Array.isArray(val)&&val.fach)?str(val.fach):'';
  out.ok=out.items.length>0;if(!out.ok)out.problems.push('Keine brauchbaren Aufgaben gefunden.');
  return out}
function parseRest(raw,lek,problems){
  const L=parseLines(raw);let steps=L.objs;
  if(!steps.length){const P=parseRaw(raw);if(P.val)steps=Array.isArray(P.val)?P.val:arr(P.val.schritte)}
  const before=lek.schritte.length;addSteps(lek,steps.filter(o=>!(o.ziele&&!o.s)),problems);return {added:lek.schritte.length-before,truncated:L.truncated}}

/* --- Prompts --- */
const FORMS={
karte:'{"t":"karte","vorne":"Dativ","hinten":"Frage: wem?"}',
mc:'{"t":"mc","frage":"…","optionen":["…","…","…","…"],"richtig":1,"erklaerung":"…"}   (richtig = Nummer der richtigen Option, die erste Option hat die Nummer 0)',
luecke:'{"t":"luecke","text":"Gestern ___ ich ins Kino.","antworten":["ging"],"erklaerung":"…"}   (genau so viele antworten wie ___)',
zuordnen:'{"t":"zuordnen","anweisung":"Ordne zu.","paare":[["Begriff 1","Zuordnung 1"],["Begriff 2","Zuordnung 2"],["Begriff 3","Zuordnung 3"]]}   (3 bis 6 Paare)',
ordnen:'{"t":"ordnen","satz":"I have been waiting for an hour.","hinweis":"Ich warte seit einer Stunde.","ablenker":["was"],"erklaerung":"have + been + -ing"}   (satz hat mindestens 4 Wörter; hinweis ist die deutsche Übersetzung)',
reihenfolgen:'{"t":"reihenfolgen","frage":"Bringe die Ereignisse in die richtige Reihenfolge (älteste zuerst).","schritte":["…","…","…"]}   (schritte stehen in der RICHTIGEN Reihenfolge, 3 bis 7 Stück)',
wortbanken:'{"t":"wortbanken","text":"Die ___ ist die Hauptstadt der ___.","antworten":["Bern","Schweiz"],"ablenker":["Zürich"]}   (genau so viele antworten wie ___, in der Reihenfolge der Lücken)',
richtigfalsch:'{"t":"richtigfalsch","aussage":"Der Rhein fliesst in die Nordsee.","richtig":true,"begruendungen":[{"text":"Er mündet bei Rotterdam.","richtig":true},{"text":"Er mündet im Mittelmeer.","richtig":false}]}   (begruendungen sind optional; wenn vorhanden, genau eine davon richtig)',
fehlersuche:'{"t":"fehlersuche","satz":"Gestern gehe ich ins Kino.","fehlerwort":"gehe","korrektur":"ging","art":"Zeitform"}   (bei Sätzen ohne Fehler: {"t":"fehlersuche","satz":"…","fehlerfrei":true}; fehlerwort muss genau so im Satz stehen)',
kurzantworten:'{"t":"kurzantworten","frage":"Erkläre, warum …","muster":"Mustersatz in 1 bis 2 Sätzen","stichwoerter":["Wort1","Wort2","Wort3"],"kriterien":["Zusammenhang, der genannt sein muss","…"],"zeilen":3}   (stichwoerter = 2 bis 5 einzelne Wörter, die in einer richtigen Antwort vorkommen müssen, in der Grundform und so, wie sie im Mustersatz stehen; kriterien = Zusammenhänge in Worten; zeilen = Schreibzeilen, optional)',
zahlen:'{"t":"zahlen","frage":"Ein Quadrat hat die Seitenlänge 6 cm. Wie gross ist der Umfang?","antwort":24,"einheit":"cm","toleranz":0,"weg":"U = 4 · a"}   (antwort ist eine Zahl)',
tabelle:'{"t":"tabelle","frage":"Ergänze die Wertetabelle zu y = 2x + 1.","tabelle":{"kopf":["x","y"],"zeilen":[["1","3"],["2","___"],["3","___"]]},"antworten":["5","7"],"weg":"y = 2·x + 1"}   (Lückentabelle: Lücken ___ in den Zellen, antworten zeilenweise von links oben nach rechts unten; höchstens 8 Spalten und 20 Zeilen)',
kreuztabelle:'{"t":"kreuztabelle","frage":"Kreuze an, was zu welchem Land passt.","zeilen":["Bern","Paris","Genf"],"spalten":["Schweiz","Frankreich"],"kreuze":[["Schweiz"],["Frankreich"],["Schweiz"]]}   (kreuze: pro Zeile die zutreffenden Spalten, in der Reihenfolge der Zeilen; höchstens 12 Zeilen und 8 Spalten)',
kreuzwort:'{"t":"kreuzwort","frage":"Löse das Kreuzworträtsel.","woerter":[{"wort":"Aare","hinweis":"Fluss durch Bern"},{"wort":"Rhein","hinweis":"Fluss durch Basel"},{"wort":"Jura","hinweis":"Gebirge im Nordwesten"},{"wort":"Alpen","hinweis":"Grösstes Gebirge der Schweiz"}]}   (6 bis 12 Wörter mit 3 bis 10 Buchstaben ohne Leerzeichen, Umlaute als AE, OE, UE; die App legt das Gitter selbst an, du lieferst nur Wörter und Hinweise)',
info:'{"t":"info","titel":"Aufgabe 1: Fremdwörter","text":"Merkkasten, Erklärung oder Anweisung, wie sie auf dem Blatt steht (text darf leer sein)"}   (keine Aufgabe, nur Text auf dem Blatt)'};
const ZEICHNUNG_REGEL=`

Zeichnungen: Jede Aufgabe und jeder Abschnitt (ausser Karten) darf ein Feld "zeichnung" haben. Du beschreibst die Zeichnung als Daten, die App zeichnet sie genau. Fotos, Karten und realistische Bilder gibt es nicht: Stelle keine Aufgaben, die ein solches Bild brauchen.
"zeichnung":{"art":"gitter","bereich":[-6,6,-6,6],"punkte":{"A":[1,1],"B":[4,1],"C":[4,3],"Z":[0,0]},"vielecke":[["A","B","C"]],"strecken":[["A","Z"]],"kreise":[{"m":"Z","r":2}],"abbildung":{"art":"drehung","zentrum":"Z","winkel":90,"figur":["A","B","C"]}}
   (Koordinatengitter; bereich = [xmin,xmax,ymin,ymax], höchstens 30 breit; nur ganzzahlige oder einfache Koordinaten. abbildung ist freiwillig: "drehung" mit zentrum und winkel (positiv = Gegenuhrzeigersinn), "spiegelung" mit "achse":["P","Q"] (zwei Punkte der Spiegelachse), "schiebung" mit "vektor":[3,-2]. Die App berechnet das Bild selbst und zeigt es erst mit der Lösung; die Bildpunkte müssen im Bereich liegen. Frage dann nach Koordinaten, z. B. als Lückentext "A′ ( ___ | ___ )".)
"zeichnung":{"art":"diagramm","typ":"saeulen","titel":"Niederschlag Bern","einheit":"mm","werte":[["Jan",60],["Feb",55],["Mär",70]]}   (typ: saeulen, linie oder kreis)
"zeichnung":{"art":"zahlenstrahl","von":0,"bis":2,"schritt":0.25,"marken":{"A":0.75,"B":1.5}}
"zeichnung":{"art":"zeitstrahl","von":1789,"bis":1815,"ereignisse":[[1789,"Sturm auf die Bastille"],[1804,"Napoleon wird Kaiser"]]}
Eine Aufgabe mit Zeichnung, z. B.: {"t":"luecke","text":"Drehe das Dreieck ABC um 90° um Z. A′ ( ___ | ___ ), B′ ( ___ | ___ )","antworten":["-1","1","-1","4"],"zeichnung":{…}}`;
const BLATT_TYPEN=['info','tabelle','kreuztabelle','kreuzwort','luecke','mc','zuordnen','ordnen','reihenfolgen','wortbanken','richtigfalsch','fehlersuche','kurzantworten','zahlen'];
const MIX={Deutsch:['ordnen','luecke','wortbanken','fehlersuche','mc'],Englisch:['ordnen','luecke','wortbanken','fehlersuche','mc'],Französisch:['ordnen','luecke','wortbanken','fehlersuche','mc'],Geschichte:['reihenfolgen','richtigfalsch','kurzantworten','mc','zuordnen'],Geografie:['richtigfalsch','zahlen','mc','zuordnen'],Biologie:['reihenfolgen','wortbanken','kurzantworten','mc'],Mathematik:['zahlen','mc','kurzantworten','luecke'],'Natur und Technik':['zahlen','wortbanken','reihenfolgen','kurzantworten','mc','zuordnen'],Geometrie:['zahlen','mc','kurzantworten'],Anderes:['mc','luecke','richtigfalsch','zuordnen']};
const REGELN=`REGELN
- Antworte ausschliesslich mit JSON in einem einzigen Codeblock (${BT}json … ${BT}), ohne Text davor oder danach.
- Schweizer Rechtschreibung: ss statt ß.
- Nenne nur Fakten, bei denen du sicher bist, oder stütze dich auf das gelieferte Material. Erfinde nichts.
- Verwende innerhalb von Texten keine geraden Anführungszeichen ("), sondern «…».
- Formeln, Brüche, Wurzeln, Potenzen usw. als LaTeX zwischen Dollarzeichen, z. B. $\\frac{3}{4}$ oder $x^2$. Im JSON muss jeder Backslash doppelt stehen (\\\\frac). Einfache Rechnungen wie 3 + 4 brauchen kein LaTeX.
- Niveau und Wortschatz passend zur Klasse, kurze klare Sätze.`;
function promptKarten(c){return `Du bist eine erfahrene Lehrperson an einer Schweizer Sekundarschule (Fach ${c.fach}, Klasse ${c.klasse}).
${String(c.anzahl||'').trim()?`Erstelle ${c.anzahl} Karteikarten (Art: ${c.karteart}) zum folgenden Thema bzw. Material.`:`Erstelle Karteikarten (Art: ${c.karteart}) zum folgenden Material. Mache aus jedem Eintrag der Liste bzw. jedem Begriff, jeder Vokabel und jedem Fakt im Material genau eine Karte. Lass keinen Eintrag weg und erfinde keine dazu. Ist nur ein Thema ohne Liste angegeben, erstelle etwa 15 Karten.`}

THEMA / MATERIAL:
"""
${c.thema}
"""

${REGELN}
- Pro Karte genau eine Information. Rückseiten kurz (ein Wort bis ein Satz).
- Bei langen Listen: ein Objekt pro Zeile und kein Text dazwischen, damit nichts abgeschnitten wird.
- Vokabeln: Vorderseite in der Fremdsprache, Rückseite Deutsch (bei Bedarf umgekehrt, wenn das Material das so zeigt).

FORMAT
{"v":2,"titel":"kurzer Titel","fach":"${c.fach}","items":[
  ${FORMS.karte},
  …
]}`}
function promptTest(c){const mix=c.blatt?BLATT_TYPEN:(MIX[c.fach]||MIX.Anderes);
  return `Du bist eine erfahrene Lehrperson an einer Schweizer Sekundarschule (Fach ${c.fach}, Klasse ${c.klasse}).${c.schwierigkeit&&!c.fehler?` Schwierigkeit der Aufgaben: ${c.schwierigkeit.toLowerCase()}${c.schwierigkeit==='Mittel'?'':' (mehrheitlich '+c.schwierigkeit.toLowerCase()+'e Aufgaben)'}.`:''}
${c.fehler?`Ein Schüler hat ein Aufgabenset gelöst und bei den unten stehenden Aufgaben Fehler gemacht. Erstelle ein NEUES Aufgabenset mit etwa ${c.anzahl} Aufgaben, das genau diese Schwierigkeiten behebt. Beginne jeden Teil mit einem kurzen "info"-Abschnitt, der die Sache in 2 bis 4 einfachen Sätzen mit einem neuen Beispiel erklärt (anders als zuvor), und stelle danach 2 bis 3 neue Aufgaben dazu. Wiederhole keine Aufgabe aus dem Protokoll.`:c.blatt?`Baue ein druckbares Arbeitsblatt zum folgenden Material bzw. Thema. Das Blatt wird ausgedruckt und auf Papier bearbeitet.\nIst das Material ein bestehendes Arbeitsblatt oder eine Aufgabensammlung, dient es nur als VORLAGE: Übernimm Aufbau, Abschnitte, Aufgabenarten, Anzahl der Aufgaben und Schwierigkeit, aber erfinde ganz neue Aufgaben mit neuen Inhalten, neuen Sätzen und neuen Zahlen. Schreibe keine Aufgabe der Vorlage ab, denn die Schüler sollen üben und nicht dasselbe nochmals lösen. Lass den Kopf des Blatts weg: keine Felder für Name, Klasse, Datum, Punkte oder Note.\nIst das Material nur ein Thema oder ein Lehrtext: Erstelle ein neues Blatt mit etwa ${c.anzahl} Aufgaben.`:`Erstelle ${c.anzahl} Aufgaben zur Testvorbereitung zum folgenden Thema bzw. Material.`} ${c.blatt?'':' Verteile sie abwechslungsreich auf die erlaubten Aufgabentypen.'}${(c.fach==='Englisch'||c.fach==='Französisch')?`\nAufgabensätze sind auf ${c.fach==='Englisch'?'Englisch':'Französisch'}, Hinweise und Erklärungen auf Deutsch.`:''}

${c.fehler?'FEHLERPROTOKOLL:':'THEMA / MATERIAL:'}
"""
${c.thema}
"""

${REGELN}
- Eine Aufgabe prüft genau eine Sache. Bei Multiple Choice genau eine richtige Option und plausible falsche.${c.blatt?'\n- Jede Aufgabe muss auf Papier eindeutig lösbar sein und genau eine richtige Lösung haben. Gib keine Hilfen (kein Feld "hilfen").\n- Wähle für jede Aufgabe des Blatts den passendsten Typ: Rechenaufgaben als "zahlen" (Teilaufgaben a), b), c) je als eigene Aufgabe; die App nummeriert alle Aufgaben fortlaufend selbst, schreibe deshalb keine Aufgabennummern in die Frage, nur Teilbuchstaben wie «a)» und die Überschriften der Aufgabengruppen in \"info\"-Abschnitte), offene Fragen und Schreibaufgaben als "kurzantworten" ("zeilen" = Schreibzeilen), Überschriften, Merkkästen, Erklärtexte und Anweisungen als "info".\n- Rechne alle Lösungen sorgfältig nach.\n- Bilder, Tabellen und Zeichnungen kannst du nicht abbilden: Beschreibe sie als Text, wenn es sinnvoll ist, sonst lass die Aufgabe weg und schreibe am Ende einen "info"-Abschnitt "Nicht übernommen: …".':''}
- Erlaubte Aufgabentypen (nur diese): ${mix.join(', ')}

FORMAT
{"v":2,"titel":"kurzer Titel","fach":"${c.fach}","items":[
${mix.map(t=>'  '+FORMS[t]+',').join('\n')}
  …
]}
Jedes Element von "items" hat ein Feld "t" mit dem Typnamen. ${c.blatt?'Die Beispiele zeigen je ein Element, verwende nur die Typen, die zum Material passen, mit eigenem Inhalt.':'Die Beispiele zeigen je eine Aufgabe, verwende jeden Typ mehrfach mit eigenem Inhalt.'} ${c.blatt?'Optional hat jede Aufgabe "erklaerung" (ein Satz). Jede Aufgabe (ausser Karten und Tabellen) darf ausserdem ein Feld "tabelle":{"kopf":["…","…"],"zeilen":[["…","…"]]} haben, das Daten als Tabelle anzeigt (z. B. Messwerte).'+ZEICHNUNG_REGEL:'Optional hat jede Aufgabe "erklaerung" (ein Satz) und "hilfen" (1 bis 2 Hinweise, vom leichten zum deutlichen).'}`}
const TUTOR_REGELN=`TUTOR-REGELN
- Du erstellst eine Lektion, die eine App Schritt für Schritt abspielt. Du führst KEIN Gespräch.
- Höchstens 8 Schritte. Eine neue Sache pro Schritt, eine Frage nach der anderen.
- Jeder Schritt gehört zu einem Lernziel (Nummer in "ziel", die erste Nummer ist 0).
- Gestufte Hilfen: bei jeder Aufgabe 2 Hilfen, erst ein Hinweis, dann ein deutlicher Tipp, aber nie die Lösung.
- Niveau, Wortschatz und Beispiele passend zur Klasse.`;
const TUTOR_FORMAT=`FORMAT: Ein Schritt pro Zeile, jede Zeile ein vollständiges JSON-Objekt (kein Komma am Zeilenende), alles in einem Codeblock.
Zeile 1 (Kopf): {"t":"lektion","titel":"…","klasse":7,"ziele":["Ziel 0","Ziel 1"]}
Danach die Schritte:
{"s":"erklaeren","ziel":0,"text":"Kurze Erklärung in 2 bis 4 Sätzen."}
{"s":"beispiel","ziel":0,"text":"Ein Beispiel mit [Hervorhebung]."}
{"s":"aufgabe","ziel":0,"item":{"t":"mc","frage":"…","optionen":["…","…","…","…"],"richtig":1,"erklaerung":"…"},"hilfen":["Hinweis …","Tipp …"]}
{"s":"zusammenfassung","text":"Das Wichtigste in 2 bis 3 Sätzen."}
Erlaubte Aufgabentypen in "item": mc, luecke, wortbanken, ordnen, richtigfalsch, fehlersuche, kurzantworten, zahlen. Formate:
${['mc','luecke','wortbanken','ordnen','richtigfalsch','fehlersuche','kurzantworten','zahlen'].map(t=>FORMS[t]).join('\n')}`;
function promptTutor(c){const stil=c.stil==='sokratisch'?'SOKRATISCH: Beginne jeweils mit einer Frage, die zum Nachdenken führt (Aufgabe), und erkläre erst danach.':'ERKLÄREND: Erkläre zuerst kurz, zeige ein Beispiel und stelle dann eine Aufgabe.';
  return `Du bist ein geduldiger Tutor für eine Schweizer Sekundarschule (Fach ${c.fach}, Klasse ${c.klasse}).
Erstelle eine Lektion zum folgenden Thema bzw. Material.

THEMA / MATERIAL:
"""
${c.thema}
"""

STIL: ${stil}

${TUTOR_REGELN}
${REGELN.split('\n').slice(2).join('\n')}

${TUTOR_FORMAT}`}
function promptFolge(lek,log,c){
  return `Du bist ein geduldiger Tutor für eine Schweizer Sekundarschule (Fach ${c.fach}, Klasse ${c.klasse}).
Ein Schüler hat die Lektion «${lek}» gemacht und hatte bei diesen Aufgaben Schwierigkeiten:

FEHLERPROTOKOLL
${log}

Erstelle eine NEUE Lektion, die genau diese Schwierigkeiten behebt. Erkläre die Konzepte anders als zuvor (anderer Zugang, neue Beispiele) und wiederhole nicht einfach dieselben Aufgaben.

${TUTOR_REGELN}
${REGELN.split('\n').slice(2).join('\n')}

${TUTOR_FORMAT}`}
function promptRest(c,lek){const done=lek.schritte.map((s,i)=>(i+1)+'. '+s.s+(s.item?': '+frageText(s.item).slice(0,60):': '+(s.text||'').slice(0,60))).join('\n');
  return `Du hast vorhin eine Lektion «${lek.titel}» (Fach ${c.fach}, Klasse ${c.klasse}) für eine Lern-App begonnen, die Antwort wurde abgeschnitten. Bisher sind diese ${lek.schritte.length} Schritte angekommen:
${done}

Setze die Lektion ab Schritt ${lek.schritte.length+1} fort und schliesse sie mit einer "zusammenfassung" ab (höchstens 4 weitere Schritte). Gleiches Format wie vorher: ein Schritt pro Zeile, jede Zeile ein vollständiges JSON-Objekt, alles in einem Codeblock, KEINE Kopfzeile, nichts wiederholen.`}
/** Alle Fehler eines Sets auf einmal: Erklärung als normaler Text, kein JSON. */
function promptFehlerErklaerung(titel,proto,c){
  return `Ein Schüler (Klasse ${c.klasse}, Fach ${c.fach}) hat das Aufgabenset «${titel}» gelöst und bei diesen Aufgaben Fehler gemacht:

${proto}

Gehe jede Aufgabe einzeln durch. Erkläre in höchstens 4 einfachen Sätzen, warum die Antwort nicht stimmt und wie man auf die richtige Lösung kommt. Gib danach ein neues, ähnliches Beispiel zum Üben mit Lösung. Fasse am Schluss in 2 Sätzen zusammen, was der Schüler als Nächstes üben sollte. Schweizer Rechtschreibung (ss statt ß).`}
/** Wie promptTest, aber mit dem Fehlerprotokoll als Material. */
function promptFehlerset(proto,c){return promptTest({...c,thema:proto,blatt:true,fehler:true,anzahl:c.anzahl||'10'})}
function promptErklaere(it,given,c){
  return `Ein Schüler (Klasse ${c.klasse}, Fach ${c.fach}) hat bei dieser Aufgabe einen Fehler gemacht:

Aufgabe: ${frageText(it)}
Seine Antwort: ${given||'(keine)'}
Richtig wäre: ${solText(it)}

Erkläre in höchstens 5 einfachen Sätzen, warum seine Antwort nicht stimmt und wie man auf die richtige Lösung kommt. Gib danach ein neues, ähnliches Beispiel zum Üben mit Lösung. Schweizer Rechtschreibung (ss statt ß).`}


export { nz, lev, cmp, shuffle, parseAnswer, parseRest, promptKarten, promptTest, promptTutor, promptFolge, promptRest, promptErklaere, promptFehlerErklaerung, promptFehlerset, normItem, toItems, ohneKopf, MIX, FORMS, TNAME, mainText, itemKey, solText, frageText, num }

/** Offene Antwort: welche Pflichtwörter kommen vor? Kleine Abweichungen (Endungen, Tippfehler) zählen. */
function stichCheck(it,text){
  const ws=it.stichwoerter||[];if(!ws.length)return null;
  const t=nz(text||''),tok=t.split(/[^a-z0-9äöüàâçéèêëîïôûùœ]+/i).filter(Boolean);
  const hat=w=>{const n=nz(w);if(!n)return true;if(t.includes(n))return true;const st=n.length>=6?n.slice(0,Math.max(5,n.length-2)):n;
    return tok.some(x=>x.startsWith(st)||(n.length>=5&&cmp(x,n)!=='falsch'))};
  const da=ws.filter(hat),fehlt=ws.filter(w=>!hat(w));
  return {r:!t?'falsch':!fehlt.length?'richtig':da.length>=ws.length/2?'beinahe':'falsch',fehlt,da};
}
export { stichCheck }
