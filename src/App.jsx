import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import * as Papa from "papaparse";
import * as XLSX from "xlsx";
import { ChevronRight, ChevronDown, BarChart3, Target, Users, Clock, Package, Calendar, Flame, ClipboardList, Table2, Edit3, RefreshCw, Home, Menu, X, Save, Trash2, Upload, Download, Eye, EyeOff, Settings } from "lucide-react";

const YEAR = 2026;
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const C = { bg:"#0f0f1a", bg2:"#161625", bg3:"#1c1c30", bg4:"#222238", border:"#2a2a3e", border2:"#353550", text:"#e8e8f0", text2:"#8888aa", text3:"#6b6b8a", blue:"#3b82f6", purple:"#8b5cf6", green:"#10b981", yellow:"#f59e0b", pink:"#ec4899", red:"#ef4444", white:"#fff", orange:"#f97316", dark:"#0a0a14", rowAlt:"#1a1a30", sidebar:"#111120", sideHover:"#1a1a35", sideActive:"#1e2a4a" };
const pctColor = p => p >= 100 ? C.green : p >= 95 ? C.yellow : p >= 90 ? C.orange : C.red;

// ═══════════════════════════════════════════════════════
// KR2 DATA
// ═══════════════════════════════════════════════════════
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
function initMasterData(){const data={};CATEGORIES.forEach(cat=>{data[cat.id]={};for(let mi=0;mi<12;mi++){data[cat.id][mi]={};if(cat.type==="daily"){for(let d=1;d<=daysInMonth(mi);d++)data[cat.id][mi][d]=isWeekend(mi,d)?ST.NOT_USED:ST.NONE;}else{for(let w=1;w<=5;w++)data[cat.id][mi][w]=ST.NONE;}}});return data;}

// ═══════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════
function findCol(h,a){const l=h.map(x=>x.toLowerCase().replace(/[\s_]/g,""));for(const x of a){const la=x.toLowerCase().replace(/[\s_]/g,"");const i=l.indexOf(la);if(i>=0)return h[i];}for(const x of a){const la=x.toLowerCase().replace(/[\s_]/g,"");for(let i=0;i<l.length;i++)if(l[i].includes(la))return h[i];}return null;}
function parseDate(v){if(!v)return null;const d=new Date(String(v).trim());return isNaN(d.getTime())?null:d;}
function countSkus(v){if(!v)return 1;const s=String(v).trim();if(!s)return 1;let p=s.split(/[;|\n]/).map(x=>x.trim()).filter(Boolean);if(p.length>1)return p.length;p=s.split(",").map(x=>x.trim()).filter(Boolean);if(p.length>1&&p.some(x=>/\d/.test(x)&&/[a-zA-Z]/.test(x)))return p.length;return 1;}
function extractSkus(v){if(!v)return[];const s=String(v).trim();let p=s.split(/[;|\n]/).map(x=>x.trim()).filter(Boolean);if(p.length<=1)p=s.split(",").map(x=>x.trim()).filter(Boolean);const r=p.map(x=>x.replace(/\s*[\(x×]\s*\d+\s*\)?$/,"").replace(/\s*-\s*\d+$/,"").trim()).filter(Boolean);return r.length?r:[s];}
function fmtHours(m){if(m==null)return"—";return(m/60).toFixed(1)+"h";}
function isClosed(s){return s&&s.toLowerCase().trim()==="closed";}

function calcStats(data){
  const t=data.length,cl=data.filter(o=>o.isClosed).length,mi=data.filter(o=>o.isMissed).length,picks=data.reduce((a,o)=>a+o.picks,0);
  const dates=[...new Set(data.filter(o=>o.date).map(o=>o.date))].sort(),days=dates.length||1;
  const times=data.filter(o=>o.kr2TimeMins!=null).map(o=>o.kr2TimeMins),avgTime=times.length?times.reduce((a,b)=>a+b,0)/times.length:null;
  const sT=[...times].sort((a,b)=>a-b),medTime=sT.length?sT[Math.floor(sT.length/2)]:null;
  const pm={};data.forEach(o=>{(pm[o.picker]??=[]).push(o);});
  const pickers=Object.entries(pm).sort((a,b)=>b[1].length-a[1].length).map(([name,rows])=>{const pc=rows.filter(o=>o.isClosed).length,pt=rows.filter(o=>o.kr2TimeMins!=null).map(o=>o.kr2TimeMins),pts=[...pt].sort((a,b)=>a-b);
    return{name,orders:rows.length,picks:rows.reduce((a,o)=>a+o.picks,0),closed:pc,missed:rows.length-pc,kr2:rows.length?(pc/rows.length*100):0,avgTime:pt.length?pt.reduce((a,b)=>a+b,0)/pt.length:null,medianTime:pts.length?pts[Math.floor(pts.length/2)]:null,fastest:pt.length?Math.min(...pt):null,slowest:pt.length?Math.max(...pt):null};});
  const cm={};data.forEach(o=>{(cm[o.client]??=[]).push(o);});
  const clients=Object.entries(cm).map(([name,r])=>({name,orders:r.length,picks:r.reduce((a,o)=>a+o.picks,0),closed:r.filter(o=>o.isClosed).length,missed:r.filter(o=>o.isMissed).length,kr2:r.length?(r.filter(o=>o.isClosed).length/r.length*100):0})).sort((a,b)=>b.orders-a.orders);
  const dm={};data.forEach(o=>{if(o.date)(dm[o.date]??=[]).push(o);});
  const daily=dates.map(d=>({date:d,orders:dm[d].length,picks:dm[d].reduce((a,o)=>a+o.picks,0),closed:dm[d].filter(o=>o.isClosed).length,missed:dm[d].length-dm[d].filter(o=>o.isClosed).length,kr2:dm[d].length?(dm[d].filter(o=>o.isClosed).length/dm[d].length*100):0}));
  const sk={};data.forEach(o=>o.skus.forEach(s=>{sk[s]=(sk[s]||0)+1;}));
  const skus=Object.entries(sk).map(([sku,count])=>({sku,count})).sort((a,b)=>b.count-a.count).slice(0,30);
  const stm={};data.forEach(o=>{if(o.status)stm[o.status]=(stm[o.status]||0)+1;});
  const statuses=Object.entries(stm).map(([status,count])=>({status,count})).sort((a,b)=>b.count-a.count);
  return{total:t,closed:cl,missed:mi,kr2_pct:t?(cl/t*100):0,picks,days,avgOrdersDay:Math.round(t/days*10)/10,kr2_avg_time:avgTime,kr2_median_time:medTime,pickers,clients,daily,skus,missed_orders:data.filter(o=>o.isMissed),statuses};
}

// ═══════════════════════════════════════════════════════
// CNZ MAPPER
// ═══════════════════════════════════════════════════════
const CNZ_FIELDS={container_id:{col:0,label:"Container / Reference ID",desc:"Container number or shipment reference",kw:["container","shipment","consignment","booking","reference","ref","bill of lading","bol","bl","delivery","po number","purchase order","asn","receipt","inbound","tracking"],fromFilename:true},
  material:{col:4,label:"Material / SKU Code",desc:"Product code, material number, or SKU",kw:["material","sku","product","item code","article","part number","part no","upc","ean","barcode","product code","item number","item no","stock code","catalog","gtin"]},
  quantity:{col:5,label:"Quantity (EA)",desc:"Total quantity in eaches",kw:["actual delivery qty","quantity","qty","units","total qty","ship qty","shipped","received","ea qty","each","pieces","pcs","count","delivery qty","order qty","actual qty"]},
  batch:{col:6,label:"Batch / Lot Number",desc:"Batch, lot, or vintage code",kw:["batch","lot","lot number","lot no","vintage","batch number","batch no","lot code","production batch","expiry","best before","bbe"]}};
const CNZ_STATIC=[{col:9,label:"Location",value:"DOCK"},{col:18,label:"System Set",value:"SYSTEMSET"},{col:20,label:"Pallet Type",value:"CHEP PALLET"},{col:25,label:"Create Multiple MUs",value:"CreateMultipleMUs:TRUE"}];
const CNZ_TOTAL=26;
function cnzNorm(t){return String(t).toLowerCase().replace(/[^a-z0-9 ]/g,"").trim();}
function cnzScore(src,kws){const nc=cnzNorm(src);let best=0;for(const kw of kws){const nk=cnzNorm(kw);if(nc===nk)return 1;if(nk.includes(nc)||nc.includes(nk))best=Math.max(best,0.85);const cw=new Set(nc.split(/\s+/)),ks=new Set(nk.split(/\s+/));let ov=0;cw.forEach(w=>{if(ks.has(w))ov++;});if(cw.size&&ks.size)best=Math.max(best,ov/Math.max(cw.size,ks.size)*0.9);}return best;}
function cnzAutoMap(cols){const sc=[];for(const[fn,fd]of Object.entries(CNZ_FIELDS)){if(fd.fromFilename)continue;for(const c of cols)sc.push({s:cnzScore(c,fd.kw),fn,c});}sc.sort((a,b)=>b.s-a.s);const m={},u=new Set();for(const{s,fn,c}of sc){if(m[fn]||u.has(c))continue;if(s>=0.3){m[fn]={col:c,conf:s};u.add(c);}}return m;}
function cnzExtractContainer(fn){const n=fn.replace(/\.[^.]+$/,"").toUpperCase();for(const p of[/[A-Z]{4}\d{7}/,/[A-Z]{3}U\d{7}/,/[A-Z]{2,4}\d{5,}/]){const m=n.match(p);if(m)return m[0];}return fn.replace(/\.[^.]+$/,"");}

// ═══════════════════════════════════════════════════════
// UI PRIMITIVES
// ═══════════════════════════════════════════════════════
const Card=({title,value,sub,color=C.blue,icon})=>(<div style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:10,padding:"18px 22px",flex:1,minWidth:140}}>
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{color:C.text2,fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:1.2}}>{title}</span>{icon&&<span style={{fontSize:16}}>{icon}</span>}</div>
  <div style={{color,fontSize:30,fontWeight:800,marginTop:6,lineHeight:1}}>{value}</div>{sub&&<div style={{color:C.text3,fontSize:11,marginTop:4}}>{sub}</div>}</div>);

const Gauge=({pct,closed,total})=>{const color=pctColor(pct);return(<div style={{background:C.bg3,border:`2px solid ${color}`,borderRadius:10,padding:"18px 22px",flex:1,minWidth:160}}>
  <div style={{color,fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:1.2}}>KR2 COMPLETION</div>
  <div style={{color,fontSize:38,fontWeight:800,marginTop:4,lineHeight:1}}>{pct.toFixed(1)}%</div>
  <div style={{background:C.bg,borderRadius:6,height:10,marginTop:10,overflow:"hidden"}}><div style={{background:color,height:"100%",width:`${Math.max(pct,1)}%`,borderRadius:6,transition:"width 0.5s"}}/></div>
  <div style={{color,fontSize:11,fontWeight:700,marginTop:6}}>{pct>=100?"ALL CLOSED ✓":`${closed}/${total} closed · ${total-closed} missed`}</div></div>);};

const BarChart=({data,color=C.blue,title,max=12})=>{const items=data.slice(0,max);const mx=Math.max(...items.map(d=>d.value),1);return(
  <div style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 20px"}}>{title&&<div style={{color:C.text2,fontSize:12,fontWeight:700,marginBottom:10}}>{title}</div>}
    {items.map((d,i)=>(<div key={i} style={{display:"flex",alignItems:"center",marginBottom:4}}><span style={{color:C.text2,fontSize:11,width:150,textAlign:"right",flexShrink:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.label}</span>
      <div style={{flex:1,background:C.bg,height:20,borderRadius:4,marginLeft:8,overflow:"hidden"}}><div style={{background:d.color||color,height:"100%",width:`${Math.max(d.value/mx*100,1)}%`,borderRadius:4,transition:"width 0.3s"}}/></div>
      <span style={{color:C.text,fontSize:11,fontWeight:700,width:65,textAlign:"right",flexShrink:0}}>{typeof d.value==="number"?d.value%1?d.value.toFixed(1):d.value:d.value}{d.suffix||""}</span></div>))}
    {!items.length&&<div style={{color:C.text3,fontSize:12}}>No data</div>}</div>);};

const DataTable=({columns,rows})=>(<div style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:10,overflow:"auto",maxHeight:550}}>
  <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}><thead><tr>{columns.map((c,i)=>(
    <th key={i} style={{background:C.bg2,color:C.text2,padding:"11px 14px",textAlign:c.align||"left",fontWeight:700,fontSize:11,borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap",position:"sticky",top:0,zIndex:1}}>{c.label}</th>
  ))}</tr></thead><tbody>{rows.map((r,ri)=>(<tr key={ri} style={{background:ri%2?C.rowAlt:C.bg3}}>{columns.map((c,ci)=>(
    <td key={ci} style={{padding:"9px 14px",color:C.text,borderBottom:`1px solid ${C.border}18`,textAlign:c.align||"left",whiteSpace:"nowrap"}}>{r[c.key]??"—"}</td>
  ))}</tr>))}</tbody></table></div>);

const Btn=({children,bg=C.blue,onClick,disabled,small,icon:Icon})=>(<button onClick={onClick} disabled={disabled}
  style={{background:disabled?"#333":bg,color:C.white,border:"none",borderRadius:6,padding:small?"5px 12px":"8px 18px",fontWeight:700,fontSize:small?11:12,cursor:disabled?"default":"pointer",opacity:disabled?0.5:1,display:"inline-flex",alignItems:"center",gap:6,transition:"all 0.15s"}}>
  {Icon&&<Icon size={small?13:15}/>}{children}</button>);

const Sel=({value,onChange,options,width=200})=>(<select value={value} onChange={e=>onChange(e.target.value)}
  style={{background:C.bg3,color:C.text,border:`1px solid ${C.border}`,borderRadius:6,padding:"7px 10px",fontSize:12,width,outline:"none"}}>
  {options.map(o=><option key={o} value={o}>{o}</option>)}</select>);

const SectionHeader=({icon:Icon,title,sub})=>(<div style={{marginBottom:14}}><div style={{display:"flex",alignItems:"center",gap:8}}>
  {Icon&&<Icon size={20} color={C.blue}/>}<span style={{color:C.text,fontSize:18,fontWeight:800}}>{title}</span></div>
  {sub&&<div style={{color:C.text3,fontSize:12,marginTop:2,marginLeft:28}}>{sub}</div>}</div>);

// ═══════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════
export default function App(){
  const [orders,setOrders]=useState([]);const [tab,setTab]=useState("home");const [fileName,setFileName]=useState("");
  const [dateF,setDateF]=useState("all");const [pickerF,setPickerF]=useState("all");const [clientF,setClientF]=useState("all");
  const [sideOpen,setSideOpen]=useState(true);
  const now=new Date(),yest=new Date(now);yest.setDate(yest.getDate()-1);
  const pad=n=>String(n).padStart(2,"0");
  const [kr2Start,setKr2Start]=useState(new Date(yest.getFullYear(),yest.getMonth(),yest.getDate(),14,0,0));
  const [kr2End,setKr2End]=useState(new Date(now.getFullYear(),now.getMonth(),now.getDate(),17,0,0));
  const [kr2StartStr,setKr2StartStr]=useState(`${yest.getFullYear()}-${pad(yest.getMonth()+1)}-${pad(yest.getDate())} 14:00`);
  const [kr2EndStr,setKr2EndStr]=useState(`${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} 17:00`);
  const [masterData,setMasterData]=useState(()=>initMasterData());const [masterMonth,setMasterMonth]=useState(now.getMonth());const [masterCat,setMasterCat]=useState(null);
  const fileRef=useRef();

  // CNZ
  const [cnzSrc,setCnzSrc]=useState(null);const [cnzCols,setCnzCols]=useState([]);const [cnzFile,setCnzFile]=useState("");
  const [cnzMap,setCnzMap]=useState({});const [cnzContainer,setCnzContainer]=useState("");const [cnzContainerCol,setCnzContainerCol]=useState("");
  const [cnzPreview,setCnzPreview]=useState(false);
  const [cnzProfiles,setCnzProfiles]=useState(()=>{try{return JSON.parse(window._cnzProfiles||"{}");} catch(e){return{};}});
  const [cnzProfileName,setCnzProfileName]=useState("");
  const cnzRef=useRef();

  const saveProfile=(name)=>{if(!name.trim())return;const p={...cnzProfiles,[name.trim()]:{...cnzMap,_containerCol:cnzContainerCol}};setCnzProfiles(p);window._cnzProfiles=JSON.stringify(p);};
  const loadProfile=(name)=>{const p=cnzProfiles[name];if(!p)return;const m={...p};const cc=m._containerCol||"";delete m._containerCol;setCnzMap(m);setCnzContainerCol(cc);};
  const deleteProfile=(name)=>{const p={...cnzProfiles};delete p[name];setCnzProfiles(p);window._cnzProfiles=JSON.stringify(p);};

  // CSV
  const handleCSV=useCallback((e)=>{const file=e.target.files[0];if(!file)return;setFileName(file.name);
    Papa.parse(file,{header:true,skipEmptyLines:true,dynamicTyping:false,complete:(r)=>{const h=r.meta.fields||[];
      const cm={picker:findCol(h,["PickJob Assignee","PickJobAssignee","Picker","Picked By"]),orderId:findCol(h,["ReferenceNum","Reference Num","Reference Number","Order Number"]),
        skuQty:findCol(h,["SkuAndQty","Sku And Qty","Items"]),printDate:findCol(h,["PickTicketPrintDate","Pick Ticket Print Date"]),doneDate:findCol(h,["PickDoneDate","Pick Done Date","ClosedDate"]),
        client:findCol(h,["Customer","CustomerName","Client","Account","Channel"]),status:findCol(h,["Status","Order Status","OrderStatus"]),shipDate:findCol(h,["ShipDate","Ship Date"]),creationDate:findCol(h,["CreationDate","Creation Date","OrderDate"])};
      const parsed=r.data.map(row=>{const o={};o.picker=(cm.picker?String(row[cm.picker]||"").trim():"")||"Unassigned";o.orderId=cm.orderId?String(row[cm.orderId]||"").trim():"";
        const sq=cm.skuQty?String(row[cm.skuQty]||"").trim():"";o.picks=countSkus(sq);o.skus=extractSkus(sq);o.client=(cm.client?String(row[cm.client]||"").trim():"")||"N/A";
        o.status=cm.status?String(row[cm.status]||"").trim():"";o.isClosed=isClosed(o.status);o.isMissed=!o.isClosed;
        const pd=cm.printDate?parseDate(row[cm.printDate]):null,dd=cm.doneDate?parseDate(row[cm.doneDate]):null;o.printDate=pd;o.doneDate=dd;
        if(pd&&dd){const diff=(dd-pd)/60000;o.kr2TimeMins=diff>0&&diff<2880?diff:null;}else o.kr2TimeMins=null;
        const ds=dd||pd||(cm.shipDate?parseDate(row[cm.shipDate]):null)||(cm.creationDate?parseDate(row[cm.creationDate]):null);
        o.date=ds?`${ds.getFullYear()}-${pad(ds.getMonth()+1)}-${pad(ds.getDate())}`:"";return o;}).filter(o=>o.orderId||o.date);
      setOrders(parsed);setTab("dashboard");}});e.target.value="";},[]);

  // CNZ file
  const handleCnzFile=useCallback((e)=>{const file=e.target.files[0];if(!file)return;setCnzFile(file.name);setCnzPreview(false);
    const ext=file.name.split(".").pop().toLowerCase();
    if(ext==="csv"){Papa.parse(file,{header:true,skipEmptyLines:true,complete:(r)=>{setCnzCols(r.meta.fields||[]);setCnzSrc(r.data);
      setCnzMap(cnzAutoMap(r.meta.fields||[]));setCnzContainer(cnzExtractContainer(file.name));setCnzContainerCol("");}});}
    else{const reader=new FileReader();reader.onload=(ev)=>{const wb=XLSX.read(ev.target.result,{type:"array"});const ws=wb.Sheets[wb.SheetNames[0]];
      const json=XLSX.utils.sheet_to_json(ws,{defval:""});const cols=json.length?Object.keys(json[0]):[];setCnzCols(cols);setCnzSrc(json);
      setCnzMap(cnzAutoMap(cols));setCnzContainer(cnzExtractContainer(file.name));setCnzContainerCol("");};reader.readAsArrayBuffer(file);}
    e.target.value="";},[]);

  const cnzBuild=useCallback(()=>{if(!cnzSrc)return[];return cnzSrc.map(row=>{const out=new Array(CNZ_TOTAL).fill("");
    if(cnzContainerCol&&cnzContainerCol!=="-- Not Mapped --")out[0]=row[cnzContainerCol]||"";else out[0]=cnzContainer;
    for(const[fn,fd]of Object.entries(CNZ_FIELDS)){if(fn==="container_id")continue;if(cnzMap[fn])out[fd.col]=row[cnzMap[fn].col]||"";}
    CNZ_STATIC.forEach(s=>{out[s.col]=s.value;});return out;});},[cnzSrc,cnzMap,cnzContainer,cnzContainerCol]);

  const cnzExport=useCallback(()=>{const out=cnzBuild();if(!out.length)return;const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(out),"Sheet 1");
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([]),"Sheet2");XLSX.writeFile(wb,`CNZ_Import_${cnzFile.replace(/\.[^.]+$/,"")}.xlsx`);},[cnzBuild,cnzFile]);

  // Computed
  const pickers=useMemo(()=>[...new Set(orders.map(o=>o.picker))].sort(),[orders]);
  const clientsList=useMemo(()=>[...new Set(orders.map(o=>o.client))].sort(),[orders]);
  const kr2Filtered=useMemo(()=>orders.filter(o=>o.printDate&&o.printDate>=kr2Start&&o.printDate<=kr2End),[orders,kr2Start,kr2End]);
  const filtered=useMemo(()=>{let d=[...orders];const td=new Date().toISOString().slice(0,10);
    if(dateF==="today")d=d.filter(o=>o.date===td);else if(dateF==="week"){const c=new Date();c.setDate(c.getDate()-7);d=d.filter(o=>o.date>=c.toISOString().slice(0,10));}
    else if(dateF==="month")d=d.filter(o=>o.date.startsWith(td.slice(0,7)));
    if(pickerF!=="all")d=d.filter(o=>o.picker===pickerF);if(clientF!=="all")d=d.filter(o=>o.client===clientF);return d;},[orders,dateF,pickerF,clientF]);
  const stats=useMemo(()=>calcStats(["dashboard","kr2detail"].includes(tab)?kr2Filtered:filtered),[tab,kr2Filtered,filtered]);
  const kr2pct=kr2Filtered.length?(kr2Filtered.filter(o=>o.isClosed).length/kr2Filtered.length*100):0;
  const masterStats=useMemo(()=>{const r={};let tA=0,tD=0,tN=0;CATEGORIES.forEach(cat=>{let cA=0,cD=0,cN=0;const mo={};for(let mi=0;mi<12;mi++){let a=0,d=0,n=0;Object.values(masterData[cat.id]?.[mi]||{}).forEach(v=>{v=+v;if(v===ST.DONE){d++;a++;}else if(v===ST.NOT_DONE){n++;a++;}else if(v===ST.NONE)a++;});mo[mi]={app:a,done:d,nd:n,pct:a?(d/a*100):0};cA+=a;cD+=d;cN+=n;}r[cat.id]={monthly:mo,app:cA,done:cD,nd:cN,pct:cA?(cD/cA*100):0};tA+=cA;tD+=cD;tN+=cN;});r._overall={app:tA,done:tD,nd:tN,pct:tA?(tD/tA*100):0};return r;},[masterData]);

  const applyKr2=()=>{try{const p=kr2StartStr.trim().split(/[\sT]/),dp=p[0].split("-"),tp=(p[1]||"00:00").split(":");setKr2Start(new Date(+dp[0],+dp[1]-1,+dp[2],+tp[0],+tp[1]||0));
    const p2=kr2EndStr.trim().split(/[\sT]/),d2=p2[0].split("-"),t2=(p2[1]||"00:00").split(":");setKr2End(new Date(+d2[0],+d2[1]-1,+d2[2],+t2[0],+t2[1]||0));}catch{alert("Format: YYYY-MM-DD HH:MM");}};
  const toggleMC=(cid,mi,k)=>{setMasterData(p=>{const n=JSON.parse(JSON.stringify(p));n[cid][mi][k]=(+(n[cid]?.[mi]?.[k]??0)+1)%5;return n;});};
  const bulkSet=(cid,mi,st,ct)=>{setMasterData(p=>{const n=JSON.parse(JSON.stringify(p));if(ct==="daily"){for(let d=1;d<=daysInMonth(mi);d++)if(!isWeekend(mi,d))n[cid][mi][d]=st;}else{for(let w=1;w<=5;w++)n[cid][mi][w]=st;}return n;});};

  // ── SIDEBAR NAV ──
  const navSections=[
    {title:"Home",items:[{id:"home",label:"Overview",icon:Home}]},
    {title:"KR2 Dashboard",items:[{id:"dashboard",label:"Dashboard",icon:BarChart3},{id:"kr2detail",label:"KR2 Detail",icon:Target},{id:"team",label:"Team",icon:Users},{id:"picktime",label:"Times",icon:Clock},{id:"clients",label:"Clients",icon:Package},{id:"daily",label:"Daily",icon:Calendar},{id:"velocity",label:"Fast Movers",icon:Flame}]},
    {title:"KR2 Master",items:[{id:"master_overview",label:"Compliance",icon:ClipboardList},{id:"master_table",label:"Score Table",icon:Table2},{id:"master_detail",label:"Edit Grid",icon:Edit3}]},
    {title:"Tools",items:[{id:"cnz_mapper",label:"CNZ Mapper",icon:RefreshCw}]},
  ];
  const isKpi=!tab.startsWith("master_")&&tab!=="cnz_mapper"&&tab!=="home";
  const showFilters=isKpi&&!["dashboard","kr2detail"].includes(tab)&&orders.length>0;

  const KR2Window=()=>(<div style={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 18px",marginBottom:12,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
    <span style={{color:C.yellow,fontWeight:700,fontSize:13}}>⏰ KR2 Window</span>
    <span style={{color:C.text2,fontSize:11}}>From</span>
    <input value={kr2StartStr} onChange={e=>setKr2StartStr(e.target.value)} style={{background:C.bg3,color:C.text,border:`1px solid ${C.border}`,borderRadius:6,padding:"6px 10px",fontSize:12,width:155}}/>
    <span style={{color:C.text2,fontSize:11}}>To</span>
    <input value={kr2EndStr} onChange={e=>setKr2EndStr(e.target.value)} style={{background:C.bg3,color:C.text,border:`1px solid ${C.border}`,borderRadius:6,padding:"6px 10px",fontSize:12,width:155}}/>
    <Btn small onClick={applyKr2}>Apply</Btn>
    <div style={{marginLeft:"auto",background:C.bg,borderRadius:6,padding:"6px 14px"}}><span style={{color:pctColor(kr2pct),fontWeight:700,fontSize:12}}>Orders: {kr2Filtered.length} · KR2: {kr2pct.toFixed(1)}%</span></div>
  </div>);

  // ═══════════════════════════════════════════════════════
  // VIEWS
  // ═══════════════════════════════════════════════════════
  const renderHome=()=>{const ov=masterStats._overall;const hasOrders=orders.length>0;
    const topPicker=stats.pickers.length?stats.pickers[0]:null;const topClient=stats.clients.length?stats.clients[0]:null;
    return(<div style={{display:"flex",flexDirection:"column",minHeight:"calc(100vh - 62px)"}}>
      <SectionHeader icon={Home} title={`3PL Operations Hub — ${YEAR}`} sub="Your warehouse at a glance"/>

      {/* Top row — two big cards */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
        {/* KR2 Dashboard card */}
        <div style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:12,padding:24,cursor:"pointer",transition:"border-color 0.15s"}}
          onClick={()=>hasOrders&&setTab("dashboard")} onMouseOver={e=>e.currentTarget.style.borderColor=C.blue} onMouseOut={e=>e.currentTarget.style.borderColor=C.border}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}><BarChart3 size={20} color={C.blue}/><span style={{color:C.text,fontWeight:700,fontSize:15}}>KR2 Dashboard</span>
            <ChevronRight size={16} color={C.text3} style={{marginLeft:"auto"}}/></div>
          {hasOrders?<>
            <div style={{display:"flex",alignItems:"baseline",gap:12,marginBottom:10}}>
              <div style={{color:pctColor(kr2pct),fontSize:42,fontWeight:800,lineHeight:1}}>{kr2pct.toFixed(1)}%</div>
              <div style={{color:C.text3,fontSize:12}}>KR2 Completion</div></div>
            <div style={{background:C.bg,borderRadius:6,height:10,overflow:"hidden",marginBottom:14}}><div style={{background:pctColor(kr2pct),height:"100%",width:`${Math.max(kr2pct,1)}%`,borderRadius:6}}/></div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
              <div style={{background:C.bg2,borderRadius:8,padding:"10px 12px"}}><div style={{color:C.text3,fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>Orders</div><div style={{color:C.blue,fontSize:20,fontWeight:800}}>{kr2Filtered.length}</div></div>
              <div style={{background:C.bg2,borderRadius:8,padding:"10px 12px"}}><div style={{color:C.text3,fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>Closed</div><div style={{color:C.green,fontSize:20,fontWeight:800}}>{stats.closed}</div></div>
              <div style={{background:C.bg2,borderRadius:8,padding:"10px 12px"}}><div style={{color:C.text3,fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>Missed</div><div style={{color:stats.missed?C.red:C.green,fontSize:20,fontWeight:800}}>{stats.missed}</div></div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:8}}>
              <div style={{background:C.bg2,borderRadius:8,padding:"10px 12px"}}><div style={{color:C.text3,fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>Avg KR2 Time</div><div style={{color:C.yellow,fontSize:18,fontWeight:800}}>{fmtHours(stats.kr2_avg_time)}</div></div>
              <div style={{background:C.bg2,borderRadius:8,padding:"10px 12px"}}><div style={{color:C.text3,fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>Pickers</div><div style={{color:C.purple,fontSize:18,fontWeight:800}}>{stats.pickers.length}</div></div>
            </div>
            <div style={{color:C.text3,fontSize:10,marginTop:10}}>{fileName}</div>
          </>:<div style={{padding:"20px 0"}}><div style={{color:C.text3,fontSize:14,marginBottom:14}}>No data loaded yet</div>
            <Btn bg={C.purple} onClick={(e)=>{e.stopPropagation();fileRef.current?.click();}} icon={Upload}>Import Order CSV</Btn></div>}
        </div>

        {/* Master Compliance card */}
        <div style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:12,padding:24,cursor:"pointer",transition:"border-color 0.15s"}}
          onClick={()=>setTab("master_overview")} onMouseOver={e=>e.currentTarget.style.borderColor=C.green} onMouseOut={e=>e.currentTarget.style.borderColor=C.border}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}><ClipboardList size={20} color={C.green}/><span style={{color:C.text,fontWeight:700,fontSize:15}}>KR2 Master Compliance</span>
            <ChevronRight size={16} color={C.text3} style={{marginLeft:"auto"}}/></div>
          <div style={{display:"flex",alignItems:"baseline",gap:12,marginBottom:10}}>
            <div style={{color:pctColor(ov.pct),fontSize:42,fontWeight:800,lineHeight:1}}>{ov.pct.toFixed(1)}%</div>
            <div style={{color:C.text3,fontSize:12}}>Annual Compliance</div></div>
          <div style={{background:C.bg,borderRadius:6,height:10,overflow:"hidden",marginBottom:14}}><div style={{background:pctColor(ov.pct),height:"100%",width:`${Math.max(ov.pct,1)}%`,borderRadius:6}}/></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:10}}>
            <div style={{background:C.bg2,borderRadius:8,padding:"10px 12px"}}><div style={{color:C.text3,fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>Done</div><div style={{color:C.green,fontSize:20,fontWeight:800}}>{ov.done}</div></div>
            <div style={{background:C.bg2,borderRadius:8,padding:"10px 12px"}}><div style={{color:C.text3,fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>Not Done</div><div style={{color:ov.nd?C.red:C.green,fontSize:20,fontWeight:800}}>{ov.nd}</div></div>
            <div style={{background:C.bg2,borderRadius:8,padding:"10px 12px"}}><div style={{color:C.text3,fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>Categories</div><div style={{color:C.blue,fontSize:20,fontWeight:800}}>{CATEGORIES.length}</div></div>
          </div>
          {/* Mini category status */}
          <div style={{display:"flex",flexWrap:"wrap",gap:3,marginTop:4}}>
            {CATEGORIES.slice(0,8).map(cat=>{const cs=masterStats[cat.id];return(
              <div key={cat.id} style={{background:C.bg2,borderRadius:6,padding:"4px 8px",display:"flex",alignItems:"center",gap:4}}>
                <div style={{width:8,height:8,borderRadius:2,background:pctColor(cs.pct)}}/><span style={{color:C.text3,fontSize:9}}>{cat.name.replace("Daily ","").replace("Weekly ","").slice(0,12)}</span>
              </div>);})}
            {CATEGORIES.length>8&&<div style={{background:C.bg2,borderRadius:6,padding:"4px 8px"}}><span style={{color:C.text3,fontSize:9}}>+{CATEGORIES.length-8} more</span></div>}
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,flex:1}}>
        {/* CNZ Mapper card */}
        <div style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:12,padding:24,cursor:"pointer",transition:"border-color 0.15s"}}
          onClick={()=>setTab("cnz_mapper")} onMouseOver={e=>e.currentTarget.style.borderColor=C.orange} onMouseOut={e=>e.currentTarget.style.borderColor=C.border}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}><RefreshCw size={20} color={C.orange}/><span style={{color:C.text,fontWeight:700,fontSize:15}}>CNZ Import Mapper</span>
            <ChevronRight size={16} color={C.text3} style={{marginLeft:"auto"}}/></div>
          <div style={{color:C.orange,fontSize:36,fontWeight:800,lineHeight:1}}>{Object.keys(cnzProfiles).length}</div>
          <div style={{color:C.text3,fontSize:12,marginTop:4,marginBottom:14}}>saved client profiles</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <div style={{background:C.bg2,borderRadius:8,padding:"10px 12px"}}><div style={{color:C.text3,fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>Template</div><div style={{color:C.text,fontSize:13,fontWeight:700}}>CNZ Import</div><div style={{color:C.text3,fontSize:10}}>26 columns (A–Z)</div></div>
            <div style={{background:C.bg2,borderRadius:8,padding:"10px 12px"}}><div style={{color:C.text3,fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>Auto-Map</div><div style={{color:C.text,fontSize:13,fontWeight:700}}>Smart Match</div><div style={{color:C.text3,fontSize:10}}>Keyword + fuzzy</div></div>
          </div>
          {cnzSrc&&<div style={{background:C.bg2,borderRadius:8,padding:"10px 12px",marginTop:8}}><div style={{color:C.text3,fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>Last File</div><div style={{color:C.text2,fontSize:12,marginTop:2}}>{cnzFile} ({cnzSrc.length} rows)</div></div>}
          {Object.keys(cnzProfiles).length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:10}}>
            {Object.keys(cnzProfiles).map(n=>(<div key={n} style={{background:C.bg2,borderRadius:6,padding:"3px 8px"}}><span style={{color:C.orange,fontSize:10,fontWeight:600}}>{n}</span></div>))}</div>}
        </div>

        {/* Quick Actions + Stats */}
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:12,padding:24}}>
            <div style={{color:C.text,fontWeight:700,fontSize:15,marginBottom:14}}>Quick Actions</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <Btn bg={C.purple} onClick={()=>fileRef.current?.click()} icon={Upload}>Import Order CSV</Btn>
              <Btn bg={C.green} onClick={()=>setTab("master_overview")} icon={ClipboardList}>Compliance</Btn>
              <Btn bg={C.orange} onClick={()=>setTab("cnz_mapper")} icon={RefreshCw}>CNZ Mapper</Btn>
              {hasOrders&&<Btn bg={C.blue} onClick={()=>setTab("team")} icon={Users}>View Team</Btn>}
            </div>
          </div>

          {hasOrders&&<div style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:12,padding:24,flex:1}}>
            <div style={{color:C.text,fontWeight:700,fontSize:15,marginBottom:14}}>Top Performers</div>
            {topPicker&&<div style={{background:C.bg2,borderRadius:8,padding:"12px 14px",marginBottom:8}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{color:C.text3,fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>Top Picker</div>
                <div style={{color:C.text,fontSize:16,fontWeight:800,marginTop:2}}>{topPicker.name}</div></div>
                <div style={{textAlign:"right"}}><div style={{color:pctColor(topPicker.kr2),fontSize:18,fontWeight:800}}>{topPicker.kr2.toFixed(1)}%</div><div style={{color:C.text3,fontSize:10}}>{topPicker.orders} orders</div></div></div></div>}
            {topClient&&<div style={{background:C.bg2,borderRadius:8,padding:"12px 14px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{color:C.text3,fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>Top Client</div>
                <div style={{color:C.text,fontSize:16,fontWeight:800,marginTop:2}}>{topClient.name}</div></div>
                <div style={{textAlign:"right"}}><div style={{color:C.purple,fontSize:18,fontWeight:800}}>{topClient.orders}</div><div style={{color:C.text3,fontSize:10}}>orders</div></div></div></div>}
          </div>}

          {!hasOrders&&<div style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:12,padding:24,flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
            <Upload size={32} color={C.text3} style={{opacity:0.3,marginBottom:10}}/>
            <div style={{color:C.text3,fontSize:13}}>Import a CSV to see team stats</div>
            <div style={{color:C.text3,fontSize:11,marginTop:4}}>Extensiv order exports supported</div>
          </div>}
        </div>
      </div>
    </div>);};

  const renderDashboard=()=>(<div><SectionHeader icon={BarChart3} title="KR2 Dashboard" sub="Order completion tracking"/><KR2Window/>
    <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}><Gauge pct={stats.kr2_pct} closed={stats.closed} total={stats.total}/>
      <Card title="Orders" value={stats.total.toLocaleString()} sub={`${stats.avgOrdersDay}/day · ${stats.days} days`} color={C.blue} icon="📋"/>
      <Card title="Closed" value={stats.closed.toLocaleString()} sub={`${stats.closed}/${stats.total}`} color={C.green} icon="✅"/>
      <Card title="Missed" value={stats.missed.toLocaleString()} sub={stats.missed?"not closed":"none!"} color={stats.missed?C.red:C.green} icon={stats.missed?"⚠️":"✅"}/>
      <Card title="Avg KR2 Time" value={fmtHours(stats.kr2_avg_time)} sub={`median ${fmtHours(stats.kr2_median_time)}`} color={C.yellow} icon="⏱"/>
      <Card title="Total Picks" value={stats.picks.toLocaleString()} sub={`${stats.pickers.length} pickers`} color={C.purple} icon="🎯"/></div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
      <BarChart data={stats.pickers.map(p=>({label:p.name,value:Math.round(p.kr2*10)/10,color:pctColor(p.kr2),suffix:"%"}))} color={C.green} title="🎯 KR2 % by Picker"/>
      <BarChart data={stats.pickers.filter(p=>p.avgTime).map(p=>({label:p.name,value:Math.round(p.avgTime/60*10)/10,suffix:"h"}))} color={C.yellow} title="⏱ Avg KR2 Time (hours)"/>
      <BarChart data={stats.pickers.map(p=>({label:p.name,value:p.orders}))} color={C.blue} title="📋 Orders by Picker"/>
      <BarChart data={stats.clients.slice(0,12).map(c=>({label:c.name,value:c.orders}))} color={C.purple} title="📦 Orders by Client"/>
    </div></div>);

  const renderKr2Detail=()=>(<div><SectionHeader icon={Target} title="KR2 Detail" sub="Missed orders breakdown"/><KR2Window/>
    <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}><Gauge pct={stats.kr2_pct} closed={stats.closed} total={stats.total}/>
      <Card title="Closed" value={stats.closed.toLocaleString()} color={C.green} icon="✅"/><Card title="Missed" value={stats.missed.toLocaleString()} color={stats.missed?C.red:C.green} icon="⚠️"/>
      <Card title="Avg KR2 Time" value={fmtHours(stats.kr2_avg_time)} sub={`median ${fmtHours(stats.kr2_median_time)}`} color={C.yellow} icon="⏱"/></div>
    {stats.missed_orders.length>0?<><div style={{color:C.red,fontWeight:700,fontSize:15,margin:"8px 0"}}>⚠️ {stats.missed_orders.length} Missed Orders</div>
      <DataTable columns={[{key:"orderId",label:"Order ID"},{key:"status",label:"Status"},{key:"picker",label:"Picker"},{key:"client",label:"Client"},{key:"print",label:"Print"},{key:"close",label:"Close"}]}
        rows={stats.missed_orders.map(o=>({orderId:o.orderId,status:o.status||"(blank)",picker:o.picker,client:o.client,print:o.printDate?o.printDate.toLocaleString():"—",close:o.doneDate?o.doneDate.toLocaleString():"—"}))}/></>
    :<div style={{color:C.green,fontWeight:800,fontSize:18,textAlign:"center",padding:40}}>✅ All orders Closed! KR2 = 100%</div>}</div>);

  const renderTeam=()=>(<div><SectionHeader icon={Users} title="Team Performance"/>
    <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}><Card title="Pickers" value={stats.pickers.length} color={C.blue} icon="👥"/><Card title="Orders" value={stats.total.toLocaleString()} color={C.purple} icon="📋"/><Card title="KR2" value={`${stats.kr2_pct.toFixed(1)}%`} color={pctColor(stats.kr2_pct)} icon="🎯"/><Card title="Picks" value={stats.picks.toLocaleString()} color={C.green} icon="📦"/></div>
    <DataTable columns={[{key:"name",label:"Picker"},{key:"orders",label:"Orders",align:"center"},{key:"closed",label:"Closed",align:"center"},{key:"missed",label:"Missed",align:"center"},{key:"kr2",label:"KR2 %",align:"center"},{key:"picks",label:"Picks",align:"center"},{key:"ap",label:"Picks/Order",align:"center"},{key:"time",label:"KR2 Time",align:"center"}]}
      rows={stats.pickers.map(p=>({name:p.name,orders:p.orders,closed:p.closed,missed:p.missed,kr2:p.kr2.toFixed(1)+"%",picks:p.picks,ap:p.orders?(p.picks/p.orders).toFixed(1):"—",time:fmtHours(p.avgTime)}))}/></div>);

  const renderTimes=()=>{const allT=kr2Filtered.filter(o=>o.kr2TimeMins!=null).map(o=>o.kr2TimeMins);return(<div><SectionHeader icon={Clock} title="KR2 Times"/>
    <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}><Card title="Avg" value={fmtHours(stats.kr2_avg_time)} sub="print→close" color={C.yellow} icon="⏱"/><Card title="Median" value={fmtHours(stats.kr2_median_time)} color={C.orange} icon="📊"/>
      <Card title="Range" value={`${allT.length?fmtHours(Math.min(...allT)):"—"} – ${allT.length?fmtHours(Math.max(...allT)):"—"}`} color={C.blue} icon="↔"/></div>
    <DataTable columns={[{key:"name",label:"Picker"},{key:"orders",label:"Orders",align:"center"},{key:"avg",label:"Avg",align:"center"},{key:"med",label:"Median",align:"center"},{key:"fast",label:"Fastest",align:"center"},{key:"slow",label:"Slowest",align:"center"},{key:"spread",label:"Spread",align:"center"}]}
      rows={stats.pickers.filter(p=>p.avgTime).map(p=>({name:p.name,orders:p.orders,avg:fmtHours(p.avgTime),med:fmtHours(p.medianTime),fast:fmtHours(p.fastest),slow:fmtHours(p.slowest),spread:p.slowest&&p.fastest?fmtHours(p.slowest-p.fastest):"—"}))}/></div>);};

  const renderClients=()=>(<div><SectionHeader icon={Package} title="Client Performance"/>
    <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}><Card title="Clients" value={stats.clients.length} color={C.purple} icon="📦"/><Card title="Orders" value={stats.total.toLocaleString()} color={C.blue} icon="📋"/><Card title="KR2" value={`${stats.kr2_pct.toFixed(1)}%`} color={pctColor(stats.kr2_pct)} icon="🎯"/></div>
    <DataTable columns={[{key:"name",label:"Client"},{key:"orders",label:"Orders",align:"center"},{key:"closed",label:"Closed",align:"center"},{key:"missed",label:"Missed",align:"center"},{key:"kr2",label:"KR2 %",align:"center"},{key:"picks",label:"Picks",align:"center"},{key:"ap",label:"Picks/Order",align:"center"},{key:"share",label:"% Total",align:"center"}]}
      rows={stats.clients.map(c=>({name:c.name,orders:c.orders,closed:c.closed,missed:c.missed,kr2:c.kr2.toFixed(1)+"%",picks:c.picks,ap:c.orders?(c.picks/c.orders).toFixed(1):"—",share:stats.total?(c.orders/stats.total*100).toFixed(1)+"%":"—"}))}/></div>);

  const renderDaily=()=>(<div><SectionHeader icon={Calendar} title="Daily Breakdown"/>
    <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}><Card title="Days" value={stats.days} color={C.blue} icon="📅"/><Card title="Avg/Day" value={stats.avgOrdersDay} color={C.purple} icon="📋"/><Card title="Picks/Day" value={stats.days?(stats.picks/stats.days).toFixed(1):0} color={C.green} icon="📦"/></div>
    <DataTable columns={[{key:"date",label:"Date"},{key:"orders",label:"Orders",align:"center"},{key:"closed",label:"Closed",align:"center"},{key:"missed",label:"Missed",align:"center"},{key:"kr2",label:"KR2 %",align:"center"},{key:"picks",label:"Picks",align:"center"}]}
      rows={stats.daily.map(d=>({date:d.date,orders:d.orders,closed:d.closed,missed:d.missed,kr2:d.kr2.toFixed(1)+"%",picks:d.picks}))}/></div>);

  const renderVelocity=()=>(<div><SectionHeader icon={Flame} title="Fast Movers"/>
    <BarChart data={stats.skus.slice(0,15).map(s=>({label:s.sku,value:s.count}))} color={C.pink} title="Top 15 SKUs"/>
    <div style={{marginTop:10}}><DataTable columns={[{key:"rank",label:"#",align:"center"},{key:"sku",label:"SKU"},{key:"count",label:"Orders",align:"center"},{key:"rate",label:"Rate",align:"center"},{key:"share",label:"% Picks",align:"center"}]}
      rows={stats.skus.map((s,i)=>({rank:i+1,sku:s.sku,count:s.count,rate:(s.count/stats.days).toFixed(1)+"/day",share:stats.picks?(s.count/stats.picks*100).toFixed(1)+"%":"—"}))}/></div></div>);

  // ── Master views ──
  const renderMasterOverview=()=>{const ov=masterStats._overall;return(<div><SectionHeader icon={ClipboardList} title="KR2 Master Compliance" sub={`${YEAR} annual tracking`}/>
    <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}><Gauge pct={ov.pct} closed={ov.done} total={ov.app}/><Card title="Done" value={ov.done} sub={`of ${ov.app}`} color={C.green} icon="✅"/><Card title="Not Done" value={ov.nd} color={ov.nd?C.red:C.green} icon="⚠️"/></div>
    <div style={{display:"flex",gap:14,marginBottom:12,flexWrap:"wrap",alignItems:"center"}}>
      {[[ST.DONE,"Done",C.green],[ST.NOT_DONE,"Not Done",C.red],[ST.HOLIDAY,"Holiday",C.yellow],[ST.NOT_USED,"Not Used",C.blue],[ST.NONE,"Pending",C.bg2]].map(([_,nm,clr])=>(<div key={nm} style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:12,height:12,borderRadius:3,background:clr}}/><span style={{color:C.text2,fontSize:11}}>{nm}</span></div>))}
      <button onClick={()=>{if(confirm("Reset ALL?"))setMasterData(initMasterData());}} style={{marginLeft:"auto",background:"#2a2a3e",color:C.text2,border:"none",borderRadius:4,padding:"5px 12px",fontSize:11,cursor:"pointer"}}>🗑 Reset</button></div>
    {CATEGORIES.map(cat=>{const cs=masterStats[cat.id];return(<div key={cat.id} style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 14px",marginBottom:5}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:5}}><span style={{color:C.text,fontWeight:700,fontSize:12}}>{cat.name}</span><span style={{color:C.text3,fontSize:10}}>{cat.type}</span>
        {cat.note&&<span style={{color:C.yellow,fontSize:10,fontStyle:"italic"}}>{cat.note}</span>}<span style={{marginLeft:"auto",color:pctColor(cs.pct),fontWeight:800,fontSize:13}}>{cs.pct.toFixed(1)}%</span>
        <Btn small bg={C.blue} onClick={()=>{setMasterCat(cat.id);setTab("master_detail");}}>Edit</Btn></div>
      <div style={{display:"flex",gap:2}}>{Array.from({length:12}).map((_,mi)=>{const ms=cs.monthly[mi];const clr=ms.pct>=100?C.green:ms.pct>=90?C.yellow:ms.pct>=75?C.orange:ms.app>0?C.red:C.bg2;
        return(<div key={mi} style={{textAlign:"center"}}><div style={{color:C.text3,fontSize:8}}>{MONTHS[mi]}</div><div style={{width:32,height:14,borderRadius:3,background:clr,border:`1px solid ${C.border}`}}/></div>);})}</div>
    </div>);})}
  </div>);};

  const renderMasterTable=()=>{const cols=[{key:"name",label:"Category"},{key:"type",label:"Type"},...MONTHS.map(m=>({key:m,label:m,align:"center"})),{key:"ytd",label:"YTD",align:"center"}];
    const rows=CATEGORIES.map(cat=>{const cs=masterStats[cat.id];const r={name:cat.name,type:cat.type,ytd:cs.pct.toFixed(1)+"%"};MONTHS.forEach((m,mi)=>{r[m]=cs.monthly[mi].app>0?cs.monthly[mi].pct.toFixed(0)+"%":"—";});return r;});
    const ov=masterStats._overall;const ovR={name:"OVERALL",type:"",ytd:ov.pct.toFixed(1)+"%"};MONTHS.forEach((m,mi)=>{let d=0,a=0;CATEGORIES.forEach(c=>{const ms=masterStats[c.id].monthly[mi];d+=ms.done;a+=ms.app;});ovR[m]=a>0?(d/a*100).toFixed(0)+"%":"—";});rows.push(ovR);
    return <div><SectionHeader icon={Table2} title="Score Table"/><DataTable columns={cols} rows={rows}/></div>;};

  const renderMasterDetail=()=>{if(!masterCat)return(<div><SectionHeader icon={Edit3} title="Edit Grid" sub="Select a category"/>
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>{CATEGORIES.map(cat=>{const cs=masterStats[cat.id];return(
      <div key={cat.id} onClick={()=>setMasterCat(cat.id)} style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:10,padding:"14px 16px",cursor:"pointer",transition:"border-color 0.15s"}}
        onMouseOver={e=>e.currentTarget.style.borderColor=C.blue} onMouseOut={e=>e.currentTarget.style.borderColor=C.border}>
        <div style={{color:C.text,fontWeight:700,fontSize:12}}>{cat.name}</div><div style={{color:pctColor(cs.pct),fontWeight:700,fontSize:12,marginTop:4}}>{cs.pct.toFixed(1)}%</div>
        <div style={{background:C.bg,borderRadius:4,height:6,marginTop:6,overflow:"hidden"}}><div style={{background:pctColor(cs.pct),height:"100%",width:`${Math.max(cs.pct,1)}%`}}/></div></div>);})}</div></div>);
    const cat=CATEGORIES.find(c=>c.id===masterCat);if(!cat)return null;const cs=masterStats[cat.id],mi=masterMonth;
    return(<div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}><Btn small bg="#2a2a3e" onClick={()=>setMasterCat(null)}>← Back</Btn><span style={{color:C.text,fontWeight:800,fontSize:16}}>{cat.name}</span><span style={{color:pctColor(cs.pct),fontWeight:800,fontSize:16}}>{cs.pct.toFixed(1)}%</span></div>
      <div style={{display:"flex",gap:3,marginBottom:10,flexWrap:"wrap"}}>{Array.from({length:12}).map((_,m)=>{const ms=cs.monthly[m];return(
        <button key={m} onClick={()=>setMasterMonth(m)} style={{background:m===mi?"#1e2a4a":C.bg3,color:m===mi?C.white:C.text2,border:m===mi?`2px solid ${C.blue}`:`1px solid ${C.border}`,borderRadius:5,padding:"5px 10px",fontSize:10,fontWeight:700,cursor:"pointer",textAlign:"center",lineHeight:1.4}}>{MONTHS[m]}<br/>{ms.app?ms.pct.toFixed(0)+"%":"—"}</button>);})}</div>
      <div style={{display:"flex",gap:6,marginBottom:10}}><Btn small bg={C.green} onClick={()=>bulkSet(cat.id,mi,ST.DONE,cat.type)}>✓ All Done</Btn><Btn small bg={C.red} onClick={()=>bulkSet(cat.id,mi,ST.NOT_DONE,cat.type)}>✗ Not Done</Btn><Btn small bg="#2a2a3e" onClick={()=>bulkSet(cat.id,mi,ST.NONE,cat.type)}>Clear</Btn></div>
      <div style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:10,padding:14,marginBottom:12}}>
        {cat.type==="daily"?<div style={{display:"flex",flexWrap:"wrap",gap:2}}>{Array.from({length:daysInMonth(mi)}).map((_,di)=>{const d=di+1,val=+(masterData[cat.id]?.[mi]?.[d]??0),we=isWeekend(mi,d);
          return(<div key={d} style={{textAlign:"center",width:30}}><div style={{color:we?"#444":C.text3,fontSize:8}}>{getDowName(mi,d)}</div><div style={{color:we?"#444":C.text3,fontSize:8}}>{d}</div>
            <button onClick={()=>toggleMC(cat.id,mi,d)} style={{width:26,height:26,background:ST_COLORS[val],color:val===ST.HOLIDAY?"#000":C.white,border:"none",borderRadius:4,fontWeight:700,fontSize:11,cursor:"pointer"}}>{ST_LABELS[val]}</button></div>);})}</div>
        :<div style={{display:"flex",gap:10}}>{[1,2,3,4,5].map(w=>{const val=+(masterData[cat.id]?.[mi]?.[w]??0);return(<div key={w} style={{textAlign:"center"}}><div style={{color:C.text2,fontSize:11,marginBottom:4}}>Week {w}</div>
          <button onClick={()=>toggleMC(cat.id,mi,w)} style={{width:52,height:40,background:ST_COLORS[val],color:val===ST.HOLIDAY?"#000":C.white,border:"none",borderRadius:6,fontWeight:700,fontSize:15,cursor:"pointer"}}>{ST_LABELS[val]}</button></div>);})}</div>}
      </div>
      <div style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:10,padding:14}}>
        <div style={{color:C.text2,fontWeight:700,fontSize:12,marginBottom:8}}>Full Year</div>
        {Array.from({length:12}).map((_,ymi)=>{const ms=cs.monthly[ymi],maxK=cat.type==="daily"?daysInMonth(ymi):5,sz=cat.type==="daily"?13:24;
          return(<div key={ymi} style={{display:"flex",alignItems:"center",marginBottom:2}}>
            <span style={{color:C.text3,fontSize:10,width:30,textAlign:"right",marginRight:6}}>{MONTHS[ymi]}</span>
            {Array.from({length:maxK}).map((_,ki)=><div key={ki} style={{width:sz,height:sz,background:ST_COLORS[+(masterData[cat.id]?.[ymi]?.[ki+1]??0)],border:`1px solid ${C.bg3}`,borderRadius:2}}/>)}
            <span style={{color:ms.app?pctColor(ms.pct):C.text3,fontSize:10,fontWeight:700,marginLeft:6}}>{ms.app?ms.pct.toFixed(0)+"%":"—"}</span></div>);})}
      </div></div>);};

  // ═══════════════════════════════════════════════════════
  // CNZ MAPPER VIEW
  // ═══════════════════════════════════════════════════════
  const renderCnzMapper=()=>{
    const srcOpts=["-- Not Mapped --",...cnzCols];const confColor=c=>c>=0.7?C.green:c>=0.5?C.yellow:C.red;
    const samples=(col)=>cnzSrc?cnzSrc.slice(0,3).map(r=>r[col]).filter(v=>v!=null&&v!=="").join(", ").slice(0,80):"";
    const previewData=cnzPreview?cnzBuild().slice(0,20):[];const colLetters=Array.from({length:CNZ_TOTAL}).map((_,i)=>String.fromCharCode(65+i));
    const profileNames=Object.keys(cnzProfiles);

    return(<div>
      <SectionHeader icon={RefreshCw} title="CNZ Import Mapper" sub="Map client files to CNZ Import Template"/>

      {/* File + Profiles */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
        <div style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 20px"}}>
          <div style={{color:C.text2,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>Source File</div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <Btn bg="#e94560" onClick={()=>cnzRef.current?.click()} icon={Upload}>Browse</Btn>
            <input ref={cnzRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleCnzFile} style={{display:"none"}}/>
            <span style={{color:cnzFile?C.text:C.text3,fontSize:12}}>{cnzFile||"No file selected"}</span>
          </div>
          {cnzSrc&&<div style={{color:C.text2,fontSize:11,marginTop:8}}>{cnzSrc.length} rows · {cnzCols.length} columns · {Object.keys(cnzMap).length} auto-mapped</div>}
        </div>

        <div style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 20px"}}>
          <div style={{color:C.text2,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:1,marginBottom:10}}>Client Profiles</div>
          <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
            <input value={cnzProfileName} onChange={e=>setCnzProfileName(e.target.value)} placeholder="Profile name..."
              style={{background:C.bg2,color:C.text,border:`1px solid ${C.border}`,borderRadius:6,padding:"6px 10px",fontSize:12,width:150}}/>
            <Btn small bg={C.green} onClick={()=>{saveProfile(cnzProfileName);setCnzProfileName("");}} disabled={!cnzProfileName.trim()||!cnzSrc} icon={Save}>Save</Btn>
            {profileNames.length>0&&<Sel value="" onChange={v=>{if(v)loadProfile(v);}} options={["Load profile...",...profileNames]} width={160}/>}
          </div>
          {profileNames.length>0&&<div style={{display:"flex",gap:4,marginTop:8,flexWrap:"wrap"}}>
            {profileNames.map(n=>(<div key={n} style={{background:C.bg2,borderRadius:6,padding:"4px 10px",display:"flex",alignItems:"center",gap:6}}>
              <span style={{color:C.text2,fontSize:11,cursor:"pointer"}} onClick={()=>loadProfile(n)}>{n}</span>
              <Trash2 size={12} color={C.red} style={{cursor:"pointer"}} onClick={()=>deleteProfile(n)}/>
            </div>))}</div>}
        </div>
      </div>

      {cnzSrc&&<>
        {/* Container */}
        <div style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 18px",marginBottom:5}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
            <div><div style={{color:C.text,fontSize:12,fontWeight:700}}>Container / Reference ID <span style={{color:C.text3,fontWeight:400}}>(Col A)</span></div>
              <div style={{color:C.text3,fontSize:10}}>Auto-extracted from filename or select a column</div></div>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <input value={cnzContainer} onChange={e=>setCnzContainer(e.target.value)} style={{background:C.bg2,color:C.text,border:`1px solid ${C.border}`,borderRadius:6,padding:"6px 10px",fontSize:12,fontFamily:"monospace",width:180}}/>
              <Sel value={cnzContainerCol||"-- Not Mapped --"} onChange={v=>setCnzContainerCol(v==="-- Not Mapped --"?"":v)} options={srcOpts} width={220}/>
            </div></div></div>

        {/* Dynamic fields */}
        {Object.entries(CNZ_FIELDS).filter(([k,v])=>!v.fromFilename).map(([fn,fd])=>{const m=cnzMap[fn];const cl=String.fromCharCode(65+fd.col);
          return(<div key={fn} style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 18px",marginBottom:5}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
              <div><div style={{color:C.text,fontSize:12,fontWeight:700}}>{fd.label} <span style={{color:C.text3,fontWeight:400}}>(Col {cl})</span></div>
                <div style={{color:C.text3,fontSize:10}}>{fd.desc}</div>
                {m&&<div style={{fontSize:10,marginTop:2}}><span style={{color:confColor(m.conf),fontWeight:700}}>✦ {m.conf>=0.7?"High":m.conf>=0.5?"Med":"Low"} ({(m.conf*100).toFixed(0)}%)</span>
                  <span style={{color:C.text3,marginLeft:8}}>Preview: {samples(m.col)}</span></div>}</div>
              <Sel value={m?.col||"-- Not Mapped --"} onChange={v=>{setCnzMap(p=>{const n={...p};if(v==="-- Not Mapped --")delete n[fn];else n[fn]={col:v,conf:1};return n;});}} options={srcOpts} width={260}/>
            </div></div>);})}

        {/* Static */}
        <div style={{color:C.text2,fontSize:11,fontWeight:700,marginTop:12,marginBottom:5,textTransform:"uppercase",letterSpacing:1}}>Static Fields</div>
        {CNZ_STATIC.map((s,i)=>(<div key={i} style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:10,padding:"8px 18px",marginBottom:3}}>
          <span style={{color:C.text3,fontSize:11}}>Col {String.fromCharCode(65+s.col)}: {s.label} → <span style={{color:C.text,fontFamily:"monospace"}}>"{s.value}"</span></span></div>))}

        <div style={{display:"flex",gap:8,marginTop:14}}>
          <Btn bg={C.purple} onClick={()=>setCnzPreview(!cnzPreview)} icon={cnzPreview?EyeOff:Eye}>{cnzPreview?"Hide":"Preview"}</Btn>
          <Btn bg={C.green} onClick={cnzExport} icon={Download}>Export .xlsx</Btn>
        </div>

        {cnzPreview&&previewData.length>0&&<div style={{marginTop:12}}>
          <div style={{color:C.text2,fontSize:11,marginBottom:6}}>First 20 of {cnzSrc.length} rows</div>
          <div style={{overflow:"auto",maxHeight:350,background:C.bg3,border:`1px solid ${C.border}`,borderRadius:10}}>
            <table style={{borderCollapse:"collapse",fontSize:10,whiteSpace:"nowrap"}}><thead><tr>{colLetters.map(l=><th key={l} style={{background:C.bg2,color:C.text2,padding:"7px 10px",borderBottom:`1px solid ${C.border}`,fontSize:10,fontWeight:700,position:"sticky",top:0}}>{l}</th>)}</tr></thead>
              <tbody>{previewData.map((row,ri)=>(<tr key={ri} style={{background:ri%2?C.rowAlt:C.bg3}}>{row.map((c,ci)=><td key={ci} style={{padding:"5px 10px",color:C.text,borderBottom:`1px solid ${C.border}18`}}>{c||""}</td>)}</tr>))}</tbody></table>
          </div></div>}
      </>}

      {!cnzSrc&&<div style={{textAlign:"center",padding:50,color:C.text3}}>
        <RefreshCw size={40} color={C.text3} style={{marginBottom:12,opacity:0.4}}/>
        <div style={{fontSize:14}}>Upload an Excel or CSV file to begin</div>
        <div style={{fontSize:11,marginTop:4}}>Supports .xlsx, .xls, and .csv</div>
        {profileNames.length>0&&<div style={{fontSize:11,marginTop:8,color:C.text2}}>💾 {profileNames.length} saved client profile{profileNames.length>1?"s":""} ready to use</div>}
      </div>}
    </div>);};

  // ═══════════════════════════════════════════════════════
  // ROUTER
  // ═══════════════════════════════════════════════════════
  const renderContent=()=>{
    if(!orders.length&&isKpi&&tab!=="dashboard")return renderHome();
    switch(tab){
      case"home":return renderHome();case"dashboard":return orders.length?renderDashboard():renderHome();
      case"kr2detail":return renderKr2Detail();case"team":return renderTeam();case"picktime":return renderTimes();
      case"clients":return renderClients();case"daily":return renderDaily();case"velocity":return renderVelocity();
      case"master_overview":return renderMasterOverview();case"master_table":return renderMasterTable();case"master_detail":return renderMasterDetail();
      case"cnz_mapper":return renderCnzMapper();default:return renderHome();}};

  // ═══════════════════════════════════════════════════════
  // LAYOUT
  // ═══════════════════════════════════════════════════════
  return(<div style={{background:C.bg,minHeight:"100vh",color:C.text,fontFamily:"'Segoe UI',system-ui,-apple-system,sans-serif",display:"flex"}}>
    <input ref={fileRef} type="file" accept=".csv" onChange={handleCSV} style={{display:"none"}}/>

    {/* Sidebar */}
    <div style={{width:sideOpen?220:56,background:C.sidebar,borderRight:`1px solid ${C.border}`,display:"flex",flexDirection:"column",transition:"width 0.2s",flexShrink:0,overflow:"hidden"}}>
      {/* Logo area */}
      <div style={{padding:sideOpen?"16px 16px 12px":"16px 12px 12px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:10,cursor:"pointer"}} onClick={()=>setSideOpen(!sideOpen)}>
        <div style={{width:32,height:32,borderRadius:8,background:`linear-gradient(135deg,${C.blue},${C.purple})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>📦</div>
        {sideOpen&&<div><div style={{color:C.text,fontSize:13,fontWeight:800,lineHeight:1.1}}>3PL Ops Hub</div><div style={{color:C.text3,fontSize:9}}>{YEAR}</div></div>}
      </div>

      {/* Nav sections */}
      <div style={{flex:1,overflowY:"auto",padding:"8px 0"}}>
        {navSections.map((sec,si)=>(<div key={si} style={{marginBottom:4}}>
          {sideOpen&&<div style={{color:C.text3,fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:1.5,padding:"8px 16px 4px"}}>{sec.title}</div>}
          {sec.items.map(item=>{const active=tab===item.id;const Icon=item.icon;
            return(<div key={item.id} onClick={()=>{setTab(item.id);if(window.innerWidth<768)setSideOpen(false);}}
              style={{display:"flex",alignItems:"center",gap:10,padding:sideOpen?"8px 16px":"8px 0",margin:"1px 8px",borderRadius:8,
                background:active?C.sideActive:"transparent",cursor:"pointer",transition:"all 0.15s",justifyContent:sideOpen?"flex-start":"center"}}
              onMouseOver={e=>{if(!active)e.currentTarget.style.background=C.sideHover;}} onMouseOut={e=>{if(!active)e.currentTarget.style.background="transparent";}}>
              <Icon size={18} color={active?C.blue:C.text3} style={{flexShrink:0}}/>
              {sideOpen&&<span style={{color:active?C.text:C.text2,fontSize:12,fontWeight:active?700:500}}>{item.label}</span>}
            </div>);
          })}</div>))}
      </div>

      {/* Sidebar footer */}
      {sideOpen&&<div style={{borderTop:`1px solid ${C.border}`,padding:12}}>
        <div style={{color:C.text3,fontSize:9,textAlign:"center"}}>KR2 Complete v2.0</div>
      </div>}
    </div>

    {/* Main content */}
    <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>
      {/* Top bar */}
      <div style={{background:C.bg2,borderBottom:`1px solid ${C.border}`,padding:"10px 20px",display:"flex",alignItems:"center",gap:12}}>
        <button onClick={()=>setSideOpen(!sideOpen)} style={{background:"none",border:"none",color:C.text2,cursor:"pointer",padding:4}}>
          {sideOpen?<X size={18}/>:<Menu size={18}/>}
        </button>

        {fileName&&<div style={{display:"flex",alignItems:"center",gap:8}}><div style={{width:6,height:6,borderRadius:3,background:C.green}}/><span style={{color:C.text2,fontSize:11}}>{orders.length} orders · KR2: {kr2pct.toFixed(1)}% · {fileName}</span></div>}

        <div style={{marginLeft:"auto",display:"flex",gap:6,alignItems:"center"}}>
          {showFilters&&<>{[["Date",dateF,setDateF,["all","today","week","month"]],["Picker",pickerF,setPickerF,["all",...pickers]],["Client",clientF,setClientF,["all",...clientsList]]].map(([l,v,s,o])=>(
            <div key={l} style={{display:"flex",alignItems:"center",gap:4}}><span style={{color:C.text3,fontSize:10}}>{l}</span><Sel value={v} onChange={s} options={o} width={130}/></div>))}</>}
          <Btn small bg={C.purple} onClick={()=>fileRef.current?.click()} icon={Upload}>Import</Btn>
        </div>
      </div>

      {/* Content */}
      <div style={{flex:1,overflow:"auto",padding:20}}>{renderContent()}</div>
    </div>
  </div>);
}