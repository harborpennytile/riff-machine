"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import storage from "@/lib/storage";
import { exportSeedMarkdown, exportAllMarkdown, downloadMarkdown, copyToClipboard } from "@/lib/export";

const API = "/api/riff";
const MODEL = process.env.NEXT_PUBLIC_ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
const SK = "riffmachine:v5";
const CATS = [
  ["art","\u{1F3A8}"],["music","\u{1F3B6}"],["tech","\u{26A1}"],["philosophy","\u{1F9E0}"],
  ["finance","\u{1F4B0}"],["food","\u{1F373}"],["nature","\u{1F33F}"],["news","\u{1F4F0}"],
  ["random","\u{1F3B2}"],["other","\u{2726}"]
];
const TI = {article:"\u{1F4C4}",visual:"\u{1F5BC}",music:"\u{1F3B5}",book:"\u{1F4D6}",concept:"\u{1F4A1}",person:"\u{1F464}"};
function ci(id){return(CATS.find(c=>c[0]===id)||["",""])[1]}
function san(t){return t.replace(/<[^>]*>/g,"").replace(/javascript:/gi,"").replace(/on\w+\s*=/gi,"").replace(/[{}<>]/g,"").replace(/\s+/g," ").trim().slice(0,200)}

async function ld(){for(const k of[SK,"riffmachine:v4","riffmachine:v3","riffmachine:v2"]){try{const r=await storage.get(k);if(r?.value){const p=JSON.parse(r.value);if(p?.seeds?.length)return p}}catch{}}return null}
async function sv(s){try{await storage.set(SK,JSON.stringify(s))}catch{}}

async function callAPI(system,userMsg,tools){
  const r=await fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:MODEL,max_tokens:2500,stream:false,system,messages:[{role:"user",content:userMsg}],tools:tools||undefined})});
  if(!r.ok){const t=await r.text().catch(()=>"");throw new Error(t.includes("429")?"Rate limit reached. Wait a bit.":"API error "+r.status)}
  const d=await r.json();
  const raw=d.content.filter(b=>b.type==="text").map(b=>b.text).join("\n");
  return raw.replace(/<\/?cite[^>]*>/g,"").replace(/<\/?antml:cite[^>]*>/g,"");
}

function extractItems(t){const c=t.replace(/<\/?cite[^>]*>/g,"").replace(/<\/?antml:cite[^>]*>/g,"");const items=[];const re=/\{[^{}]*"type"\s*:\s*"[^"]+?"[^{}]*"title"\s*:\s*"[^"]*?"[^{}]*\}/g;let m;while((m=re.exec(c))!==null){try{const o=JSON.parse(m[0]);if(o.type&&o.title)items.push(o)}catch{}}return items}

function buildRiff(seed,all){
  const others=all.filter(s=>s.id!==seed.id);
  let ctx="";
  if(others.length>0){
    ctx="\n\nUser's other seeds:\n"+all.map(s=>{
      const ti=(s.riffs||[]).map(r=>r.title).filter(Boolean).slice(0,5);
      return"- ["+s.category+"] \""+s.text+"\""+(ti.length?" (found: "+ti.join(", ")+")":"");
    }).join("\n");
  }
  const cross=others.length>0?"\nCRITICAL: Every result MUST bridge the focused seed with at least one other seed. Name which seeds connect in the link field.":"\nFind diverse cross-domain resources.";
  return{
    system:"You are a creative discovery engine.\n\nFocused on: \""+seed.text+"\" ["+seed.category+"]"+ctx+"\n\nReturn ONLY a JSON array of 4-5 items. No markdown fences.\n\nEach item: {\"type\":\"article|visual|music|book|concept|person\",\"title\":\"exact real title\",\"url\":\"https://real-url-from-search\",\"desc\":\"1-2 sentences\",\"link\":\"which seeds this bridges\"}\n\nRULES:\n- Use web_search to find a real URL for each resource. Every url must be genuine.\n- Do NOT fabricate URLs.\n- SPEED: Do at most 3 web searches total. Search for the most unique/specific items only. For well-known books, people, Wikipedia concepts, or famous artworks you can provide the URL from memory without searching.\n- If you cannot find a valid URL for an item, omit the url field entirely. A missing URL is fine. A fake URL is not."+cross,
    user:"Find resources connecting my seeds, focused on: \""+seed.text+"\""
  };
}

function buildSynth(seeds){
  return{
    system:"Find cross-connections across seeds. Return ONLY a JSON array. No markdown.\n\nEach: {\"name\":\"theme\",\"insight\":\"2-3 sentences\",\"seeds\":[\"s1\",\"s2\"],\"leads\":[{\"type\":\"...\",\"title\":\"...\",\"url\":\"https://real-url\",\"desc\":\"...\"}]}\n\nUse web_search for real URLs in leads. 2-3 syntheses max.\n\nSPEED: Do at most 2 web searches for the leads. Use known URLs from memory where possible. Omit url if unsure rather than guessing.",
    user:"Seeds:\n"+JSON.stringify(seeds.map(s=>({seed:s.text,cat:s.category,resources:(s.riffs||[]).map(r=>({type:r.type,title:r.title}))})))
  };
}

function useM(bp=768){const[m,s]=useState(false);useEffect(()=>{const c=()=>s(window.innerWidth<bp);c();window.addEventListener("resize",c);return()=>window.removeEventListener("resize",c)},[bp]);return m}

/* ---- Sub components ---- */

function Card({item,i}){
  return(
    <article style={{padding:"12px 14px",borderLeft:"3px solid #000",marginBottom:8,background:"#fafafa"}}>
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
        <span style={{fontSize:12}}>{TI[item.type]||""}</span>
        <span style={{fontSize:9,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",color:"#888"}}>{item.type}</span>
      </div>
      <div style={{fontSize:14,marginBottom:4,lineHeight:1.3}}>
        {item.url?<a href={item.url} target="_blank" rel="noopener noreferrer nofollow" style={{color:"#000",textDecoration:"underline",textUnderlineOffset:2,fontWeight:600}}>{item.title}</a>:<span style={{fontWeight:600}}>{item.title}</span>}
      </div>
      <div style={{fontSize:12.5,color:"#444",lineHeight:1.5}}>{item.desc||item.description||""}</div>
      {(item.link||item.connection)&&<div style={{fontSize:11,color:"#999",fontStyle:"italic",marginTop:4}}>{item.link||item.connection}</div>}
    </article>
  );
}

function SCard({syn,i}){
  return(
    <article style={{padding:"16px",border:"2px solid #000",marginBottom:12,background:"#fff"}}>
      <div style={{fontSize:14,fontWeight:700,marginBottom:6}}>{syn.name}</div>
      <div style={{fontSize:13,color:"#333",lineHeight:1.6,marginBottom:10}}>{syn.insight}</div>
      {syn.seeds?.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:8}}>{syn.seeds.map((s,i)=><span key={i} style={{fontSize:11,padding:"2px 8px",background:"#f0f0f0",border:"1px solid #ddd"}}>{s}</span>)}</div>}
      {syn.leads?.map((l,i)=><Card key={i} item={l} i={i}/>)}
    </article>
  );
}

/* ---- MAIN ---- */
export default function RiffMachine(){
  const[seeds,setSeeds]=useState([]);
  const[selId,setSelId]=useState(null);
  const[synths,setSynths]=useState([]);
  const[inp,setInp]=useState("");
  const[cat,setCat]=useState("art");
  const[loading,setLoading]=useState(false);
  const[sLoading,setSLoading]=useState(false);
  const[err,setErr]=useState(null);
  const[view,setView]=useState("riffs");
  const[filter,setFilt]=useState("all");
  const[ready,setReady]=useState(false);
  const[copied,setCopied]=useState(false);
  const[cd,setCd]=useState(0);
  const[elapsed,setElapsed]=useState(0);
  const ref=useRef(null);
  const mob=useM();

  useEffect(()=>{ld().then(s=>{if(s){const m=(s.seeds||[]).map(sd=>{let r=sd.riffs||[];if(!Array.isArray(r))r=[];r=r.filter(x=>x&&typeof x==="object");return{...sd,category:sd.category||"art",riffs:r}});setSeeds(m);setSynths(s.syntheses||[]);if(s.selectedId)setSelId(s.selectedId)}setReady(true)})},[]);
  useEffect(()=>{if(ready)sv({seeds,selectedId:selId,syntheses:synths})},[seeds,selId,synths,ready]);
  useEffect(()=>{if(cd<=0)return;const t=setTimeout(()=>setCd(c=>c-1),1000);return()=>clearTimeout(t)},[cd]);
  useEffect(()=>{if(!loading&&!sLoading){setElapsed(0);return}const t=setInterval(()=>setElapsed(e=>e+1),1000);return()=>clearInterval(t)},[loading,sLoading]);

  const sel=seeds.find(s=>s.id===selId);
  const swR=seeds.filter(s=>s.riffs?.length>0).length;

  const add=useCallback(()=>{
    if(seeds.length>=20){setErr("Max 20 seeds");return}
    const t=san(inp);if(!t)return;
    const ns={id:Date.now().toString(),text:t,category:cat,riffs:[]};
    setSeeds(p=>[ns,...p]);setSelId(ns.id);setInp("");setView("riffs");setFilt("all");ref.current?.focus();
  },[inp,cat,seeds.length]);

  const del=useCallback(id=>{
    setSeeds(prev=>{const u=prev.filter(s=>s.id!==id);if(selId===id){const oi=prev.findIndex(s=>s.id===id);const nx=u[Math.min(oi,u.length-1)];setSelId(nx?.id||null)}return u});
  },[selId]);

  const riff=useCallback(async()=>{
    if(!sel||loading||cd>0)return;
    if((sel.riffs?.length||0)>=25){setErr("Max 25 per seed. Clear to add more.");return}
    setLoading(true);setErr(null);setView("riffs");
    try{
      const{system,user}=buildRiff(sel,seeds);
      const tools=[{type:"web_search_20250305",name:"web_search"}];
      const full=await callAPI(system,user,tools);
      let items=extractItems(full);
      if(!items.length){try{items=JSON.parse(full.replace(/```json\s*/g,"").replace(/```\s*/g,"").trim());if(!Array.isArray(items))items=[]}catch{items=[]}}
      if(!items.length)throw new Error("No resources found - try again");
      setSeeds(p=>p.map(s=>s.id===sel.id?{...s,riffs:[...(s.riffs||[]),...items]}:s));
    }catch(e){setErr(e.message)}
    finally{setLoading(false);setCd(10)}
  },[sel,loading,seeds,cd]);

  const synth=useCallback(async()=>{
    if(seeds.length<2||sLoading||cd>0)return;
    const use=seeds.filter(s=>s.riffs?.length>0);
    const inp=use.length>=2?use:seeds;
    setSLoading(true);setErr(null);setView("synthesis");
    try{
      const{system,user}=buildSynth(inp);
      const tools=[{type:"web_search_20250305",name:"web_search"}];
      const full=await callAPI(system,user,tools);
      let p;try{p=JSON.parse(full.replace(/```json\s*/g,"").replace(/```\s*/g,"").trim())}catch{const m=full.match(/\[[\s\S]*\]/);if(m)p=JSON.parse(m[0]);else throw new Error("Parse error")}
      setSynths(Array.isArray(p)?p:(p.syntheses||[]));
    }catch(e){setErr(e.message)}
    finally{setSLoading(false);setCd(10)}
  },[seeds,sLoading,cd]);

  const clr=useCallback(()=>{if(sel)setSeeds(p=>p.map(s=>s.id===sel.id?{...s,riffs:[]}:s))},[sel]);
  const reset=useCallback(()=>{if(window.confirm("Clear everything?")){setSeeds([]);setSynths([]);setSelId(null);sv({seeds:[],selectedId:null,syntheses:[]})}},[]);
  const expSeed=useCallback(()=>{if(sel)downloadMarkdown("riff.md",exportSeedMarkdown(sel))},[sel]);
  const expAll=useCallback(()=>{downloadMarkdown("riff-all.md",exportAllMarkdown(seeds,synths))},[seeds,synths]);
  const cp=useCallback(async(all)=>{await copyToClipboard(all?exportAllMarkdown(seeds,synths):sel?exportSeedMarkdown(sel):"");setCopied(true);setTimeout(()=>setCopied(false),2000)},[seeds,synths,sel]);

  const riffs=sel?.riffs||[];
  const types=["all",...new Set(riffs.map(r=>r.type).filter(Boolean))];
  const filt=filter==="all"?riffs:riffs.filter(r=>r.type===filter);

  const btnLabel=loading?"...":cd>0?"RIFF ("+cd+")":"RIFF";
  const sLabel=sLoading?"...":cd>0?"SYNTH ("+cd+")":"SYNTH";
  const canRiff=sel&&!loading&&cd<=0;
  const canSynth=seeds.length>=2&&!sLoading&&cd<=0;

  // ---- Shared pieces ----
  const catSelect=<select value={cat} onChange={e=>setCat(e.target.value)} style={{width:"100%",padding:"8px 10px",border:"1px solid #ccc",borderRadius:0,fontSize:14,fontFamily:"inherit",background:"#fff",minHeight:44,WebkitAppearance:"auto",appearance:"auto"}}>{CATS.map(([id,ic])=><option key={id} value={id}>{ic} {id.charAt(0).toUpperCase()+id.slice(1)}</option>)}</select>;

  const inputRow=(
    <div style={{display:"flex",gap:6}}>
      <input ref={ref} value={inp} onChange={e=>setInp(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()} placeholder="Enter a seed idea..." style={{flex:1,padding:"8px 10px",border:"1px solid #ccc",borderRadius:0,fontSize:14,fontFamily:"inherit",minHeight:44}}/>
      <button onClick={add} disabled={!inp.trim()} style={{padding:"8px 14px",background:inp.trim()?"#000":"#ddd",color:"#fff",border:"none",fontSize:16,fontWeight:600,minHeight:44,minWidth:44}}>+</button>
    </div>
  );

  const actions=(
    <div style={{display:"flex",flexDirection:"column",gap:5}}>
      <div style={{display:"flex",gap:5}}>
        <button onClick={riff} disabled={!canRiff} style={{flex:1,padding:"10px",background:canRiff?"#000":"#e8e8e8",color:canRiff?"#fff":"#aaa",border:"none",fontSize:12,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:"inherit",minHeight:44,cursor:canRiff?"pointer":"default"}}>{btnLabel}</button>
        <button onClick={synth} disabled={!canSynth} style={{flex:1,padding:"10px",background:"transparent",color:canSynth?"#000":"#ccc",border:"1px solid "+(canSynth?"#000":"#e0e0e0"),fontSize:12,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:"inherit",minHeight:44,cursor:canSynth?"pointer":"default"}}>{sLabel}</button>
      </div>
      <div style={{display:"flex",gap:5}}>
        <button onClick={expAll} style={{flex:1,padding:"8px",background:"none",border:"1px solid #ddd",fontSize:11,fontFamily:"inherit",color:"#666",minHeight:36}}>Export All</button>
        <button onClick={()=>cp(true)} style={{flex:1,padding:"8px",background:"none",border:"1px solid #ddd",fontSize:11,fontFamily:"inherit",color:"#666",minHeight:36}}>{copied?"Done":"Copy MD"}</button>
      </div>
      <button onClick={reset} style={{background:"none",border:"none",fontSize:10,color:"#bbb",textTransform:"uppercase",letterSpacing:"0.06em",padding:4,fontFamily:"inherit",cursor:"pointer"}}>RESET</button>
    </div>
  );

  const tabs=(
    <div style={{display:"flex",borderBottom:"1px solid #e0e0e0",flexShrink:0}}>
      <button onClick={()=>setView("riffs")} style={{flex:1,padding:"10px",fontSize:12,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",background:"none",border:"none",borderBottom:view==="riffs"?"2px solid #000":"2px solid transparent",color:view==="riffs"?"#000":"#999",fontFamily:"inherit",cursor:"pointer",minHeight:40,transition:"all 0.15s"}}>Resources</button>
      <button onClick={()=>setView("synthesis")} style={{flex:1,padding:"10px",fontSize:12,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",background:"none",border:"none",borderBottom:view==="synthesis"?"2px solid #000":"2px solid transparent",color:view==="synthesis"?"#000":"#999",fontFamily:"inherit",cursor:"pointer",minHeight:40,transition:"all 0.15s"}}>Synthesis</button>
    </div>
  );

  const loadingBanner=(loading||sLoading)?(
    <div style={{padding:"14px 16px",background:"#000",color:"#fff",fontSize:13,fontWeight:600,letterSpacing:"0.04em",display:"flex",alignItems:"center",gap:10,animation:"pulse 2s ease-in-out infinite"}}>
      <span style={{width:8,height:8,borderRadius:"50%",background:"#fff",animation:"blink 1s ease-in-out infinite"}}/>
      {loading?"Searching the web for connections..."+(elapsed>3?" ("+elapsed+"s)":""):"Synthesizing cross-connections..."+(elapsed>3?" ("+elapsed+"s)":"")}
    </div>
  ):null;

  const errBox=err?(
    <div style={{padding:"8px 12px",background:"#fff5f5",border:"1px solid #fcc",color:"#c00",fontSize:12,marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <span>{err}</span>
      <button onClick={()=>setErr(null)} style={{background:"none",border:"none",color:"#c00",cursor:"pointer",fontSize:14,padding:"0 4px"}}>
        <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.5" fill="none"><line x1="1" y1="1" x2="9" y2="9"/><line x1="9" y1="1" x2="1" y2="9"/></svg>
      </button>
    </div>
  ):null;

  const results=(
    <>
      {loadingBanner}
      <div style={{padding:"12px 16px"}}>
        {errBox}
        {view==="riffs"&&sel?(
          <>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexWrap:"wrap",gap:6}}>
              <div><span style={{fontSize:13}}>{ci(sel.category)}</span> <span style={{fontSize:10,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",color:"#aaa"}}>{sel.category}</span><div style={{fontSize:15,fontWeight:600,marginTop:2}}>{sel.text}</div></div>
              {riffs.length>0&&<div style={{display:"flex",gap:4}}><button onClick={expSeed} style={tb}>Export</button><button onClick={()=>cp(false)} style={tb}>{copied?"Done":"Copy"}</button><button onClick={clr} style={tb}>Clear</button></div>}
            </div>
            {types.length>2&&<div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:10}}>{types.map(t=><button key={t} onClick={()=>setFilt(t)} style={{padding:"2px 8px",fontSize:11,fontWeight:600,background:filter===t?"#000":"#f5f5f5",color:filter===t?"#fff":"#666",border:"none",cursor:"pointer",fontFamily:"inherit"}}>{t==="all"?"All ("+riffs.length+")":(TI[t]||"")+" "+t}</button>)}</div>}
            {filt.length===0&&!loading&&<div style={{color:"#bbb",fontSize:13,paddingTop:16,textAlign:"center"}}>Hit Riff to discover connections</div>}
            {filt.map((item,i)=><Card key={sel.id+"-"+i} item={item} i={i}/>)}
          </>
        ):view==="synthesis"?(
          <>
            {synths.length===0&&!sLoading&&<div style={{color:"#bbb",fontSize:13,paddingTop:16,textAlign:"center"}}>{swR<2?"Riff on 2+ seeds first":"Hit Synthesize"}</div>}
            {synths.map((s,i)=><SCard key={i} syn={s} i={i}/>)}
          </>
        ):<div style={{color:"#bbb",fontSize:13,paddingTop:16,textAlign:"center"}}>Select a seed and hit Riff</div>}
      </div>
    </>
  );

  /* ===== MOBILE: single scrollable column ===== */
  if(mob){
    return(
      <div style={{fontFamily:"'Helvetica Neue',Helvetica,Arial,sans-serif",background:"#fff",color:"#000",minHeight:"100vh"}}>
        <style>{CSS}</style>
        <div style={{padding:"12px 16px 4px"}}><div style={{display:"flex",alignItems:"center",gap:8}}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="11" stroke="#000" strokeWidth="1.5"/><path d="M9 5v7c0 2 1.5 3 3 3s3-1 3-3V5" stroke="#000" strokeWidth="1.5" strokeLinecap="round"/><line x1="12" y1="15" x2="12" y2="20" stroke="#000" strokeWidth="1.5" strokeLinecap="round"/></svg><span style={{fontSize:12,fontWeight:800,letterSpacing:"0.14em",textTransform:"uppercase"}}>Riff Machine</span></div><div style={{fontSize:11,color:"#999",marginTop:2}}>Pick a category, type an idea, hit Riff.</div></div>
        <div style={{padding:"6px 16px"}}>{catSelect}</div>
        <div style={{padding:"6px 16px"}}>{inputRow}</div>
        {seeds.length>0&&<div style={{display:"flex",gap:6,padding:"8px 16px",overflowX:"auto",WebkitOverflowScrolling:"touch"}}>{seeds.map(s=><button key={s.id} onClick={()=>{setSelId(s.id);setView("riffs");setFilt("all")}} style={{flexShrink:0,padding:"6px 12px",fontSize:12,background:s.id===selId?"#000":"#f0f0f0",color:s.id===selId?"#fff":"#000",border:"none",borderRadius:16,cursor:"pointer",whiteSpace:"nowrap",fontFamily:"inherit",minHeight:32,boxShadow:s.id===selId?"0 2px 8px rgba(0,0,0,0.2)":"none"}}>{ci(s.category)} {s.text.length>15?s.text.slice(0,15)+"...":s.text}</button>)}</div>}
        <div style={{padding:"8px 16px"}}>{actions}</div>
        {tabs}
        {results}
      </div>
    );
  }

  /* ===== DESKTOP ===== */
  return(
    <div style={{display:"flex",height:"100vh",width:"100%",fontFamily:"'Helvetica Neue',Helvetica,Arial,sans-serif",background:"#fff",color:"#000",overflow:"hidden"}}>
      <style>{CSS}</style>
      <nav style={{width:260,minWidth:260,borderRight:"1px solid #e0e0e0",display:"flex",flexDirection:"column",height:"100%"}}>
        <div style={{padding:"14px 12px 10px",borderBottom:"1px solid #e0e0e0"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="11" stroke="#000" strokeWidth="1.5"/><path d="M9 5v7c0 2 1.5 3 3 3s3-1 3-3V5" stroke="#000" strokeWidth="1.5" strokeLinecap="round"/><line x1="12" y1="15" x2="12" y2="20" stroke="#000" strokeWidth="1.5" strokeLinecap="round"/></svg><span style={{fontSize:11,fontWeight:800,letterSpacing:"0.14em",textTransform:"uppercase"}}>Riff Machine</span></div>
          <div style={{fontSize:11,color:"#999",marginBottom:12}}>Pick a category, type an idea, hit Riff.</div>
          {catSelect}
          <div style={{marginTop:8}}>{inputRow}</div>
        </div>
        <div style={{flex:1,overflowY:"auto"}}>
          {seeds.map(s=>(
            <div key={s.id} onClick={()=>{setSelId(s.id);setView("riffs");setFilt("all")}} style={{padding:"8px 12px",cursor:"pointer",background:s.id===selId?"#000":"transparent",color:s.id===selId?"#fff":"#000",borderBottom:"1px solid #e8e8e8",fontSize:13,display:"flex",alignItems:"center",gap:6}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:5}}><span style={{fontSize:13}}>{ci(s.category)}</span><span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontWeight:500}}>{s.text}</span></div>
                <div style={{fontSize:10,color:s.id===selId?"#aaa":"#999",marginTop:1,paddingLeft:22}}>{s.category}{s.riffs?.length>0?" - "+s.riffs.length+" found":""}</div>
              </div>
              <button onClick={e=>{e.stopPropagation();del(s.id)}} style={{background:"none",border:"none",cursor:"pointer",color:s.id===selId?"#777":"#ccc",fontSize:13,padding:4}} aria-label="Remove">
                <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.5" fill="none"><line x1="1" y1="1" x2="9" y2="9"/><line x1="9" y1="1" x2="1" y2="9"/></svg>
              </button>
            </div>
          ))}
          <div style={{padding:"10px 12px"}}>{actions}</div>
        </div>
      </nav>
      <main style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        {tabs}
        <div style={{flex:1,overflowY:"auto"}}>{results}</div>
      </main>
    </div>
  );
}

const tb={background:"none",border:"1px solid #ddd",padding:"3px 8px",fontSize:10,cursor:"pointer",color:"#666",fontFamily:"inherit"};
const CSS=`*{box-sizing:border-box}::selection{background:#000;color:#fff}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:#ccc;border-radius:2px}select:focus,input:focus{outline:1px solid #000}article:hover{background:#f5f5f5 !important}@keyframes blink{0%,100%{opacity:0.3}50%{opacity:1}}@keyframes pulse{0%,100%{opacity:0.85}50%{opacity:1}}`;
