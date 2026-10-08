import "./style.css";
import { supabase, configured } from "./supabase.js";

const FACT=["Финансовое влияние","Регуляторный риск","Сложность и изменения","Риск мошенничества","Контрольная среда","Время с последнего аудита"];
const FSHORT=["F1 Фин.","F2 Регул.","F3 Сложн.","F4 Мошен.","F5 Контр."];
const RLABEL={hi:"Высокий",mid:"Средний",lo:"Низкий"};

const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=(n,d=0)=>Number(n).toLocaleString("ru-RU",{minimumFractionDigits:d,maximumFractionDigits:d});
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const DEFAULT_PARAMS={year:2027,weights:[0.25,0.2,0.15,0.1,0.2,0.1],high:3.6,med:2.6,freq:{hi:1,mid:2,lo:3},fte:6,daysPerFte:210,productive:0.75,reserveAdhoc:0.15,reserveFollow:0.1};
let S={params:DEFAULT_PARAMS,processes:[]};
let loading=true, busy=false, pending=0, saveError="", lastSaved=null;
let tab="overview", sortKey="score", filterCat="", query="", heatSel=null, confirmDel=null;
try{const t=localStorage.getItem("iap-tab"); if(t) tab=t;}catch(e){}

/* ---------- данные: Supabase <-> приложение ---------- */
const fromRow=r=>({id:r.id,name:r.name,cat:r.category,last:r.last_audit,f:[r.f1,r.f2,r.f3,r.f4,r.f5],mand:r.mandatory,days:r.days,q:r.quarter||""});
const toRow=p=>({name:p.name,category:p.cat,last_audit:p.last??null,f1:p.f[0],f2:p.f[1],f3:p.f[2],f4:p.f[3],f5:p.f[4],mandatory:p.mand,days:p.days,quarter:p.q||null});

async function loadAll(){
  loading=true;render();
  const [st,pr]=await Promise.all([
    supabase.from("settings").select("params").eq("id",1).maybeSingle(),
    supabase.from("processes").select("*").order("id")
  ]);
  if(st.error||pr.error){saveError=(st.error||pr.error).message;}
  else{
    S.params={...DEFAULT_PARAMS,...(st.data?.params||{})};
    S.processes=pr.data.map(fromRow);
    saveError="";
  }
  loading=false;render();
}

async function track(promise){
  pending++;render();
  try{const {error}=await promise; if(error) throw error; saveError=""; lastSaved=new Date();}
  catch(err){saveError=err.message||String(err);}
  finally{pending--;render();}
}
const saveProcess=p=>track(supabase.from("processes").update(toRow(p)).eq("id",p.id));
const saveParams=()=>track(supabase.from("settings").update({params:S.params}).eq("id",1));

async function addProcess(){
  busy=true;render();
  const row=toRow({name:"Новый процесс",cat:filterCat||"Прочее",last:null,f:[3,3,3,3,3],mand:false,days:15,q:""});
  const {data,error}=await supabase.from("processes").insert(row).select().single();
  busy=false;
  if(error){saveError=error.message;render();return;}
  S.processes.push(fromRow(data));lastSaved=new Date();query="";sortKey="name";render();
  setTimeout(()=>{const el=document.getElementById("n-"+data.id);if(el){el.focus();el.select();}},0);
}
async function deleteProcess(id){
  const before=S.processes;
  S.processes=S.processes.filter(p=>p.id!==id);confirmDel=null;render();
  pending++;
  const {error}=await supabase.from("processes").delete().eq("id",id);
  pending--;
  if(error){S.processes=before;saveError=error.message;} else {lastSaved=new Date();saveError="";}
  render();
}

function download(name,text,type){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},0);}
function exportCsv(){
  const E=evaluate();
  const q=v=>`"${String(v).replace(/"/g,'""')}"`;
  const lines=[["№","Объект аудита","Категория","Балл","Рейтинг","Основание","Чел.-дней","Квартал","Статус"].map(q).join(";")];
  E.cands.forEach(x=>lines.push([x.rank,x.p.name,x.p.cat,x.sc.toFixed(2).replace(".",","),RLABEL[x.r],x.reasons.join(", "),x.p.days,x.fits?x.q:"",x.fits?"В плане":"Перенос"].map(q).join(";")));
  download(`План_аудита_${S.params.year}.csv`,"﻿"+lines.join("\r\n"),"text/csv;charset=utf-8");
}

function f6(p){return p.last==null||p.last===""?5:clamp(S.params.year-p.last,1,5);}
function score(p){const w=S.params.weights;const f=[...p.f,f6(p)];return f.reduce((s,v,i)=>s+v*w[i],0);}
function rating(sc){return sc>=S.params.high?"hi":sc>=S.params.med?"mid":"lo";}
function impact(p){return (p.f[0]+p.f[1])/2;}
function likelihood(p){return (p.f[2]+p.f[3]+p.f[4])/3;}
function capacity(){const P=S.params;const prod=P.fte*P.daysPerFte*P.productive;return {prod,avail:prod*(1-P.reserveAdhoc-P.reserveFollow)};}

function evaluate(){
  const rows=S.processes.map(p=>{
    const sc=score(p), r=rating(sc), freq=S.params.freq[r];
    const never=p.last==null||p.last==="";
    const due=never||(S.params.year-p.last)>=freq;
    const reasons=[];
    if(p.mand) reasons.push("Обязательный");
    if(r==="hi") reasons.push("Высокий риск");
    if(never) reasons.push("Не проверялся");
    else if(due && r!=="hi") reasons.push("Истёк цикл ("+freq+" г.)");
    return {p,sc,r,freq,due,cand:reasons.length>0,reasons};
  });
  // приоритет: обязательные, затем по убыванию балла
  const cands=rows.filter(x=>x.cand).sort((a,b)=>(b.p.mand-a.p.mand)||(b.sc-a.sc));
  const {avail}=capacity(); let cum=0;
  cands.forEach((x,i)=>{x.rank=i+1;cum+=Number(x.p.days)||0;x.cum=cum;x.fits=x.p.mand||cum<=avail;});
  // кварталы: ручные сначала, затем авто — в наименее загруженный квартал
  const load={Q1:0,Q2:0,Q3:0,Q4:0};
  const plan=cands.filter(x=>x.fits);
  plan.forEach(x=>{if(x.p.q){x.q=x.p.q;x.manualQ=true;load[x.q]+=Number(x.p.days)||0;}});
  plan.forEach(x=>{if(!x.p.q){const q=Object.keys(load).sort((a,b)=>load[a]-load[b])[0];x.q=q;load[q]+=Number(x.p.days)||0;}});
  const planned=plan.reduce((s,x)=>s+(Number(x.p.days)||0),0);
  return {rows,cands,plan,load,planned,avail};
}


/* ---------- views ---------- */
function vOverview(E){
  const cnt={hi:0,mid:0,lo:0};E.rows.forEach(x=>cnt[x.r]++);
  const util=E.avail?E.planned/E.avail:0;
  const excluded=E.cands.length-E.plan.length;
  const top=[...E.rows].sort((a,b)=>b.sc-a.sc).slice(0,7);
  const maxLoad=Math.max(1,...Object.values(E.load));
  return `
  <div class="grid g-kpi">
    <div class="panel kpi"><div class="l">Процессов в аудиторском универсуме</div><div class="v">${E.rows.length}</div>
      <div class="s"><span class="pill hi">${cnt.hi} выс.</span> <span class="pill mid">${cnt.mid} сред.</span> <span class="pill lo">${cnt.lo} низ.</span></div></div>
    <div class="panel kpi"><div class="l">Аудитов в плане ${S.params.year}</div><div class="v">${E.plan.length}</div>
      <div class="s muted">${excluded?`${excluded} кандидат(а) не вошли из-за ресурса`:"Все кандидаты вошли в план"}</div></div>
    <div class="panel kpi"><div class="l">Загрузка ресурса</div><div class="v">${fmt(util*100)}%</div>
      <div class="meter ${util>1?"over":""}"><i style="width:${clamp(util*100,0,100)}%"></i></div>
      <div class="s muted"><span class="num">${fmt(E.planned)}</span> из <span class="num">${fmt(E.avail)}</span> чел.-дней</div></div>
    <div class="panel kpi"><div class="l">Свободный резерв</div><div class="v">${fmt(E.avail-E.planned)}</div>
      <div class="s muted">чел.-дней после плановых аудитов</div></div>
  </div>
  <div class="grid g-2">
    <section class="panel"><h2>Наивысшие риски</h2>
      <ol class="top5">${top.map((x,i)=>`<li><span class="rk">${i+1}</span><span>${esc(x.p.name)}</span><span class="num">${x.sc.toFixed(2)}</span><span class="pill ${x.r}">${RLABEL[x.r]}</span></li>`).join("")}</ol>
    </section>
    <section class="panel"><h2>Загрузка по кварталам</h2>
      <div class="bars">${Object.entries(E.load).map(([q,d])=>{const n=E.plan.filter(x=>x.q===q).length;return `<div class="bar"><b>${q}</b><div class="track"><div class="fill" style="width:${d/maxLoad*100}%"></div></div><span class="lbl num">${fmt(d)} дн. · ${n}</span></div>`}).join("")}</div>
      <p class="small muted" style="margin:0">Квартал назначается автоматически в наименее загруженный период, если не задан вручную на вкладке «План».</p>
    </section>
  </div>
  <section class="panel"><h2>Методология</h2>
    <dl class="method">
      <dt>Оценка</dt><dd>Каждый процесс оценивается по шкале 1–5 по пяти факторам; шестой фактор (время с последнего аудита) рассчитывается автоматически, не проверявшийся процесс получает 5.</dd>
      <dt>Взвешенный балл</dt><dd>Σ (фактор × вес). Веса и пороги рейтинга задаются в «Параметрах».</dd>
      <dt>Цикл аудита</dt><dd>Высокий риск — ежегодно, средний — раз в ${S.params.freq.mid} г., низкий — раз в ${S.params.freq.lo} г.</dd>
      <dt>Включение в план</dt><dd>Обязательный аудит (требование регулятора или комитета по аудиту), высокий риск, истёкший цикл или процесс, который ещё не проверялся.</dd>
      <dt>Ресурс</dt><dd>Кандидаты сортируются: обязательные, затем по баллу. Аудиты, не помещающиеся в доступный фонд времени, остаются в списке как перенесённые.</dd>
      <dt>Основа</dt><dd>Глобальные стандарты внутреннего аудита IIA (2024), риск-ориентированное планирование.</dd>
    </dl>
  </section>`;
}

function scoreSel(p,i){
  const v=p.f[i];
  return `<select class="sc s${v}" id="f-${p.id}-${i}" data-id="${p.id}" data-f="${i}" aria-label="${FACT[i]}">${[1,2,3,4,5].map(n=>`<option${n===v?" selected":""}>${n}</option>`).join("")}</select>`;
}
function vRegister(E){
  const cats=[...new Set(S.processes.map(p=>p.cat))].sort();
  let rows=E.rows.filter(x=>(!filterCat||x.p.cat===filterCat)&&(!query||x.p.name.toLowerCase().includes(query.toLowerCase())));
  if(sortKey==="score") rows.sort((a,b)=>b.sc-a.sc);
  else if(sortKey==="name") rows.sort((a,b)=>a.p.name.localeCompare(b.p.name,"ru"));
  else if(sortKey==="cat") rows.sort((a,b)=>a.p.cat.localeCompare(b.p.cat,"ru")||b.sc-a.sc);
  return `<section class="panel">
    <div class="toolbar">
      <input type="search" id="q" placeholder="Поиск процесса" value="${esc(query)}" aria-label="Поиск">
      <select id="fc" aria-label="Категория"><option value="">Все категории</option>${cats.map(c=>`<option${c===filterCat?" selected":""}>${esc(c)}</option>`).join("")}</select>
      <select id="sk" aria-label="Сортировка"><option value="score"${sortKey==="score"?" selected":""}>По баллу риска</option><option value="cat"${sortKey==="cat"?" selected":""}>По категории</option><option value="name"${sortKey==="name"?" selected":""}>По названию</option></select>
      <button class="btn" id="add" ${busy?"disabled":""}>+ Добавить процесс</button>
    </div>
    <div class="legend"><span>Шкала 1–5: 1 — минимальный риск, 5 — максимальный. Для «Контрольной среды» 5 означает слабый контроль.</span></div>
    <div class="scroll"><table>
      <thead><tr><th>Бизнес-процесс</th><th>Категория</th><th class="c">Посл. аудит</th>${FSHORT.map((t,i)=>`<th class="c" title="${FACT[i]}">${t}</th>`).join("")}<th class="c" title="${FACT[5]}">F6</th><th class="c">Балл</th><th>Рейтинг</th><th class="c">Обяз.</th><th class="c">Дней</th><th></th></tr></thead>
      <tbody>${rows.map(x=>{const p=x.p;return `<tr>
        <td><input type="text" id="n-${p.id}" data-id="${p.id}" data-k="name" value="${esc(p.name)}" aria-label="Название"></td>
        <td><input type="text" id="c-${p.id}" data-id="${p.id}" data-k="cat" value="${esc(p.cat)}" style="min-width:130px" aria-label="Категория"></td>
        <td class="c"><input type="number" id="l-${p.id}" data-id="${p.id}" data-k="last" value="${p.last??""}" placeholder="—" min="2000" max="${S.params.year}" aria-label="Год последнего аудита"></td>
        ${[0,1,2,3,4].map(i=>`<td class="c">${scoreSel(p,i)}</td>`).join("")}
        <td class="c num">${f6(p)}</td>
        <td class="c num"><b>${x.sc.toFixed(2)}</b></td>
        <td><span class="pill ${x.r}">${RLABEL[x.r]}</span></td>
        <td class="c"><input type="checkbox" id="m-${p.id}" data-id="${p.id}" data-k="mand" ${p.mand?"checked":""} aria-label="Обязательный аудит"></td>
        <td class="c"><input type="number" id="d-${p.id}" data-id="${p.id}" data-k="days" value="${p.days}" min="1" max="400" aria-label="Чел.-дней"></td>
        <td><button class="x" data-del="${p.id}" title="Удалить процесс" aria-label="Удалить ${esc(p.name)}">×</button></td>
      </tr>`}).join("")}</tbody></table></div>
    ${rows.length?"":`<p class="muted">Ничего не найдено.</p>`}
  </section>`;
}

function vHeat(E){
  const zone=(l,i)=>l*i>=15?"hi":l*i>=8?"mid":"lo";
  const at=(l,i)=>E.rows.filter(x=>Math.round(likelihood(x.p))===l&&Math.round(impact(x.p))===i);
  let cells="";
  for(let i=5;i>=1;i--){
    cells+=`<div class="ax">${i}</div>`;
    for(let l=1;l<=5;l++){const xs=at(l,i);const k=l+"-"+i;
      cells+=`<button class="cell ${zone(l,i)} ${xs.length?"":"empty"} ${heatSel===k?"sel":""}" data-cell="${k}" title="${esc(xs.map(x=>x.p.name).join("\n"))||"Нет процессов"}" aria-label="Влияние ${i}, вероятность ${l}: ${xs.length}"><b>${xs.length}</b></button>`;}
  }
  cells+=`<div></div>${[1,2,3,4,5].map(l=>`<div class="ax">${l}</div>`).join("")}`;
  let list=E.rows;
  if(heatSel){const [l,i]=heatSel.split("-").map(Number);list=at(l,i);}
  list=[...list].sort((a,b)=>b.sc-a.sc);
  return `<div class="grid g-2">
    <section class="panel"><h2>Тепловая карта рисков</h2>
      <p class="small muted" style="margin:0">Влияние = среднее F1 и F2. Вероятность = среднее F3, F4 и F5. Нажмите на ячейку, чтобы увидеть процессы.</p>
      <div style="display:grid;grid-template-columns:auto 1fr;gap:8px;align-items:center">
        <div class="axis-t" style="writing-mode:vertical-rl;transform:rotate(180deg)">Влияние →</div>
        <div class="heat">${cells}</div>
      </div>
      <div class="axis-t" style="text-align:center;max-width:650px">Вероятность →</div>
    </section>
    <section class="panel"><div class="toolbar" style="justify-content:space-between"><h2>${heatSel?"Процессы в ячейке":"Все процессы"}</h2>${heatSel?`<button class="btn" id="hclr">Показать все</button>`:""}</div>
      <div class="scroll"><table><thead><tr><th>Процесс</th><th class="c">Влияние</th><th class="c">Вероятн.</th><th class="c">Балл</th><th>Рейтинг</th></tr></thead>
      <tbody>${list.map(x=>`<tr><td>${esc(x.p.name)}</td><td class="c num">${impact(x.p).toFixed(1)}</td><td class="c num">${likelihood(x.p).toFixed(1)}</td><td class="c num">${x.sc.toFixed(2)}</td><td><span class="pill ${x.r}">${RLABEL[x.r]}</span></td></tr>`).join("")||`<tr><td colspan="5" class="muted">В этой ячейке нет процессов.</td></tr>`}</tbody></table></div>
    </section></div>`;
}

function vPlan(E){
  const over=E.planned>E.avail;
  return `<section class="panel">
    <div class="toolbar" style="justify-content:space-between">
      <div><h2>Риск-ориентированный план внутреннего аудита на ${S.params.year} год</h2>
      <p class="small muted" style="margin:4px 0 0">${E.plan.length} аудитов · <span class="num">${fmt(E.planned)}</span> из <span class="num">${fmt(E.avail)}</span> доступных чел.-дней${over?` · <span class="warn">превышение за счёт обязательных аудитов</span>`:""}</p></div>
      <button class="btn primary" id="csv">Скачать план (CSV)</button>
    </div>
    <div class="scroll"><table>
      <thead><tr><th class="c">№</th><th>Объект аудита</th><th>Категория</th><th class="c">Балл</th><th>Рейтинг</th><th>Основание</th><th class="c">Дней</th><th class="c">Нараст.</th><th>Квартал</th><th>Статус</th></tr></thead>
      <tbody>${E.cands.map(x=>{const p=x.p;return `<tr class="${x.fits?"":"out"}">
        <td class="c num">${x.rank}</td><td>${esc(p.name)}</td><td>${esc(p.cat)}</td>
        <td class="c num">${x.sc.toFixed(2)}</td><td><span class="pill ${x.r}">${RLABEL[x.r]}</span></td>
        <td class="small">${x.reasons.join(", ")}</td>
        <td class="c num">${p.days}</td><td class="c num">${fmt(x.cum)}</td>
        <td>${x.fits?`<select id="q-${p.id}" data-q="${p.id}" aria-label="Квартал"><option value=""${p.q?"":" selected"}>Авто (${x.q})</option>${["Q1","Q2","Q3","Q4"].map(q=>`<option${p.q===q?" selected":""}>${q}</option>`).join("")}</select>`:"—"}</td>
        <td>${x.fits?`<span class="pill ok">В плане</span>`:`<span class="pill no">Перенос</span>`}</td></tr>`}).join("")}</tbody></table></div>
  </section>
  <section class="panel"><h2>Не вошли в кандидаты ${S.params.year}</h2>
    <p class="small muted" style="margin:0">Цикл аудита ещё не истёк. Эти процессы попадут в план автоматически, когда наступит срок.</p>
    <div class="scroll"><table><thead><tr><th>Процесс</th><th class="c">Балл</th><th>Рейтинг</th><th class="c">Посл. аудит</th><th class="c">Следующий</th></tr></thead>
    <tbody>${E.rows.filter(x=>!x.cand).sort((a,b)=>b.sc-a.sc).map(x=>`<tr><td>${esc(x.p.name)}</td><td class="c num">${x.sc.toFixed(2)}</td><td><span class="pill ${x.r}">${RLABEL[x.r]}</span></td><td class="c num">${x.p.last}</td><td class="c num">${x.p.last+x.freq}</td></tr>`).join("")||`<tr><td colspan="5" class="muted">Все процессы — кандидаты на этот год.</td></tr>`}</tbody></table></div>
  </section>`;
}

function vParams(){
  const P=S.params, wsum=P.weights.reduce((a,b)=>a+b,0);
  const {prod,avail}=capacity();
  const nf=(id,label,val,step,hint)=>`<div class="field"><label for="${id}">${label}</label><input type="number" id="${id}" data-p="${id}" value="${val}" step="${step}">${hint?`<span class="small muted">${hint}</span>`:""}</div>`;
  return `<section class="panel"><h2>Общие</h2><div class="fields">${nf("year","Плановый год",P.year,1)}</div></section>
  <section class="panel"><h2>Веса факторов риска</h2>
    <div class="fields">${FACT.map((t,i)=>nf("w"+i,`F${i+1} ${t}, %`,Math.round(P.weights[i]*100),1)).join("")}</div>
    <p class="small ${Math.abs(wsum-1)>0.001?"warn":"muted"}" style="margin:0">Сумма весов: <span class="num">${fmt(wsum*100)}%</span>${Math.abs(wsum-1)>0.001?" — должна быть 100%":""}</p>
  </section>
  <section class="panel"><h2>Пороги рейтинга и цикл аудита</h2><div class="fields">
    ${nf("high","Высокий риск, если балл ≥",P.high,0.1)}${nf("med","Средний риск, если балл ≥",P.med,0.1,"Ниже — низкий риск")}
    ${nf("fhi","Цикл для высокого риска, лет",P.freq.hi,1)}${nf("fmid","Цикл для среднего риска, лет",P.freq.mid,1)}${nf("flo","Цикл для низкого риска, лет",P.freq.lo,1)}
  </div></section>
  <section class="panel"><h2>Ресурсы службы внутреннего аудита</h2><div class="fields">
    ${nf("fte","Аудиторов (FTE)",P.fte,1)}${nf("dpf","Рабочих дней на аудитора в год",P.daysPerFte,1,"Без отпусков и праздников")}
    ${nf("prod","Продуктивное время, %",Math.round(P.productive*100),1,"Без обучения и административной работы")}
    ${nf("rad","Резерв на внеплановые проверки, %",Math.round(P.reserveAdhoc*100),1)}${nf("rfu","Резерв на мониторинг рекомендаций, %",Math.round(P.reserveFollow*100),1)}
  </div>
  <p class="small muted" style="margin:0">Продуктивный фонд: <span class="num">${fmt(prod)}</span> чел.-дней. Доступно для плановых аудитов: <b class="num">${fmt(avail)}</b> чел.-дней.</p></section>`;
}


/* ---------- экраны ---------- */
const TABS=[["overview","Обзор"],["register","Оценка рисков"],["heat","Тепловая карта"],["plan","План"],["params","Параметры"]];

function vSetup(){
  return `<div class="wrap"><div class="panel login"><h1>Нужна настройка</h1>
  <p>Не заданы переменные окружения <code>VITE_SUPABASE_URL</code> и <code>VITE_SUPABASE_ANON_KEY</code>.</p>
  <p class="small muted">Локально: скопируйте <code>.env.example</code> в <code>.env</code>. На Vercel: Settings → Environment Variables, затем Redeploy.</p></div></div>`;
}
function render(){
  const app=document.getElementById("app");
  if(!configured){app.innerHTML=vSetup();return;}
  if(loading){app.innerHTML=`<div class="wrap"><p class="muted">Загрузка данных…</p></div>`;return;}
  const E=evaluate();
  const st=saveError?"Ошибка: "+saveError:pending?"Сохранение…":lastSaved?"Сохранено в "+lastSaved.toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"}):"Изменения сохраняются автоматически";
  const view=tab==="register"?vRegister(E):tab==="heat"?vHeat(E):tab==="plan"?vPlan(E):tab==="params"?vParams():vOverview(E);
  app.innerHTML=`<div class="wrap">
    <header class="top"><div class="brand"><small>Служба внутреннего аудита · банк</small><h1>План внутреннего аудита ${S.params.year}</h1></div>
      <div class="actions"><span class="status ${saveError?"err":pending?"dirty":""}" role="status">${esc(st)}</span></div></header>
    ${confirmDel?`<div class="note toolbar" style="justify-content:space-between"><span>Удалить «${esc(S.processes.find(p=>p.id===confirmDel)?.name)}» из реестра?</span><span class="toolbar"><button class="btn" id="delYes">Удалить</button><button class="btn" id="delNo">Отмена</button></span></div>`:""}
    ${!S.processes.length?`<div class="note">Реестр пуст. Добавьте процессы на вкладке «Оценка рисков» или выполните <code>supabase/seed.sql</code> для примера.</div>`:""}
    <nav class="tabs" role="tablist">${TABS.map(([k,t])=>`<button role="tab" data-tab="${k}" aria-selected="${tab===k}">${k==="plan"?"План "+S.params.year:t}</button>`).join("")}</nav>
    <main class="grid">${view}</main>
  </div>`;
}

/* ---------- события ---------- */
const byId=id=>S.processes.find(p=>p.id===Number(id));
document.addEventListener("click",e=>{
  const t=e.target.closest("[data-tab],[data-del],[data-cell],#add,#hclr,#csv,#delYes,#delNo");if(!t)return;
  if(t.dataset.tab){tab=t.dataset.tab;try{localStorage.setItem("iap-tab",tab)}catch(_){ }render();}
  else if(t.dataset.del){confirmDel=Number(t.dataset.del);render();window.scrollTo({top:0,behavior:"smooth"});}
  else if(t.id==="delYes") deleteProcess(confirmDel);
  else if(t.id==="delNo"){confirmDel=null;render();}
  else if(t.dataset.cell){heatSel=heatSel===t.dataset.cell?null:t.dataset.cell;render();}
  else if(t.id==="hclr"){heatSel=null;render();}
  else if(t.id==="add") addProcess();
  else if(t.id==="csv") exportCsv();
});
document.addEventListener("input",e=>{const t=e.target;
  if(t.id==="q"){query=t.value;const pos=t.selectionStart;render();const n=document.getElementById("q");n.focus();n.setSelectionRange(pos,pos);}
});
document.addEventListener("change",e=>{const t=e.target;
  if(t.id==="fc"){filterCat=t.value;render();return;}
  if(t.id==="sk"){sortKey=t.value;render();return;}
  if(t.dataset.f!=null){const p=byId(t.dataset.id);p.f[Number(t.dataset.f)]=Number(t.value);render();saveProcess(p);return;}
  if(t.dataset.q){const p=byId(t.dataset.q);p.q=t.value;render();saveProcess(p);return;}
  if(t.dataset.k){const p=byId(t.dataset.id),k=t.dataset.k;
    if(k==="mand")p.mand=t.checked;
    else if(k==="last"){const v=parseInt(t.value,10);p.last=isNaN(v)?null:clamp(v,1990,S.params.year);}
    else if(k==="days"){const v=parseInt(t.value,10);p.days=isNaN(v)?0:clamp(v,0,999);}
    else p[k]=t.value.trim()||(k==="cat"?"Прочее":"Без названия");
    render();saveProcess(p);return;}
  if(t.dataset.p){const P=S.params,v=parseFloat(t.value);if(isNaN(v))return;const id=t.dataset.p;
    if(id==="year")P.year=Math.round(v);
    else if(/^w\d$/.test(id))P.weights[Number(id[1])]=clamp(v,0,100)/100;
    else if(id==="high")P.high=v; else if(id==="med")P.med=v;
    else if(id==="fhi")P.freq.hi=Math.max(1,Math.round(v)); else if(id==="fmid")P.freq.mid=Math.max(1,Math.round(v)); else if(id==="flo")P.freq.lo=Math.max(1,Math.round(v));
    else if(id==="fte")P.fte=Math.max(0,v); else if(id==="dpf")P.daysPerFte=Math.max(0,v);
    else if(id==="prod")P.productive=clamp(v,0,100)/100; else if(id==="rad")P.reserveAdhoc=clamp(v,0,100)/100; else if(id==="rfu")P.reserveFollow=clamp(v,0,100)/100;
    render();saveParams();}
});

/* ---------- запуск ---------- */
render();
if(configured) loadAll();
