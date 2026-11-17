import { h } from './dom.js'
import { zeichnungEl } from './zeichnung.js'
import { kreuzLayout, kreuzEl, kreuzBewerte, kreuzLoesung, ktEl, ktBewerte, ktLoesung, ktGegeben } from './kreuz.js'
import { nz, cmp, shuffle, solText, TNAME, num, stichCheck } from './format.js'
const R={};
export function tabelleEl(tb, cell) {
  const k = tb.kopf && tb.kopf.length
  return h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
    k ? h('thead', null, h('tr', null, ...tb.kopf.map(c => h('th', null, c)))) : null,
    h('tbody', null, ...tb.zeilen.map((z, r) => h('tr', null, ...z.map((c, i) => h('td', null, cell ? cell(c, r, i) : c)))))))
}
const card=(...k)=>h('div',{class:'kk',style:'padding:16px 14px'},...k);
const prompt_=t=>h('div',{class:'serif',style:'font-size:18px;line-height:1.35'},t);
function chips(list,on,cls){return list.map((w,i)=>h('button',{class:'chip '+(cls||''),onclick:()=>on(i)},w))}
R.mc=(it,box,done)=>{
  const opts=shuffle(it.optionen.map((t,i)=>({t,ok:i===it.richtig})));const btns=[];
  box.append(card(prompt_(it.frage)),...opts.map((o,i)=>{const b=h('button',{class:'opt',onclick:()=>{btns.forEach((x,j)=>{x.disabled=true;if(opts[j].ok)x.classList.add('ok');});if(!o.ok)b.classList.add('no');
    done({r:o.ok?'richtig':'falsch',given:o.t,correct:it.optionen[it.richtig]})}},o.t);btns.push(b);return b}))};
R.luecke=(it,box,done)=>{
  const parts=it.text.split(/_{2,}/);const ins=[];const line=h('div',{class:'serif',style:'font-size:18px;line-height:2.1'});
  parts.forEach((p,i)=>{line.append(p);if(i<parts.length-1){const x=h('input',{class:'inl',autocapitalize:'off',autocomplete:'off',spellcheck:'false'});ins.push(x);line.append(x)}});
  const go_=h('button',{class:'btn blue',onclick:()=>{const rs=ins.map((x,i)=>cmp(x.value,it.antworten[i]));ins.forEach(x=>x.disabled=true);go_.hidden=true;
    const r=rs.every(x=>x==='richtig')?'richtig':rs.every(x=>x!=='falsch')?'beinahe':'falsch';
    done({r,given:ins.map(x=>x.value).join(' / '),correct:it.antworten.join(', ')})}},'Prüfen');
  box.append(card(line),go_)};
R.tabelle=(it,box,done)=>{
  const ins=[];
  const tb=tabelleEl(it.tabelle,c=>{const ps=c.split(/_{2,}/);if(ps.length===1)return c;const sp=h('span');ps.forEach((p,i)=>{sp.append(p);if(i<ps.length-1){const x=h('input',{class:'inl',autocapitalize:'off',autocomplete:'off',spellcheck:'false',style:'min-width:3em;width:5em'});ins.push(x);sp.append(x)}});return sp});
  const go_=h('button',{class:'btn blue',onclick:()=>{const rs=ins.map((x,i)=>cmp(x.value,it.antworten[i]));ins.forEach(x=>x.disabled=true);go_.hidden=true;
    const r=rs.every(x=>x==='richtig')?'richtig':rs.some(x=>x==='richtig'||x==='beinahe')&&rs.filter(x=>x==='richtig').length>=rs.length/2?'beinahe':'falsch';
    done({r,given:ins.map(x=>x.value).join(' / '),correct:it.antworten.join(', ')})}},'Prüfen');
  box.append(card(prompt_(it.frage)),tb,go_)};
R.kreuztabelle=(it,box,done)=>{
  const sel={};const go_=h('button',{class:'btn blue',onclick:()=>{const b=ktBewerte(it,sel);box.querySelectorAll('input').forEach(x=>x.disabled=true);go_.hidden=true;done({r:b.r,given:ktGegeben(it,sel),correct:ktLoesung(it)})}},'Prüfen');
  box.append(card(prompt_(it.frage)),ktEl(it,{eingabe:true,onToggle:(k,v)=>{if(v)sel[k]=true;else delete sel[k]}}),go_)};
R.kreuzwort=(it,box,done)=>{
  const L=kreuzLayout(it.woerter),g={};const go_=h('button',{class:'btn blue',onclick:()=>{const b=kreuzBewerte(L,g);box.querySelectorAll('input').forEach(x=>x.disabled=true);go_.hidden=true;
    done({r:b.ok===b.total?'richtig':b.ok>=b.total/2?'beinahe':'falsch',given:b.ok+' von '+b.total+' Wörtern richtig',correct:kreuzLoesung(L)})}},'Prüfen');
  box.append(card(prompt_(it.frage)),kreuzEl(L,{eingabe:true,onInput:(x,y,v)=>{g[x+','+y]=v}}),go_)};
R.zuordnen=(it,box,done)=>{
  const L=it.paare.map(p=>p[0]),Rr=shuffle(it.paare.map(p=>p[1]));const asg={};let sel=null;const area=h('div');
  function draw(){area.replaceChildren(
    h('div',{class:'lbl',style:'margin:6px 0'},'Links antippen, dann rechts die passende Zuordnung'),
    ...L.map((l,i)=>h('div',{class:'zrow'},h('button',{class:'opt'+(sel===i?' sel':''),style:'flex:1',onclick:()=>{sel=i;draw()}},l),
      h('div',{class:'zto'+(asg[i]!=null?' set':'')},asg[i]!=null?Rr[asg[i]]:'…'))),
    h('div',{class:'lbl',style:'margin:10px 0 6px'},'Zuordnungen'),
    h('div',{style:'display:flex;flex-wrap:wrap;gap:8px'},Rr.map((r,j)=>{const used=Object.values(asg).includes(j);return h('button',{class:'chip'+(used?' used':''),onclick:()=>{if(sel==null)return;for(const k in asg)if(asg[k]===j)delete asg[k];asg[sel]=j;sel=null;const n=L.findIndex((_,i)=>asg[i]==null);if(n>=0)sel=n;draw()}},r)})),
    Object.keys(asg).length===L.length?h('button',{class:'btn blue',style:'margin-top:12px',onclick:()=>{const right=L.filter((l,i)=>Rr[asg[i]]===it.paare[i][1]).length;
      done({r:right===L.length?'richtig':right>=L.length/2?'beinahe':'falsch',given:L.map((l,i)=>l+' = '+Rr[asg[i]]).join('; '),correct:solText(it)})}},'Prüfen'):null)}
  sel=0;box.append(card(prompt_(it.anweisung)),area);draw()};
R.ordnen=(it,box,done)=>{
  const pool=shuffle([...it.satz.split(/\s+/).filter(Boolean),...it.ablenker]);let ans=[];const line=h('div',{class:'kk wline'}),bank=h('div',{style:'display:flex;flex-wrap:wrap;gap:8px;margin-top:12px'}),act=h('div');
  function draw(){line.replaceChildren(...(ans.length?chips(ans.map(i=>pool[i]),k=>{ans.splice(k,1);draw()}):[h('span',{style:'color:var(--text-3)'},'Tippe die Wörter in der richtigen Reihenfolge an')]));
    bank.replaceChildren(...pool.map((w,i)=>h('button',{class:'chip'+(ans.includes(i)?' used':''),onclick:()=>{if(!ans.includes(i)){ans.push(i);draw()}}},w)));
    act.replaceChildren(ans.length?h('button',{class:'btn blue',onclick:()=>{const g=ans.map(i=>pool[i]).join(' ');const ok=[it.satz,...it.varianten].some(s=>nz(s)===nz(g));done({r:ok?'richtig':'falsch',given:g,correct:it.satz})}},'Prüfen'):null)}
  box.append(card(prompt_(it.hinweis||'Bringe die Wörter in die richtige Reihenfolge.')),line,bank,act);draw()};
R.reihenfolgen=(it,box,done)=>{
  const pool=shuffle(it.schritte);let ans=[];const list=h('div'),bank=h('div',{style:'display:flex;flex-direction:column;gap:8px;margin-top:12px'}),act=h('div');
  function draw(){list.replaceChildren(...ans.map((i,k)=>h('button',{class:'opt sel',onclick:()=>{ans.splice(k,1);draw()}},(k+1)+'. '+pool[i])));
    bank.replaceChildren(...pool.map((w,i)=>ans.includes(i)?null:h('button',{class:'opt',onclick:()=>{ans.push(i);draw()}},w)));
    act.replaceChildren(ans.length===pool.length?h('button',{class:'btn blue',onclick:()=>{const g=ans.map(i=>pool[i]);const ok=g.every((x,i)=>x===it.schritte[i]);done({r:ok?'richtig':'falsch',given:g.join(' → '),correct:it.schritte.join(' → ')})}},'Prüfen'):null)}
  box.append(card(prompt_(it.frage)),h('div',{class:'lbl',style:'margin:8px 0 4px'},'Tippe nacheinander an, was zuerst kommt'),list,bank,act);draw()};
R.wortbanken=(it,box,done)=>{
  const parts=it.text.split(/_{2,}/);const n=parts.length-1;const pool=shuffle([...it.antworten,...it.ablenker]);const fill=Array(n).fill(null);
  const line=h('div',{class:'serif',style:'font-size:18px;line-height:2.2'}),bank=h('div',{style:'display:flex;flex-wrap:wrap;gap:8px;margin-top:12px'}),act=h('div');
  function draw(){line.replaceChildren();parts.forEach((p,i)=>{line.append(p);if(i<n)line.append(h('button',{class:'blank'+(fill[i]!=null?' set':''),onclick:()=>{fill[i]=null;draw()}},fill[i]!=null?pool[fill[i]]:'      '))});
    bank.replaceChildren(...pool.map((w,i)=>h('button',{class:'chip'+(fill.includes(i)?' used':''),onclick:()=>{if(fill.includes(i))return;const k=fill.indexOf(null);if(k>=0){fill[k]=i;draw()}}},w)));
    act.replaceChildren(fill.every(x=>x!=null)?h('button',{class:'btn blue',onclick:()=>{const right=fill.filter((x,i)=>nz(pool[x])===nz(it.antworten[i])).length;done({r:right===n?'richtig':right>0?'beinahe':'falsch',given:fill.map(x=>pool[x]).join(', '),correct:it.antworten.join(', ')})}},'Prüfen'):null)}
  box.append(card(line),bank,act);draw()};
R.richtigfalsch=(it,box,done)=>{
  const area=h('div',{style:'display:flex;flex-direction:column;gap:8px;margin-top:10px'});
  const step1=()=>area.replaceChildren(h('div',{class:'grade'},h('button',{class:'g3',onclick:()=>pick1(true)},'✓',h('span',null,'Richtig')),h('button',{class:'g1',onclick:()=>pick1(false)},'✕',h('span',null,'Falsch'))));
  function pick1(v){const ok=v===it.richtig;
    if(!ok||!it.begruendungen.length)return done({r:ok?'richtig':'falsch',given:v?'Richtig':'Falsch',correct:solText(it)});
    area.replaceChildren(h('div',{class:'lbl'},'Welche Begründung passt?'),...shuffle(it.begruendungen).map(b=>h('button',{class:'opt',onclick:()=>done({r:b.richtig?'richtig':'beinahe',given:(v?'Richtig':'Falsch')+' ('+b.text+')',correct:solText(it)})},b.text)))}
  box.append(card(prompt_(it.aussage)),area);step1()};
R.fehlersuche=(it,box,done)=>{
  const words=it.satz.split(/\s+/).filter(Boolean);let sel=null;const line=h('div',{style:'display:flex;flex-wrap:wrap;gap:6px'}),act=h('div',{style:'margin-top:10px;display:flex;flex-direction:column;gap:8px'});
  const inp=h('input',{class:'in',placeholder:'Richtig heisst:',autocapitalize:'off',autocomplete:'off',spellcheck:'false'});
  function draw(){line.replaceChildren(...words.map((w,i)=>h('button',{class:'chip'+(sel===i?' sel':''),onclick:()=>{sel=i;draw()}},w)));
    act.replaceChildren(sel!=null?inp:null,sel!=null?h('button',{class:'btn blue',onclick:()=>{
      if(it.fehlerfrei)return done({r:'falsch',given:words[sel]+' → '+inp.value,correct:'Kein Fehler'});
      if(nz(words[sel])!==nz(it.fehlerwort))return done({r:'falsch',given:words[sel]+' → '+inp.value,correct:solText(it)});
      const c=cmp(inp.value,it.korrektur);done({r:c==='richtig'?'richtig':'beinahe',given:words[sel]+' → '+inp.value,correct:solText(it)})}},'Prüfen'):null,
      h('button',{class:'btn ghost',onclick:()=>done({r:it.fehlerfrei?'richtig':'falsch',given:'Kein Fehler',correct:solText(it)})},'Kein Fehler'))}
  box.append(card(prompt_('Tippe das falsche Wort an.')),h('div',{style:'margin-top:12px'},line),act);draw()};
R.kurzantworten=(it,box,done)=>{
  const ta=h('textarea',{class:'in',placeholder:'Deine Antwort …'});const area=h('div');
  const btn=h('button',{class:'btn blue',onclick:()=>{btn.hidden=true;ta.disabled=true;
    const sc=stichCheck(it,ta.value);
    if(sc){area.replaceChildren(h('div',{class:'kk',style:'margin-top:10px;padding:14px'},h('div',{class:'lbl'},'Mustersatz'),h('div',{class:'serif',style:'margin-top:4px'},it.muster),
        sc.fehlt.length?h('div',{style:'margin-top:8px;font-size:15px;font-weight:700'},'In deiner Antwort fehlt: '+sc.fehlt.join(', ')):null,
        ...it.kriterien.map(k=>h('div',{style:'font-size:15px;font-weight:600;margin-top:4px'},'· '+k))));
      return done({r:sc.r,given:ta.value,correct:it.muster})}
    const cb=it.kriterien.map(k=>h('input',{type:'checkbox'}));
    area.replaceChildren(h('div',{class:'kk',style:'margin-top:10px;padding:14px'},h('div',{class:'lbl'},'Musterantwort'),h('div',{class:'serif',style:'margin-top:4px'},it.muster)),
      it.kriterien.length?h('div',{class:'lbl',style:'margin:12px 0 6px'},'Was hattest du?'):null,...it.kriterien.map((k,i)=>h('label',{class:'crit'},cb[i],k)),
      h('button',{class:'btn blue',style:'margin-top:10px',onclick:()=>{const n=cb.filter(c=>c.checked).length;const m=it.kriterien.length;
        done({r:!m?'beinahe':n===m?'richtig':n>0?'beinahe':'falsch',given:ta.value,correct:it.muster,silentIfNoCrit:!m})}},'Fertig'))}},'Antwort prüfen');
  box.append(card(prompt_(it.frage)),h('div',{style:'margin-top:10px'},ta),btn,area)};
R.zahlen=(it,box,done)=>{
  const inp=h('input',{class:'in',inputmode:'decimal',placeholder:'Zahl',autocomplete:'off',style:'flex:1'});
  const btn=h('button',{class:'btn blue',onclick:()=>{const v=num(inp.value);const ok=!isNaN(v)&&Math.abs(v-it.antwort)<=it.toleranz+1e-9;done({r:ok?'richtig':'falsch',given:inp.value+' '+it.einheit,correct:solText(it)+(it.weg?'  (Weg: '+it.weg+')':'')})}},'Prüfen');
  box.append(card(prompt_(it.frage)),h('div',{style:'display:flex;gap:8px;align-items:center;margin:10px 0'},inp,h('span',{style:'font-weight:800'},it.einheit)),btn)};


export function renderAufgabe(item, box, done) { const f = R[item.t]; if (!f) { box.append(h('div', null, 'Aufgabentyp nicht unterstützt: ' + item.t)); return false } f(item, box, r => { box.classList.add('geloest'); done(r) }); if (item.tabelle && item.t !== 'tabelle') box.insertBefore(tabelleEl(item.tabelle), box.children[1] || null); if (item.zeichnung) box.insertBefore(zeichnungEl(item.zeichnung), box.children[1] || null); return true }
export const AUFGABENTYPEN = Object.keys(R)
