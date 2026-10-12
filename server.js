import http from "node:http";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, "public");
const DATA = path.join(ROOT, "data");
const STORE = path.join(DATA, "store.json");
const PORT = Number(process.env.PORT || 4000);
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "change-me-too";
const MIME = { ".html":"text/html; charset=utf-8", ".css":"text/css; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".json":"application/json; charset=utf-8" };
const now = () => new Date().toISOString();
const id = (prefix) => prefix + "_" + crypto.randomUUID().slice(0, 8);
let db;
let writes = Promise.resolve();

function seed() {
  return {
    opportunities: [
      {id:"opp_portal",title:"Customer Portal Build",customer:"Northstar Retail",email:"ops@northstar.example",value:42000,type:"software",scope:"Build a customer portal with account management and order tracking.",stage:"Qualified",createdAt:now()},
      {id:"opp_erp",title:"ERP Rollout",customer:"Stark Logistics",email:"ops@stark.example",value:75000,type:"implementation",scope:"ERP rollout for three warehouses.",stage:"Proposal",createdAt:now()}
    ], projects:[], tasks:[], audit:[{id:id("audit"),action:"app.started",detail:"DeliveryFlow initialized",at:now()}]
  };
}
async function persist() {
  writes = writes.then(() => writeFile(STORE, JSON.stringify(db, null, 2)));
  return writes;
}
async function load() {
  await mkdir(DATA,{recursive:true});
  try { db=JSON.parse(await readFile(STORE,"utf8")); }
  catch (e) { if(e.code!=="ENOENT" && !(e instanceof SyntaxError)) throw e; db=seed(); await persist(); }
  for (const k of ["opportunities","projects","tasks","audit"]) if(!Array.isArray(db[k])) db[k]=[];
}
function log(action,detail){db.audit.unshift({id:id("audit"),action,detail,at:now()});db.audit=db.audit.slice(0,300);}
function reply(res,status,data){res.writeHead(status,{"content-type":"application/json; charset=utf-8","access-control-allow-origin":"*","access-control-allow-methods":"GET,POST,PATCH,OPTIONS","access-control-allow-headers":"content-type,x-signature"});res.end(JSON.stringify(data));}
async function body(req){
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>1_000_000)throw Object.assign(new Error("Request body too large"),{status:413});chunks.push(chunk);}
  const raw=Buffer.concat(chunks).toString("utf8");
  try{return {raw,data:raw?JSON.parse(raw):{}};}catch{throw Object.assign(new Error("Request body must be valid JSON"),{status:400});}
}
function makeProject(o){
  const existing=db.projects.find(p=>p.opportunityId===o.id);if(existing)return existing;
  if(!o.customer?.trim()||!o.scope?.trim()||!(Number(o.value)>0))throw Object.assign(new Error("A Won deal requires a customer, project scope, and value greater than zero."),{status:422});
  const project={id:id("prj"),opportunityId:o.id,name:o.title,customer:o.customer,scope:o.scope,status:"In Progress",createdAt:now()};
  const milestoneId=id("mil");
  const tasks=[
    {id:id("task"),projectId:project.id,milestoneId,title:"Confirm scope and stakeholders",assignee:"manager@demo.com",status:"Todo"},
    {id:id("task"),projectId:project.id,milestoneId,title:"Prepare implementation plan",assignee:"dev1@demo.com",status:"Todo"},
    {id:id("task"),projectId:project.id,milestoneId,title:"Review delivery with customer",assignee:"manager@demo.com",status:"Todo"}
  ];
  project.milestones=[{id:milestoneId,title:"Project kickoff",status:"Todo",dueAt:new Date(Date.now()+7*86400000).toISOString()}];
  db.projects.unshift(project);db.tasks.push(...tasks);log("project.created",project.name+" from "+o.id);return project;
}
function stats(){
  const tasksDone=db.tasks.filter(t=>t.status==="Done").length;
  return {opportunities:db.opportunities.length,pipelineValue:db.opportunities.filter(o=>o.stage!=="Won"&&o.stage!=="Lost").reduce((s,o)=>s+Number(o.value||0),0),projects:db.projects.length,activeProjects:db.projects.filter(p=>p.status!=="Completed").length,tasks:db.tasks.length,completedTasks:tasksDone};
}
async function api(req,res,url){
  const p=url.pathname;
  if(req.method==="OPTIONS"){res.writeHead(204,{"access-control-allow-origin":"*","access-control-allow-methods":"GET,POST,PATCH,OPTIONS","access-control-allow-headers":"content-type,x-signature"});return res.end();}
  if(req.method==="GET"&&p==="/api/health")return reply(res,200,{ok:true,service:"DeliveryFlow",time:now()});
  if(req.method==="GET"&&p==="/api/dashboard")return reply(res,200,stats());
  if(req.method==="GET"&&p==="/api/opportunities")return reply(res,200,db.opportunities);
  if(req.method==="GET"&&p==="/api/projects")return reply(res,200,db.projects.map(x=>({...x,tasks:db.tasks.filter(t=>t.projectId===x.id)})));
  if(req.method==="GET"&&p==="/api/audit")return reply(res,200,db.audit);
  if(req.method==="POST"&&p==="/api/opportunities"){
    const {data}=await body(req);
    const o={id:id("opp"),title:String(data.title||"").trim(),customer:String(data.customer||"").trim(),email:String(data.email||"").trim(),value:Number(data.value),type:String(data.type||"software"),scope:String(data.scope||"").trim(),stage:"Qualified",createdAt:now()};
    if(!o.title||!o.customer||!o.scope||!Number.isFinite(o.value)||o.value<=0)return reply(res,422,{error:"Title, customer, scope, and a positive deal value are required."});
    db.opportunities.unshift(o);log("opportunity.created",o.title);await persist();return reply(res,201,o);
  }
  const stage=p.match(/^\/api\/opportunities\/([^/]+)\/stage$/);
  if(req.method==="POST"&&stage){
    const o=db.opportunities.find(x=>x.id===stage[1]);if(!o)return reply(res,404,{error:"Opportunity not found"});
    const {data}=await body(req);if(!["Qualified","Proposal","Won","Lost"].includes(data.stage))return reply(res,422,{error:"Invalid stage"});
    o.stage=data.stage;let project=null;log("opportunity.stage_changed",o.title+" → "+o.stage);
    if(o.stage==="Won"){try{project=makeProject(o);}catch(e){await persist();return reply(res,e.status||422,{error:e.message});}}
    await persist();return reply(res,200,{opportunity:o,project});
  }
  const taskRoute=p.match(/^\/api\/tasks\/([^/]+)$/);
  if(req.method==="PATCH"&&taskRoute){
    const t=db.tasks.find(x=>x.id===taskRoute[1]);if(!t)return reply(res,404,{error:"Task not found"});
    const {data}=await body(req);if(!["Todo","In Progress","Done","Blocked"].includes(data.status))return reply(res,422,{error:"Invalid task status"});
    t.status=data.status;const project=db.projects.find(x=>x.id===t.projectId);const related=db.tasks.filter(x=>x.projectId===t.projectId);
    if(project)project.status=related.length&&related.every(x=>x.status==="Done")?"Completed":"In Progress";
    log("task.updated",t.title+" → "+t.status);await persist();return reply(res,200,{task:t,project});
  }
  if(req.method==="POST"&&p==="/api/risk/scan"){
    const cutoff=Date.now()-14*86400000;let atRisk=0;
    for(const project of db.projects){if(project.status!=="Completed"&&Date.parse(project.createdAt)<cutoff){project.status="At Risk";atRisk++;}}
    log("risk.scan","Scanned "+db.projects.length+" project(s); "+atRisk+" at risk");await persist();return reply(res,200,{scanned:db.projects.length,atRisk});
  }
  if(req.method==="POST"&&p==="/api/webhooks/crm"){
    const {raw,data}=await body(req);const supplied=String(req.headers["x-signature"]||"").replace(/^sha256=/,"");
    const expected=crypto.createHmac("sha256",WEBHOOK_SECRET).update(raw).digest("hex");const a=Buffer.from(supplied);const b=Buffer.from(expected);
    if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return reply(res,401,{error:"Invalid webhook signature"});
    const d=data.data||data;const o={id:String(d.id||id("opp")),title:String(d.title||d.name||"CRM opportunity"),customer:String(d.customer?.name||d.customer||""),email:String(d.customer?.email||""),value:Number(d.value||0),type:String(d.type||"software"),scope:String(d.scope||""),stage:["Qualified","Proposal","Won","Lost"].includes(d.stage)?d.stage:"Qualified",createdAt:now()};
    let saved=db.opportunities.find(x=>x.id===o.id);if(saved)Object.assign(saved,o);else{db.opportunities.unshift(o);saved=o;}
    let project=null;if(o.stage==="Won"){try{project=makeProject(saved);}catch(e){log("webhook.validation_failed",e.message);await persist();return reply(res,422,{error:e.message,opportunity:saved});}}
    log("webhook.received",o.title);await persist();return reply(res,202,{received:true,opportunity:saved,project});
  }
  return reply(res,404,{error:"API route not found"});
}
async function handle(req,res){
  const url=new URL(req.url,"http://localhost");
  if(url.pathname.startsWith("/api/")){try{return await api(req,res,url);}catch(e){return reply(res,e.status||500,{error:e.message||"Internal server error"});}}
  let requested;try{requested=decodeURIComponent(url.pathname==="/"?"index.html":url.pathname.slice(1));}catch{return reply(res,400,{error:"Bad path"});}
  const file=path.resolve(PUBLIC,requested);if(!file.startsWith(PUBLIC+path.sep)){res.writeHead(403);return res.end("Forbidden");}
  try{const content=await readFile(file);res.writeHead(200,{"content-type":MIME[path.extname(file)]||"application/octet-stream","x-content-type-options":"nosniff"});res.end(content);}
  catch{res.writeHead(404,{"content-type":"text/plain; charset=utf-8"});res.end("Not found");}
}
await load();
const server=http.createServer(handle);
server.listen(PORT,"0.0.0.0",()=>console.log("DeliveryFlow running at http://localhost:"+PORT));
function shutdown(){server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),5000).unref();}
process.on("SIGINT",shutdown);process.on("SIGTERM",shutdown);
