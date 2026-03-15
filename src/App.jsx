import { useState, useMemo, useCallback, useRef } from "react";
import * as Papa from "papaparse";

import { useState, useMemo, useCallback, useRef } from "react";
import * as Papa from "papaparse";
import * as XLSX from "xlsx";

const YEAR = 2026;
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const C = { bg:"#13131f", bg2:"#1a1a2a", bg3:"#1e1e2e", bg4:"#222238", border:"#2a2a3e", text:"#e0e0e0", text2:"#8888aa", text3:"#6b6b8a", blue:"#3b82f6", purple:"#8b5cf6", green:"#10b981", yellow:"#f59e0b", pink:"#ec4899", red:"#ef4444", white:"#fff", orange:"#f97316", dark:"#0f0f1a", rowAlt:"#1a1a30" };
const pctColor = p => p >= 100 ? C.green : p >= 95 ? C.yellow : p >= 90 ? C.orange : C.red;

// ═══════════════════════════════════════════════════════════
// KR2 MASTER CATEGORIES
// ═══════════════════════════════════════════════════════════
const CATEGORIES = [
  {id:"compliance",name:"Daily Compliance",type:"daily"},{id:"toolbox",name:"Daily Toolbox",type:"daily"},
  {id:"daily_mhe_30014",name:"Daily MHE Check 30014",type:"daily"},{id:"daily_mhe_60457",name:"Daily MHE Check 60457",type:"daily"},
  {id:"daily_mhe_f500",name:"Daily MHE Check F5000862",type:"daily"},{id:"weekly_mhe_30014",name:"Weekly MHE Check 30014",type:"weekly"},
  {id:"weekly_mhe_60457",name:"Weekly MHE Check 60457",type:"weekly"},{id:"weekly_mhe_f500",name:"Weekly MHE Check F5000862",type:"weekly"},
  {id:"weekly_cleaning",name:"Weekly Cleaning",type:"weekly"},{id:"weekly_compliance",name:"Weekly Compliance",type:"weekly"},
  {id:"kr2_weekly",name:"KR2",type:"weekly"},{id:"mango_incident",name:"Weekly Mango Incident",type:"weekly",note:"Closed in 14 days"},
  {id:"kr2_closed",name:"KR2 Closed",type:"weekly"},
];
const ST={NONE:0,DONE:1,NOT_DONE:2,HOLIDAY:3,NOT_USED:4};
const ST_COLORS={0:C.bg2,1:C.green,2:C.red,3:C.yellow,4:C.blue};
const ST_LABELS={0:"",1:"✓",2:"✗",3:"H",4:"—"};

function daysInMonth(m){return new Date(YEAR,m+1,0).getDate();}
function isWeekend(m,d){const dow=new Date(YEAR,m,d).getDay();return dow===0||dow===6;}
function getDowName(m,d){return["Su","Mo","Tu","We","Th","Fr","Sa"][new Date(YEAR,m,d).getDay()];}

function initMasterData(){
  const data={};
  CATEGORIES.forEach(cat=>{data[cat.id]={};for(let mi=0;mi<12;mi++){data[cat.id][mi]={};
    if(cat.type==="daily"){for(let d=1;d<=daysInMonth(mi);d++)data[cat.id][mi][d]=isWeekend(mi,d)?ST.NOT_USED:ST.NONE;}
    else{for(let w=1;w<=5;w++)data[cat.id][mi][w]=ST.NONE;}}});return data;
}

// ═══════════════════════════════════════════════════════════
// KR2 HELPERS
// ═══════════════════════════════════════════════════════════
function findCol(headers,aliases){
  const lower=headers.map(h=>h.toLowerCase().replace(/[\s_]/g,""));
  for(const a of aliases){const la=a.toLowerCase().replace(/[\s_]/g,"");const i=lower.indexOf(la);if(i>=0)return headers[i];}
  for(const a of aliases){const la=a.toLowerCase().replace(/[\s_]/g,"");for(let i=0;i<lower.length;i++)if(lower[i].includes(la))return headers[i];}
  return null;
}
function parseDate(val){if(!val)return null;const s=String(val).trim();if(!s)return null;const d=new Date(s);if(!isNaN(d.getTime()))return d;return null;}
function countSkus(val){if(!val)return 1;const s=String(val).trim();if(!s)return 1;let parts=s.split(/[;|\n]/).map(p=>p.trim()).filter(Boolean);if(parts.length>1)return parts.length;parts=s.split(",").map(p=>p.trim()).filter(Boolean);if(parts.length>1&&parts.some(p=>/\d/.test(p)&&/[a-zA-Z]/.test(p)))return parts.length;return 1;}
function extractSkus(val){if(!val)return[];const s=String(val).trim();let parts=s.split(/[;|\n]/).map(p=>p.trim()).filter(Boolean);if(parts.length<=1)parts=s.split(",").map(p=>p.trim()).filter(Boolean);const r=parts.map(p=>p.replace(/\s*[\(x×]\s*\d+\s*\)?$/,"").replace(/\s*-\s*\d+$/,"").trim()).filter(Boolean);return r.length?r:[s];}
function fmtHours(mins){if(mins==null)return"—";return(mins/60).toFixed(1)+"h";}
function isClosed(st){return st&&st.toLowerCase().trim()==="closed";}

function calcStats(data){
  const t=data.length,cl=data.filter(o=>o.isClosed).length,mi=data.filter(o=>o.isMissed).length;
  const picks=data.reduce((a,o)=>a+o.picks,0);const dates=[...new Set(data.filter(o=>o.date).map(o=>o.date))].sort();const days=dates.length||1;
  const times=data.filter(o=>o.kr2TimeMins!=null).map(o=>o.kr2TimeMins);const avgTime=times.length?times.reduce((a,b)=>a+b,0)/times.length:null;
  const sortedT=[...times].sort((a,b)=>a-b);const medTime=sortedT.length?sortedT[Math.floor(sortedT.length/2)]:null;
  const pm={};data.forEach(o=>{if(!pm[o.picker])pm[o.picker]=[];pm[o.picker].push(o);});
  const pickers=Object.entries(pm).sort((a,b)=>b[1].length-a[1].length).map(([name,rows])=>{
    const pc=rows.filter(o=>o.isClosed).length;const pt=rows.filter(o=>o.kr2TimeMins!=null).map(o=>o.kr2TimeMins);const pts=[...pt].sort((a,b)=>a-b);
    return{name,orders:rows.length,picks:rows.reduce((a,o)=>a+o.picks,0),closed:pc,missed:rows.length-pc,kr2:rows.length?(pc/rows.length*100):0,
      avgTime:pt.length?pt.reduce((a,b)=>a+b,0)/pt.length:null,medianTime:pts.length?pts[Math.floor(pts.length/2)]:null,fastest:pt.length?Math.min(...pt):null,slowest:pt.length?Math.max(...pt):null};});
  const cm={};data.forEach(o=>{if(!cm[o.client])cm[o.client]=[];cm[o.client].push(o);});
  const clients=Object.entries(cm).map(([name,r])=>({name,orders:r.length,picks:r.reduce((a,o)=>a+o.picks,0),closed:r.filter(o=>o.isClosed).length,missed:r.filter(o=>o.isMissed).length,kr2:r.length?(r.filter(o=>o.isClosed).length/r.length*100):0})).sort((a,b)=>b.orders-a.orders);
  const dm={};data.forEach(o=>{if(o.date){if(!dm[o.date])dm[o.date]=[];dm[o.date].push(o);}});
  const daily=dates.map(d=>({date:d,orders:dm[d].length,picks:dm[d].reduce((a,o)=>a+o.picks,0),closed:dm[d].filter(o=>o.isClosed).length,missed:dm[d].length-dm[d].filter(o=>o.isClosed).length,kr2:dm[d].length?(dm[d].filter(o=>o.isClosed).length/dm[d].length*100):0}));
  const sk={};data.forEach(o=>o.skus.forEach(s=>{sk[s]=(sk[s]||0)+1;}));
  const skus=Object.entries(sk).map(([sku,count])=>({sku,count})).sort((a,b)=>b.count-a.count).slice(0,30);
  const stm={};data.forEach(o=>{if(o.status)stm[o.status]=(stm[o.status]||0)+1;});
  const statuses=Object.entries(stm).map(([status,count])=>({status,count})).sort((a,b)=>b.count-a.count);
  return{total:t,closed:cl,missed:mi,kr2_pct:t?(cl/t*100):0,picks,days,avgOrdersDay:Math.round(t/days*10)/10,kr2_avg_time:avgTime,kr2_median_time:medTime,pickers,clients,daily,skus,missed_orders:data.filter(o=>o.isMissed),statuses};
}

// ═══════════════════════════════════════════════════════════
// CNZ MAPPER LOGIC
// ═══════════════════════════════════════════════════════════
const CNZ_FIELDS = {
  container_id:{col:0,label:"Container / Reference ID",desc:"Container number or shipment reference",kw:["container","shipment","consignment","booking","reference","ref","bill of lading","bol","bl","delivery","po number","purchase order","asn","receipt","inbound","tracking"],fromFilename:true},
  material:{col:4,label:"Material / SKU Code",desc:"Product code, material number, or SKU",kw:["material","sku","product","item code","article","part number","part no","upc","ean","barcode","product code","item number","item no","stock code","catalog","gtin"]},
  quantity:{col:5,label:"Quantity (EA)",desc:"Total quantity in eaches",kw:["actual delivery qty","quantity","qty","units","total qty","ship qty","shipped","received","ea qty","each","pieces","pcs","count","delivery qty","order qty","actual qty"]},
  batch:{col:6,label:"Batch / Lot Number",desc:"Batch, lot, or vintage code",kw:["batch","lot","lot number","lot no","vintage","batch number","batch no","lot code","production batch","expiry","best before","bbe"]},
};
const CNZ_STATIC = [
  {col:9,label:"Location",value:"DOCK"},{col:18,label:"System Set",value:"SYSTEMSET"},
  {col:20,label:"Pallet Type",value:"CHEP PALLET"},{col:25,label:"Create Multiple MUs",value:"CreateMultipleMUs:TRUE"},
];
const CNZ_TOTAL_COLS = 26;

function cnzNormalize(t){return String(t).toLowerCase().replace(/[^a-z0-9 ]/g,"").trim();}

function cnzScoreMatch(srcCol,keywords){
  const nc=cnzNormalize(srcCol);let best=0;
  for(const kw of keywords){
    const nk=cnzNormalize(kw);
    if(nc===nk)return 1;
    if(nk.includes(nc)||nc.includes(nk))best=Math.max(best,0.85);
    const cw=new Set(nc.split(/\s+/)),kws=new Set(nk.split(/\s+/));
    let overlap=0;cw.forEach(w=>{if(kws.has(w))overlap++;});
    if(cw.size&&kws.size){const ov=overlap/Math.max(cw.size,kws.size);if(ov>0)best=Math.max(best,ov*0.9);}
  }
  return best;
}

function cnzAutoMap(srcCols){
  const scores=[];
  for(const[fn,fd]of Object.entries(CNZ_FIELDS)){
    if(fd.fromFilename)continue;
    for(const sc of srcCols){const s=cnzScoreMatch(sc,fd.kw);scores.push({s,fn,sc});}
  }
  scores.sort((a,b)=>b.s-a.s);
  const mapped={},used=new Set();
  for(const{s,fn,sc}of scores){if(mapped[fn]||used.has(sc))continue;if(s>=0.3){mapped[fn]={col:sc,conf:s};used.add(sc);}}
  return mapped;
}

function cnzExtractContainer(filename){
  const name=filename.replace(/\.[^.]+$/,"").toUpperCase();
  const pats=[/[A-Z]{4}\d{7}/,/[A-Z]{3}U\d{7}/,/[A-Z]{2,4}\d{5,}/];
  for(const p of pats){const m=name.match(p);if(m)return m[0];}
  return filename.replace(/\.[^.]+$/,"");
}

// ═══════════════════════════════════════════════════════════
// UI COMPONENTS
// ═══════════════════════════════════════════════════════════
const Card=({title,value,sub,color=C.blue,icon})=>(
  <div style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:8,padding:"16px 20px",flex:1,minWidth:140}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <span style={{color:C.text2,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>{title}</span>
      {icon&&<span style={{fontSize:16}}>{icon}</span>}
    </div>
    <div style={{color,fontSize:30,fontWeight:800,marginTop:6}}>{value}</div>
    {sub&&<div style={{color:C.text3,fontSize:12,marginTop:2}}>{sub}</div>}
  </div>
);
const Gauge=({pct,closed,total})=>{const color=pctColor(pct);return(
  <div style={{background:C.bg3,border:`2px solid ${color}`,borderRadius:8,padding:"16px 20px",flex:1,minWidth:160}}>
    <div style={{color,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>KR2 COMPLETION</div>
    <div style={{color,fontSize:38,fontWeight:800,marginTop:4}}>{pct.toFixed(1)}%</div>
    <div style={{background:C.bg,borderRadius:6,height:12,marginTop:8,overflow:"hidden"}}><div style={{background:color,height:"100%",width:`${Math.max(pct,1)}%`,borderRadius:6,transition:"width 0.5s"}}/></div>
    <div style={{color,fontSize:11,fontWeight:700,marginTop:6}}>{pct>=100?"ALL CLOSED ✓":`${closed}/${total} closed · ${total-closed} missed`}</div>
  </div>
);};
const BarChart=({data,color=C.blue,title,max=12})=>{const items=data.slice(0,max);const mx=Math.max(...items.map(d=>d.value),1);return(
  <div style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:8,padding:"14px 18px"}}>
    {title&&<div style={{color:C.text2,fontSize:13,fontWeight:700,marginBottom:10}}>{title}</div>}
    {items.map((d,i)=>(<div key={i} style={{display:"flex",alignItems:"center",marginBottom:4}}>
      <span style={{color:C.text2,fontSize:12,width:160,textAlign:"right",flexShrink:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.label}</span>
      <div style={{flex:1,background:C.bg,height:22,borderRadius:4,marginLeft:8,overflow:"hidden"}}><div style={{background:d.color||color,height:"100%",width:`${Math.max(d.value/mx*100,1)}%`,borderRadius:4}}/></div>
      <span style={{color:C.text,fontSize:12,fontWeight:700,width:70,textAlign:"right",flexShrink:0}}>{typeof d.value==="number"?d.value%1?d.value.toFixed(1):d.value:d.value}{d.suffix||""}</span>
    </div>))}{!items.length&&<div style={{color:C.text3}}>No data</div>}
  </div>
);};
const Table=({columns,rows})=>(<div style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:8,overflow:"auto",maxHeight:600}}>
  <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}><thead><tr style={{position:"sticky",top:0,zIndex:1}}>{columns.map((c,i)=>(
    <th key={i} style={{background:C.bg2,color:C.text2,padding:"12px 14px",textAlign:c.align||"left",fontWeight:700,fontSize:12,borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap",position:"sticky",top:0}}>{c.label}</th>
  ))}</tr></thead><tbody>{rows.map((r,ri)=>(<tr key={ri} style={{background:ri%2?C.rowAlt:C.bg3}}>{columns.map((c,ci)=>(
    <td key={ci} style={{padding:"10px 14px",color:C.text,borderBottom:`1px solid ${C.border}22`,textAlign:c.align||"left",whiteSpace:"nowrap"}}>{r[c.key]??"—"}</td>
  ))}</tr>))}</tbody></table></div>);

const Btn=({children,bg=C.blue,onClick,disabled,small})=>(<button onClick={onClick} disabled={disabled} style={{background:disabled?"#555":bg,color:C.white,border:"none",borderRadius:small?4:6,padding:small?"5px 12px":"8px 18px",fontWeight:700,fontSize:small?11:13,cursor:disabled?"default":"pointer",opacity:disabled?0.5:1}}>{children}</button>);
const Select=({value,onChange,options,width=180})=>(<select value={value} onChange={e=>onChange(e.target.value)} style={{background:C.bg3,color:C.text,border:`1px solid ${C.border}`,borderRadius:4,padding:"6px 10px",fontSize:12,width}}>{options.map(o=><option key={o} value={o}>{o}</option>)}</select>);

// ═══════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════
export default function App(){
  const [orders,setOrders]=useState([]);const [tab,setTab]=useState("dashboard");const [fileName,setFileName]=useState("");
  const [dateF,setDateF]=useState("all");const [pickerF,setPickerF]=useState("all");const [clientF,setClientF]=useState("all");
  const now=new Date();const yest=new Date(now);yest.setDate(yest.getDate()-1);
  const [kr2Start,setKr2Start]=useState(new Date(yest.getFullYear(),yest.getMonth(),yest.getDate(),14,0,0));
  const [kr2End,setKr2End]=useState(new Date(now.getFullYear(),now.getMonth(),now.getDate(),17,0,0));
  const [kr2StartStr,setKr2StartStr]=useState(`${yest.getFullYear()}-${String(yest.getMonth()+1).padStart(2,"0")}-${String(yest.getDate()).padStart(2,"0")} 14:00`);
  const [kr2EndStr,setKr2EndStr]=useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")} 17:00`);
  const [masterData,setMasterData]=useState(()=>initMasterData());const [masterMonth,setMasterMonth]=useState(now.getMonth());const [masterCat,setMasterCat]=useState(null);
  const fileRef=useRef();

  // CNZ state
  const [cnzSrcData,setCnzSrcData]=useState(null);const [cnzSrcCols,setCnzSrcCols]=useState([]);const [cnzFileName,setCnzFileName]=useState("");
  const [cnzMappings,setCnzMappings]=useState({});const [cnzContainer,setCnzContainer]=useState("");const [cnzContainerCol,setCnzContainerCol]=useState("");
  const [cnzPreview,setCnzPreview]=useState(false);
  const cnzFileRef=useRef();

  // CSV import handler
  const handleCSV=useCallback((e)=>{const file=e.target.files[0];if(!file)return;setFileName(file.name);
    Papa.parse(file,{header:true,skipEmptyLines:true,dynamicTyping:false,complete:(results)=>{
      const headers=results.meta.fields||[];
      const cm={picker:findCol(headers,["PickJob Assignee","PickJobAssignee","Picker","Picked By"]),orderId:findCol(headers,["ReferenceNum","Reference Num","Reference Number","Order Number"]),
        skuQty:findCol(headers,["SkuAndQty","Sku And Qty","Items"]),printDate:findCol(headers,["PickTicketPrintDate","Pick Ticket Print Date"]),doneDate:findCol(headers,["PickDoneDate","Pick Done Date","ClosedDate"]),
        client:findCol(headers,["Customer","CustomerName","Client","Account","Channel"]),status:findCol(headers,["Status","Order Status","OrderStatus"]),shipDate:findCol(headers,["ShipDate","Ship Date"]),creationDate:findCol(headers,["CreationDate","Creation Date","OrderDate"])};
      const parsed=results.data.map(row=>{const o={};o.picker=(cm.picker?String(row[cm.picker]||"").trim():"")||"Unassigned";o.orderId=cm.orderId?String(row[cm.orderId]||"").trim():"";
        const sq=cm.skuQty?String(row[cm.skuQty]||"").trim():"";o.picks=countSkus(sq);o.skus=extractSkus(sq);o.client=(cm.client?String(row[cm.client]||"").trim():"")||"N/A";
        o.status=cm.status?String(row[cm.status]||"").trim():"";o.isClosed=isClosed(o.status);o.isMissed=!o.isClosed;
        const pd=cm.printDate?parseDate(row[cm.printDate]):null;const dd=cm.doneDate?parseDate(row[cm.doneDate]):null;o.printDate=pd;o.doneDate=dd;
        if(pd&&dd){const diff=(dd-pd)/60000;o.kr2TimeMins=diff>0&&diff<2880?diff:null;}else o.kr2TimeMins=null;
        const ds=dd||pd||(cm.shipDate?parseDate(row[cm.shipDate]):null)||(cm.creationDate?parseDate(row[cm.creationDate]):null);
        o.date=ds?`${ds.getFullYear()}-${String(ds.getMonth()+1).padStart(2,"0")}-${String(ds.getDate()).padStart(2,"0")}`:"";return o;
      }).filter(o=>o.orderId||o.date);setOrders(parsed);setTab("dashboard");}});
  },[]);

  // CNZ file handler
  const handleCnzFile=useCallback((e)=>{
    const file=e.target.files[0];if(!file)return;setCnzFileName(file.name);setCnzPreview(false);
    const ext=file.name.split(".").pop().toLowerCase();
    if(ext==="csv"){
      Papa.parse(file,{header:true,skipEmptyLines:true,complete:(r)=>{setCnzSrcCols(r.meta.fields||[]);setCnzSrcData(r.data);
        const m=cnzAutoMap(r.meta.fields||[]);setCnzMappings(m);setCnzContainer(cnzExtractContainer(file.name));setCnzContainerCol("");}});
    } else {
      const reader=new FileReader();reader.onload=(ev)=>{
        const wb=XLSX.read(ev.target.result,{type:"array"});const ws=wb.Sheets[wb.SheetNames[0]];
        const json=XLSX.utils.sheet_to_json(ws,{defval:""});const cols=json.length?Object.keys(json[0]):[];
        setCnzSrcCols(cols);setCnzSrcData(json);const m=cnzAutoMap(cols);setCnzMappings(m);setCnzContainer(cnzExtractContainer(file.name));setCnzContainerCol("");
      };reader.readAsArrayBuffer(file);
    }
  },[]);

  const cnzBuildOutput=useCallback(()=>{
    if(!cnzSrcData)return[];
    return cnzSrcData.map(row=>{
      const out=new Array(CNZ_TOTAL_COLS).fill("");
      // Container
      if(cnzContainerCol&&cnzContainerCol!=="-- Not Mapped --")out[0]=row[cnzContainerCol]||"";
      else out[0]=cnzContainer;
      // Dynamic fields
      for(const[fn,fd]of Object.entries(CNZ_FIELDS)){if(fn==="container_id")continue;if(cnzMappings[fn])out[fd.col]=row[cnzMappings[fn].col]||"";}
      // Static
      CNZ_STATIC.forEach(s=>{out[s.col]=s.value;});
      return out;
    });
  },[cnzSrcData,cnzMappings,cnzContainer,cnzContainerCol]);

  const cnzExport=useCallback(()=>{
    const output=cnzBuildOutput();if(!output.length)return;
    const wb=XLSX.utils.book_new();const ws=XLSX.utils.aoa_to_sheet(output);XLSX.utils.book_append_sheet(wb,ws,"Sheet 1");
    const ws2=XLSX.utils.aoa_to_sheet([]);XLSX.utils.book_append_sheet(wb,ws2,"Sheet2");
    const stem=cnzFileName.replace(/\.[^.]+$/,"");XLSX.writeFile(wb,`CNZ_Import_${stem}.xlsx`);
  },[cnzBuildOutput,cnzFileName]);

  // Computed
  const pickers=useMemo(()=>[...new Set(orders.map(o=>o.picker))].sort(),[orders]);
  const clientsList=useMemo(()=>[...new Set(orders.map(o=>o.client))].sort(),[orders]);
  const kr2Filtered=useMemo(()=>orders.filter(o=>o.printDate&&o.printDate>=kr2Start&&o.printDate<=kr2End),[orders,kr2Start,kr2End]);
  const filtered=useMemo(()=>{let d=[...orders];const today=new Date().toISOString().slice(0,10);
    if(dateF==="today")d=d.filter(o=>o.date===today);else if(dateF==="week"){const c=new Date();c.setDate(c.getDate()-7);d=d.filter(o=>o.date>=c.toISOString().slice(0,10));}
    else if(dateF==="month")d=d.filter(o=>o.date.startsWith(today.slice(0,7)));
    if(pickerF!=="all")d=d.filter(o=>o.picker===pickerF);if(clientF!=="all")d=d.filter(o=>o.client===clientF);return d;},[orders,dateF,pickerF,clientF]);
  const stats=useMemo(()=>calcStats(["dashboard","kr2detail"].includes(tab)?kr2Filtered:filtered),[tab,kr2Filtered,filtered]);
  const kr2pct=orders.length?(kr2Filtered.filter(o=>o.isClosed).length/(kr2Filtered.length||1)*100):0;

  const applyKr2=()=>{try{const p=kr2StartStr.trim().split(/[\sT]/),dp=p[0].split("-"),tp=(p[1]||"00:00").split(":");
    setKr2Start(new Date(+dp[0],+dp[1]-1,+dp[2],+tp[0],+tp[1]||0));
    const p2=kr2EndStr.trim().split(/[\sT]/),dp2=p2[0].split("-"),tp2=(p2[1]||"00:00").split(":");
    setKr2End(new Date(+dp2[0],+dp2[1]-1,+dp2[2],+tp2[0],+tp2[1]||0));}catch(e){alert("Format: YYYY-MM-DD HH:MM");}};

  const masterStats=useMemo(()=>{const result={};let tA=0,tD=0,tN=0;
    CATEGORIES.forEach(cat=>{let cA=0,cD=0,cN=0;const monthly={};for(let mi=0;mi<12;mi++){let app=0,done=0,nd=0;
      Object.values(masterData[cat.id]?.[mi]||{}).forEach(v=>{v=+v;if(v===ST.DONE){done++;app++;}else if(v===ST.NOT_DONE){nd++;app++;}else if(v===ST.NONE)app++;});
      monthly[mi]={app,done,nd,pct:app?(done/app*100):0};cA+=app;cD+=done;cN+=nd;}
      result[cat.id]={monthly,app:cA,done:cD,nd:cN,pct:cA?(cD/cA*100):0};tA+=cA;tD+=cD;tN+=cN;});
    result._overall={app:tA,done:tD,nd:tN,pct:tA?(tD/tA*100):0};return result;},[masterData]);

  const toggleMC=(catId,mi,key)=>{setMasterData(p=>{const n=JSON.parse(JSON.stringify(p));n[catId][mi][key]=(+(n[catId]?.[mi]?.[key]??0)+1)%5;return n;});};
  const bulkSet=(catId,mi,state,catType)=>{setMasterData(p=>{const n=JSON.parse(JSON.stringify(p));
    if(catType==="daily"){for(let d=1;d<=daysInMonth(mi);d++)if(!isWeekend(mi,d))n[catId][mi][d]=state;}else{for(let w=1;w<=5;w++)n[catId][mi][w]=state;}return n;});};

  // ── Tabs ──
  const kpiTabs=[{id:"dashboard",icon:"📊",label:"Dashboard"},{id:"kr2detail",icon:"🎯",label:"KR2 Detail"},{id:"team",icon:"👥",label:"Team"},{id:"picktime",icon:"⏱",label:"Times"},{id:"clients",icon:"📦",label:"Clients"},{id:"daily",icon:"📅",label:"Daily"},{id:"velocity",icon:"🔥",label:"Fast Movers"}];
  const masterTabs=[{id:"master_overview",icon:"📋",label:"KR2 Master"},{id:"master_table",icon:"📊",label:"Score Table"},{id:"master_detail",icon:"✏️",label:"Edit Grid"}];
  const toolTabs=[{id:"cnz_mapper",icon:"🔄",label:"Inwards Mapper"}];
  const isKpi=!tab.startsWith("master_")&&tab!=="cnz_mapper";
  const showFilters=isKpi&&!["dashboard","kr2detail"].includes(tab)&&orders.length>0;

  // ── KR2 Window ──
  const KR2Window=()=>(<div style={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 16px",marginBottom:10,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
    <span style={{color:C.yellow,fontWeight:700,fontSize:13}}>⏰ KR2 Window</span>
    <span style={{color:C.text2,fontSize:12}}>From:</span>
    <input value={kr2StartStr} onChange={e=>setKr2StartStr(e.target.value)} style={{background:C.bg3,color:C.text,border:`1px solid ${C.border}`,borderRadius:4,padding:"5px 10px",fontSize:12,width:160}}/>
    <span style={{color:C.text2,fontSize:12}}>To:</span>
    <input value={kr2EndStr} onChange={e=>setKr2EndStr(e.target.value)} style={{background:C.bg3,color:C.text,border:`1px solid ${C.border}`,borderRadius:4,padding:"5px 10px",fontSize:12,width:160}}/>
    <Btn onClick={applyKr2} small>Apply</Btn>
    <div style={{marginLeft:"auto",background:C.bg,borderRadius:4,padding:"5px 12px"}}><span style={{color:pctColor(kr2pct),fontWeight:700,fontSize:13}}>Orders: {kr2Filtered.length} · KR2: {kr2pct.toFixed(1)}%</span></div>
  </div>);

  // ═══════════════════════════════════════════════════════
  // RENDER FUNCTIONS
  // ═══════════════════════════════════════════════════════
  const renderWelcome=()=>(<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:400}}>
    <div style={{fontSize:56}}>📦</div><div style={{color:C.blue,fontSize:26,fontWeight:800,marginTop:12}}>3PL KR2 Complete — {YEAR}</div>
    <div style={{color:C.text2,fontSize:13,marginTop:6}}>Import CSV for KPI Dashboard · Use KR2 Master tabs for compliance tracking</div>
    <div style={{display:"flex",gap:12,marginTop:24}}>
      <Btn bg={C.purple} onClick={()=>fileRef.current?.click()}>📁 Import Order CSV</Btn>
      <Btn bg={C.green} onClick={()=>setTab("master_overview")}>📋 Open KR2 Master</Btn>
      <Btn bg={C.orange} onClick={()=>setTab("cnz_mapper")}>🔄 Inwards Mapper</Btn>
    </div>
  </div>);

  const renderDashboard=()=>(<div><KR2Window/>
    <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
      <Gauge pct={stats.kr2_pct} closed={stats.closed} total={stats.total}/>
      <Card title="Orders" value={stats.total.toLocaleString()} sub={`${stats.avgOrdersDay}/day · ${stats.days} days`} color={C.blue} icon="📋"/>
      <Card title="Closed" value={stats.closed.toLocaleString()} sub={`${stats.closed}/${stats.total}`} color={C.green} icon="✅"/>
      <Card title="Missed" value={stats.missed.toLocaleString()} sub={stats.missed?"not closed":"none!"} color={stats.missed?C.red:C.green} icon={stats.missed?"⚠️":"✅"}/>
      <Card title="Avg KR2 Time" value={fmtHours(stats.kr2_avg_time)} sub={`median ${fmtHours(stats.kr2_median_time)} · print→close`} color={C.yellow} icon="⏱"/>
      <Card title="Total Picks" value={stats.picks.toLocaleString()} sub={`${stats.pickers.length} pickers`} color={C.purple} icon="🎯"/>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
      <BarChart data={stats.pickers.map(p=>({label:p.name,value:Math.round(p.kr2*10)/10,color:pctColor(p.kr2),suffix:"%"}))} color={C.green} title="🎯 KR2 % by Picker"/>
      <BarChart data={stats.pickers.filter(p=>p.avgTime).map(p=>({label:p.name,value:Math.round(p.avgTime/60*10)/10,suffix:"h"}))} color={C.yellow} title="⏱ Avg KR2 Time (hours)"/>
      <BarChart data={stats.pickers.map(p=>({label:p.name,value:p.orders}))} color={C.blue} title="📋 Orders by Picker"/>
      <BarChart data={stats.clients.slice(0,12).map(c=>({label:c.name,value:c.orders}))} color={C.purple} title="📦 Orders by Client"/>
    </div></div>);

  const renderKr2Detail=()=>(<div><KR2Window/>
    <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
      <Gauge pct={stats.kr2_pct} closed={stats.closed} total={stats.total}/>
      <Card title="Closed" value={stats.closed.toLocaleString()} sub={`${stats.closed}/${stats.total}`} color={C.green} icon="✅"/>
      <Card title="Missed" value={stats.missed.toLocaleString()} sub={stats.missed?"not closed":"none!"} color={stats.missed?C.red:C.green} icon="⚠️"/>
      <Card title="Avg KR2 Time" value={fmtHours(stats.kr2_avg_time)} sub={`median ${fmtHours(stats.kr2_median_time)}`} color={C.yellow} icon="⏱"/>
    </div>
    {stats.statuses.length>0&&<div style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 16px",marginBottom:12}}>
      <div style={{color:C.text2,fontWeight:700,fontSize:13,marginBottom:6}}>📊 Status Breakdown</div>
      {stats.statuses.map((s,i)=>(<div key={i} style={{display:"flex",gap:12,padding:"3px 0"}}><span style={{color:s.status.toLowerCase()==="closed"?C.green:C.orange,fontWeight:700,fontSize:12,width:160}}>{s.status}</span><span style={{color:C.text,fontSize:12}}>{s.count} orders</span></div>))}
    </div>}
    {stats.missed_orders.length>0?<><div style={{color:C.red,fontWeight:700,fontSize:15,margin:"8px 0"}}>⚠️ {stats.missed_orders.length} Missed Orders</div>
      <Table columns={[{key:"orderId",label:"Order ID"},{key:"status",label:"Status"},{key:"picker",label:"Picker"},{key:"client",label:"Client"},{key:"print",label:"Print Time"},{key:"close",label:"Close Time"}]}
        rows={stats.missed_orders.map(o=>({orderId:o.orderId,status:o.status||"(blank)",picker:o.picker,client:o.client,print:o.printDate?o.printDate.toLocaleString():"—",close:o.doneDate?o.doneDate.toLocaleString():"—"}))}/></>
    :<div style={{color:C.green,fontWeight:800,fontSize:18,textAlign:"center",padding:40}}>✅ All orders Closed! KR2 = 100%</div>}
  </div>);

  const renderTeam=()=>(<div>
    <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}><Card title="Pickers" value={stats.pickers.length} color={C.blue} icon="👥"/><Card title="Orders" value={stats.total.toLocaleString()} color={C.purple} icon="📋"/><Card title="KR2" value={`${stats.kr2_pct.toFixed(1)}%`} color={pctColor(stats.kr2_pct)} icon="🎯"/><Card title="Picks" value={stats.picks.toLocaleString()} color={C.green} icon="📦"/></div>
    <Table columns={[{key:"name",label:"Picker"},{key:"orders",label:"Orders",align:"center"},{key:"closed",label:"Closed",align:"center"},{key:"missed",label:"Missed",align:"center"},{key:"kr2",label:"KR2 %",align:"center"},{key:"picks",label:"Picks",align:"center"},{key:"ap",label:"Picks/Order",align:"center"},{key:"time",label:"Avg KR2 Time",align:"center"}]}
      rows={stats.pickers.map(p=>({name:p.name,orders:p.orders,closed:p.closed,missed:p.missed,kr2:p.kr2.toFixed(1)+"%",picks:p.picks,ap:p.orders?(p.picks/p.orders).toFixed(1):"—",time:fmtHours(p.avgTime)}))}/></div>);

  const renderTimes=()=>{const allT=kr2Filtered.filter(o=>o.kr2TimeMins!=null).map(o=>o.kr2TimeMins);return(<div>
    <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}><Card title="Avg KR2 Time" value={fmtHours(stats.kr2_avg_time)} sub="print→close" color={C.yellow} icon="⏱"/><Card title="Median" value={fmtHours(stats.kr2_median_time)} color={C.orange} icon="📊"/>
      <Card title="Range" value={`${allT.length?fmtHours(Math.min(...allT)):"—"} – ${allT.length?fmtHours(Math.max(...allT)):"—"}`} sub="fastest – slowest" color={C.blue} icon="↔"/></div>
    <Table columns={[{key:"name",label:"Picker"},{key:"orders",label:"Orders",align:"center"},{key:"avg",label:"Avg",align:"center"},{key:"med",label:"Median",align:"center"},{key:"fast",label:"Fastest",align:"center"},{key:"slow",label:"Slowest",align:"center"},{key:"spread",label:"Spread",align:"center"}]}
      rows={stats.pickers.filter(p=>p.avgTime).map(p=>({name:p.name,orders:p.orders,avg:fmtHours(p.avgTime),med:fmtHours(p.medianTime),fast:fmtHours(p.fastest),slow:fmtHours(p.slowest),spread:p.slowest&&p.fastest?fmtHours(p.slowest-p.fastest):"—"}))}/></div>);};

  const renderClients=()=>(<div>
    <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}><Card title="Clients" value={stats.clients.length} color={C.purple} icon="📦"/><Card title="Orders" value={stats.total.toLocaleString()} color={C.blue} icon="📋"/><Card title="KR2" value={`${stats.kr2_pct.toFixed(1)}%`} color={pctColor(stats.kr2_pct)} icon="🎯"/></div>
    <Table columns={[{key:"name",label:"Client"},{key:"orders",label:"Orders",align:"center"},{key:"closed",label:"Closed",align:"center"},{key:"missed",label:"Missed",align:"center"},{key:"kr2",label:"KR2 %",align:"center"},{key:"picks",label:"Picks",align:"center"},{key:"ap",label:"Picks/Order",align:"center"},{key:"share",label:"% Total",align:"center"}]}
      rows={stats.clients.map(c=>({name:c.name,orders:c.orders,closed:c.closed,missed:c.missed,kr2:c.kr2.toFixed(1)+"%",picks:c.picks,ap:c.orders?(c.picks/c.orders).toFixed(1):"—",share:stats.total?(c.orders/stats.total*100).toFixed(1)+"%":"—"}))}/></div>);

  const renderDaily=()=>(<div>
    <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}><Card title="Days" value={stats.days} color={C.blue} icon="📅"/><Card title="Avg/Day" value={stats.avgOrdersDay} color={C.purple} icon="📋"/><Card title="Picks/Day" value={stats.days?(stats.picks/stats.days).toFixed(1):0} color={C.green} icon="📦"/><Card title="KR2" value={`${stats.kr2_pct.toFixed(1)}%`} color={pctColor(stats.kr2_pct)} icon="🎯"/></div>
    <Table columns={[{key:"date",label:"Date"},{key:"orders",label:"Orders",align:"center"},{key:"closed",label:"Closed",align:"center"},{key:"missed",label:"Missed",align:"center"},{key:"kr2",label:"KR2 %",align:"center"},{key:"picks",label:"Picks",align:"center"},{key:"ap",label:"Picks/Order",align:"center"}]}
      rows={stats.daily.map(d=>({date:d.date,orders:d.orders,closed:d.closed,missed:d.missed,kr2:d.kr2.toFixed(1)+"%",picks:d.picks,ap:d.orders?(d.picks/d.orders).toFixed(1):"—"}))}/></div>);

  const renderVelocity=()=>(<div>
    <BarChart data={stats.skus.slice(0,15).map(s=>({label:s.sku,value:s.count}))} color={C.pink} title="🔥 Fast Movers — Top 15 SKUs"/>
    <div style={{marginTop:10}}><Table columns={[{key:"rank",label:"#",align:"center"},{key:"sku",label:"SKU"},{key:"count",label:"Orders",align:"center"},{key:"rate",label:"Daily Rate",align:"center"},{key:"share",label:"% Picks",align:"center"}]}
      rows={stats.skus.map((s,i)=>({rank:i+1,sku:s.sku,count:s.count,rate:(s.count/stats.days).toFixed(1)+"/day",share:stats.picks?(s.count/stats.picks*100).toFixed(1)+"%":"—"}))}/></div></div>);

  // ── Master views ──
  const renderMasterOverview=()=>{const ov=masterStats._overall;return(<div>
    <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}><Gauge pct={ov.pct} closed={ov.done} total={ov.app}/><Card title="Done" value={ov.done} sub={`of ${ov.app}`} color={C.green} icon="✅"/><Card title="Not Done" value={ov.nd} color={ov.nd?C.red:C.green} icon="⚠️"/></div>
    <div style={{display:"flex",gap:14,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
      {[[ST.DONE,"Done",C.green],[ST.NOT_DONE,"Not Done",C.red],[ST.HOLIDAY,"Holiday",C.yellow],[ST.NOT_USED,"Not Used",C.blue],[ST.NONE,"Pending",C.bg2]].map(([_,nm,clr])=>(<div key={nm} style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:14,height:14,borderRadius:3,background:clr}}/><span style={{color:C.text2,fontSize:12}}>{nm}</span></div>))}
      <button onClick={()=>{if(confirm("Reset ALL?"))setMasterData(initMasterData());}} style={{marginLeft:"auto",background:"#2a2a3e",color:C.text2,border:"none",borderRadius:4,padding:"5px 12px",fontSize:12,cursor:"pointer"}}>🗑 Reset</button>
    </div>
    {CATEGORIES.map(cat=>{const cs=masterStats[cat.id];return(<div key={cat.id} style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 14px",marginBottom:6}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
        <span style={{color:C.text,fontWeight:700,fontSize:13}}>{cat.name}</span><span style={{color:C.text3,fontSize:11}}>{cat.type}</span>
        {cat.note&&<span style={{color:C.yellow,fontSize:11,fontStyle:"italic"}}>{cat.note}</span>}
        <span style={{marginLeft:"auto",color:pctColor(cs.pct),fontWeight:800,fontSize:14}}>{cs.pct.toFixed(1)}%</span>
        <Btn small bg={C.blue} onClick={()=>{setMasterCat(cat.id);setTab("master_detail");}}>Edit →</Btn>
      </div>
      <div style={{display:"flex",gap:3}}>{Array.from({length:12}).map((_,mi)=>{const ms=cs.monthly[mi];const clr=ms.pct>=100?C.green:ms.pct>=90?C.yellow:ms.pct>=75?C.orange:ms.app>0?C.red:C.bg2;
        return(<div key={mi} style={{textAlign:"center"}}><div style={{color:C.text3,fontSize:9}}>{MONTHS[mi]}</div><div style={{width:34,height:16,borderRadius:3,background:clr,border:`1px solid ${C.border}`}}/></div>);})}</div>
    </div>);})}
  </div>);};

  const renderMasterTable=()=>{
    const cols=[{key:"name",label:"Category"},{key:"type",label:"Type"},...MONTHS.map(m=>({key:m,label:m,align:"center"})),{key:"ytd",label:"YTD",align:"center"}];
    const rows=CATEGORIES.map(cat=>{const cs=masterStats[cat.id];const r={name:cat.name,type:cat.type,ytd:cs.pct.toFixed(1)+"%"};
      MONTHS.forEach((m,mi)=>{const ms=cs.monthly[mi];r[m]=ms.app>0?ms.pct.toFixed(0)+"%":"—";});return r;});
    const ov=masterStats._overall;const ovR={name:"OVERALL",type:"",ytd:ov.pct.toFixed(1)+"%"};
    MONTHS.forEach((m,mi)=>{let md=0,ma=0;CATEGORIES.forEach(cat=>{const ms=masterStats[cat.id].monthly[mi];md+=ms.done;ma+=ms.app;});ovR[m]=ma>0?(md/ma*100).toFixed(0)+"%":"—";});rows.push(ovR);
    return <Table columns={cols} rows={rows}/>;};

  const renderMasterDetail=()=>{
    if(!masterCat)return(<div><div style={{color:C.text2,fontSize:13,marginBottom:10}}>Select a category to edit:</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>{CATEGORIES.map(cat=>{const cs=masterStats[cat.id];return(
        <div key={cat.id} onClick={()=>setMasterCat(cat.id)} style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:8,padding:"14px 16px",cursor:"pointer"}}>
          <div style={{color:C.text,fontWeight:700,fontSize:13}}>{cat.name}</div><div style={{color:pctColor(cs.pct),fontWeight:700,fontSize:12,marginTop:4}}>{cs.pct.toFixed(1)}% · {cat.type}</div>
          <div style={{background:C.bg,borderRadius:4,height:8,marginTop:6,overflow:"hidden"}}><div style={{background:pctColor(cs.pct),height:"100%",width:`${Math.max(cs.pct,1)}%`}}/></div>
        </div>);})}</div></div>);
    const cat=CATEGORIES.find(c=>c.id===masterCat);if(!cat)return null;const cs=masterStats[cat.id];const mi=masterMonth;
    return(<div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
        <Btn small bg="#2a2a3e" onClick={()=>setMasterCat(null)}>← Back</Btn><span style={{color:C.text,fontWeight:800,fontSize:16}}>{cat.name}</span>
        <span style={{color:pctColor(cs.pct),fontWeight:800,fontSize:16}}>{cs.pct.toFixed(1)}%</span>{cat.note&&<span style={{color:C.yellow,fontSize:12,fontStyle:"italic"}}>{cat.note}</span>}</div>
      <div style={{display:"flex",gap:4,marginBottom:10,flexWrap:"wrap"}}>{Array.from({length:12}).map((_,m)=>{const ms=cs.monthly[m];return(
        <button key={m} onClick={()=>setMasterMonth(m)} style={{background:m===mi?"#1e2a4a":C.bg3,color:m===mi?C.white:C.text2,border:m===mi?`2px solid ${C.blue}`:`1px solid ${C.border}`,borderRadius:4,padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer",textAlign:"center",lineHeight:1.4}}>{MONTHS[m]}<br/>{ms.app?ms.pct.toFixed(0)+"%":"—"}</button>);})}</div>
      <div style={{display:"flex",gap:6,marginBottom:10}}><Btn small bg={C.green} onClick={()=>bulkSet(cat.id,mi,ST.DONE,cat.type)}>✓ All Done</Btn><Btn small bg={C.red} onClick={()=>bulkSet(cat.id,mi,ST.NOT_DONE,cat.type)}>✗ All Not Done</Btn><Btn small bg="#2a2a3e" onClick={()=>bulkSet(cat.id,mi,ST.NONE,cat.type)}>Clear</Btn></div>
      <div style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:8,padding:14,marginBottom:12}}>
        {cat.type==="daily"?<div style={{display:"flex",flexWrap:"wrap",gap:2}}>{Array.from({length:daysInMonth(mi)}).map((_,di)=>{const d=di+1;const val=+(masterData[cat.id]?.[mi]?.[d]??0);const we=isWeekend(mi,d);
          return(<div key={d} style={{textAlign:"center",width:32}}><div style={{color:we?"#555":C.text3,fontSize:9}}>{getDowName(mi,d)}</div><div style={{color:we?"#555":C.text3,fontSize:9}}>{d}</div>
            <button onClick={()=>toggleMC(cat.id,mi,d)} style={{width:28,height:28,background:ST_COLORS[val],color:val===ST.HOLIDAY?"#000":C.white,border:"none",borderRadius:4,fontWeight:700,fontSize:12,cursor:"pointer"}}>{ST_LABELS[val]}</button></div>);})}</div>
        :<div style={{display:"flex",gap:10}}>{[1,2,3,4,5].map(w=>{const val=+(masterData[cat.id]?.[mi]?.[w]??0);return(<div key={w} style={{textAlign:"center"}}><div style={{color:C.text2,fontSize:12,marginBottom:4}}>Week {w}</div>
          <button onClick={()=>toggleMC(cat.id,mi,w)} style={{width:56,height:44,background:ST_COLORS[val],color:val===ST.HOLIDAY?"#000":C.white,border:"none",borderRadius:6,fontWeight:700,fontSize:16,cursor:"pointer"}}>{ST_LABELS[val]}</button></div>);})}</div>}
      </div>
      <div style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:8,padding:14}}>
        <div style={{color:C.text2,fontWeight:700,fontSize:13,marginBottom:8}}>Full Year — {cat.name}</div>
        {Array.from({length:12}).map((_,ymi)=>{const ms=cs.monthly[ymi];const maxK=cat.type==="daily"?daysInMonth(ymi):5;const sz=cat.type==="daily"?14:26;
          return(<div key={ymi} style={{display:"flex",alignItems:"center",marginBottom:2}}>
            <span style={{color:C.text3,fontSize:11,width:32,textAlign:"right",marginRight:6}}>{MONTHS[ymi]}</span>
            {Array.from({length:maxK}).map((_,ki)=>{const val=+(masterData[cat.id]?.[ymi]?.[ki+1]??0);return <div key={ki} style={{width:sz,height:sz,background:ST_COLORS[val],border:`1px solid ${C.bg3}`,borderRadius:2}}/>;
            })}<span style={{color:ms.app?pctColor(ms.pct):C.text3,fontSize:11,fontWeight:700,marginLeft:6}}>{ms.app?ms.pct.toFixed(0)+"%":"—"}</span></div>);})}
      </div>
    </div>);};

  // ═══════════════════════════════════════════════════════
  // CNZ MAPPER VIEW
  // ═══════════════════════════════════════════════════════
  const renderCnzMapper=()=>{
    const srcOpts=["-- Not Mapped --",...cnzSrcCols];
    const confColor=c=>c>=0.7?C.green:c>=0.5?C.yellow:C.red;
    const confLabel=c=>c>=0.7?"High":c>=0.5?"Medium":"Low";
    const samples=(col)=>{if(!cnzSrcData||!col)return"";const vals=cnzSrcData.slice(0,3).map(r=>r[col]).filter(v=>v!=null&&v!=="");return vals.join(", ").slice(0,80);};
    const previewData=cnzPreview?cnzBuildOutput().slice(0,20):[];
    const colLetters=Array.from({length:CNZ_TOTAL_COLS}).map((_,i)=>String.fromCharCode(65+i));

    return(<div>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
        <span style={{fontSize:28}}>🔄</span><div><div style={{color:C.text,fontSize:20,fontWeight:800}}>CNZ Import Mapper</div>
        <div style={{color:C.text2,fontSize:12}}>Upload any client file → auto-map to CNZ Import Template format</div></div>
      </div>

      {/* File upload */}
      <div style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:8,padding:"14px 18px",marginBottom:12}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <Btn bg="#e94560" onClick={()=>cnzFileRef.current?.click()}>📁 Browse File...</Btn>
          <input ref={cnzFileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleCnzFile} style={{display:"none"}}/>
          <span style={{color:cnzFileName?C.text:C.text3,fontSize:13}}>{cnzFileName||"No file selected"}</span>
          {cnzSrcData&&<span style={{color:C.text2,fontSize:12,marginLeft:"auto"}}>{cnzSrcData.length} rows · {cnzSrcCols.length} columns · {Object.keys(cnzMappings).length} auto-mapped</span>}
        </div>
      </div>

      {cnzSrcData&&<>
        {/* Container ID */}
        <div style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 18px",marginBottom:6}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
            <div><div style={{color:C.text,fontSize:13,fontWeight:700}}>Container / Reference ID <span style={{color:C.text3,fontWeight:400}}>(Col A)</span></div>
              <div style={{color:C.text3,fontSize:11}}>Auto-extracted from filename. Edit or select a source column.</div></div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <input value={cnzContainer} onChange={e=>setCnzContainer(e.target.value)} placeholder="Container ID..."
                style={{background:C.bg2,color:C.text,border:`1px solid ${C.border}`,borderRadius:4,padding:"6px 10px",fontSize:13,fontFamily:"Consolas,monospace",width:200}}/>
              <Select value={cnzContainerCol||"-- Not Mapped --"} onChange={v=>setCnzContainerCol(v==="-- Not Mapped --"?"":v)} options={srcOpts} width={220}/>
            </div>
          </div>
        </div>

        {/* Dynamic field mappings */}
        {Object.entries(CNZ_FIELDS).filter(([k,v])=>!v.fromFilename).map(([fn,fd])=>{
          const m=cnzMappings[fn];const colLetter=String.fromCharCode(65+fd.col);
          return(<div key={fn} style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:8,padding:"12px 18px",marginBottom:6}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
              <div>
                <div style={{color:C.text,fontSize:13,fontWeight:700}}>{fd.label} <span style={{color:C.text3,fontWeight:400}}>(Col {colLetter})</span></div>
                <div style={{color:C.text3,fontSize:11}}>{fd.desc}</div>
                {m&&<div style={{fontSize:11,marginTop:3}}>
                  <span style={{color:confColor(m.conf),fontWeight:700}}>✦ {confLabel(m.conf)} ({(m.conf*100).toFixed(0)}%)</span>
                  <span style={{color:C.text3,marginLeft:8}}>Preview: {samples(m.col)}</span>
                </div>}
              </div>
              <Select value={m?.col||"-- Not Mapped --"} onChange={v=>{
                setCnzMappings(prev=>{const n={...prev};if(v==="-- Not Mapped --")delete n[fn];else n[fn]={col:v,conf:1};return n;});
              }} options={srcOpts} width={260}/>
            </div>
          </div>);
        })}

        {/* Static fields */}
        <div style={{color:C.text2,fontSize:12,fontWeight:700,marginTop:12,marginBottom:6}}>Static Fields (auto-filled)</div>
        {CNZ_STATIC.map((s,i)=>(<div key={i} style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 18px",marginBottom:4}}>
          <span style={{color:C.text3,fontSize:12}}>Col {String.fromCharCode(65+s.col)}: {s.label} → <span style={{color:C.text,fontFamily:"Consolas,monospace"}}>"{s.value}"</span></span>
        </div>))}

        {/* Action buttons */}
        <div style={{display:"flex",gap:8,marginTop:14}}>
          <Btn bg={C.purple} onClick={()=>setCnzPreview(!cnzPreview)}>{cnzPreview?"Hide Preview":"👁 Preview Output"}</Btn>
          <Btn bg={C.green} onClick={cnzExport}>📊 Export CNZ Template</Btn>
        </div>

        {/* Preview table */}
        {cnzPreview&&previewData.length>0&&<div style={{marginTop:12}}>
          <div style={{color:C.text2,fontSize:12,marginBottom:6}}>Showing first 20 of {cnzSrcData.length} rows</div>
          <div style={{overflow:"auto",maxHeight:400,background:C.bg3,border:`1px solid ${C.border}`,borderRadius:8}}>
            <table style={{borderCollapse:"collapse",fontSize:11,whiteSpace:"nowrap"}}>
              <thead><tr>{colLetters.map(l=><th key={l} style={{background:C.bg2,color:C.text2,padding:"8px 12px",borderBottom:`1px solid ${C.border}`,fontSize:11,fontWeight:700,position:"sticky",top:0}}>{l}</th>)}</tr></thead>
              <tbody>{previewData.map((row,ri)=>(<tr key={ri} style={{background:ri%2?C.rowAlt:C.bg3}}>
                {row.map((cell,ci)=><td key={ci} style={{padding:"6px 12px",color:C.text,borderBottom:`1px solid ${C.border}22`}}>{cell||""}</td>)}
              </tr>))}</tbody>
            </table>
          </div>
        </div>}
      </>}

      {!cnzSrcData&&<div style={{textAlign:"center",padding:60,color:C.text3}}>
        <div style={{fontSize:40,marginBottom:12}}>📄</div>
        <div style={{fontSize:14}}>Upload an Excel or CSV file to begin mapping</div>
        <div style={{fontSize:12,marginTop:4}}>Supports .xlsx, .xls, and .csv formats</div>
      </div>}
    </div>);
  };

  // ═══════════════════════════════════════════════════════
  // CONTENT ROUTER
  // ═══════════════════════════════════════════════════════
  const renderContent=()=>{
    if(!orders.length&&isKpi&&tab!=="dashboard")return renderWelcome();
    switch(tab){
      case"dashboard":return orders.length?renderDashboard():renderWelcome();
      case"kr2detail":return renderKr2Detail();case"team":return renderTeam();case"picktime":return renderTimes();
      case"clients":return renderClients();case"daily":return renderDaily();case"velocity":return renderVelocity();
      case"master_overview":return renderMasterOverview();case"master_table":return renderMasterTable();case"master_detail":return renderMasterDetail();
      case"cnz_mapper":return renderCnzMapper();default:return renderWelcome();}};

  return(<div style={{background:C.bg,minHeight:"100vh",color:C.text,fontFamily:"'Segoe UI',system-ui,sans-serif"}}>
    <input ref={fileRef} type="file" accept=".csv" onChange={handleCSV} style={{display:"none"}}/>
    {/* Header */}
    <div style={{background:C.bg2,padding:"12px 20px",display:"flex",alignItems:"center",gap:10}}>
      <span style={{fontSize:20}}>📦</span><span style={{color:C.blue,fontSize:17,fontWeight:800}}>3PL KR2 Complete — {YEAR}</span>
      {fileName&&<span style={{color:C.text3,fontSize:12,marginLeft:8}}>{orders.length} orders · KR2: {kr2pct.toFixed(1)}% · {fileName}</span>}
      <div style={{marginLeft:"auto",display:"flex",gap:6}}><Btn small bg={C.purple} onClick={()=>fileRef.current?.click()}>📁 Import CSV</Btn></div>
    </div>
    {/* Nav */}
    <div style={{background:C.dark,padding:"6px 12px",display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>
      {kpiTabs.map(t=>(<button key={t.id} onClick={()=>setTab(t.id)} style={{background:tab===t.id?C.blue:C.dark,color:tab===t.id?C.white:C.text2,border:"none",borderRadius:5,padding:"7px 14px",fontWeight:700,fontSize:12,cursor:"pointer"}}>{t.icon} {t.label}</button>))}
      <span style={{color:"#333",fontSize:16,margin:"0 8px"}}>│</span>
      {masterTabs.map(t=>(<button key={t.id} onClick={()=>setTab(t.id)} style={{background:tab===t.id?C.blue:C.dark,color:tab===t.id?C.white:C.text2,border:"none",borderRadius:5,padding:"7px 14px",fontWeight:700,fontSize:12,cursor:"pointer"}}>{t.icon} {t.label}</button>))}
      <span style={{color:"#333",fontSize:16,margin:"0 8px"}}>│</span>
      {toolTabs.map(t=>(<button key={t.id} onClick={()=>setTab(t.id)} style={{background:tab===t.id?C.orange:C.dark,color:tab===t.id?C.white:C.text2,border:"none",borderRadius:5,padding:"7px 14px",fontWeight:700,fontSize:12,cursor:"pointer"}}>{t.icon} {t.label}</button>))}
    </div>
    {/* Filters */}
    {showFilters&&<div style={{background:C.bg,padding:"8px 20px",display:"flex",justifyContent:"flex-end",alignItems:"center",gap:10}}>
      {[["Date",dateF,setDateF,["all","today","week","month"]],["Picker",pickerF,setPickerF,["all",...pickers]],["Client",clientF,setClientF,["all",...clientsList]]].map(([l,v,s,o])=>(
        <div key={l} style={{display:"flex",alignItems:"center",gap:4}}><span style={{color:C.text2,fontSize:12}}>{l}:</span><Select value={v} onChange={s} options={o}/></div>))}
    </div>}
    {/* Content */}
    <div style={{padding:16,maxHeight:"calc(100vh - 130px)",overflow:"auto"}}>{renderContent()}</div>
  </div>);
}