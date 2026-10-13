import crypto from "node:crypto";
import type { Config } from "@netlify/functions";
import { and, asc, desc, eq, inArray, lt, ne, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { audit, opportunities, projects, tasks } from "../../db/schema.js";

type Opportunity = typeof opportunities.$inferSelect;

const STAGES = ["Qualified", "Proposal", "Won", "Lost"];
const TASK_STATUSES = ["Todo", "In Progress", "Done", "Blocked"];
const MAX_BODY = 1_000_000;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
  "access-control-allow-headers": "content-type,x-signature",
};

class HttpError extends Error {
  constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

const id = (prefix: string) => prefix + "_" + crypto.randomUUID().slice(0, 8);
const reply = (status: number, data: unknown) =>
  Response.json(data, { status, headers: { ...CORS, "cache-control": "no-store" } });

async function readBody(req: Request) {
  const raw = await req.text();
  if (raw.length > MAX_BODY) throw new HttpError(413, "Request body too large");
  try {
    return { raw, data: raw ? JSON.parse(raw) : {} };
  } catch {
    throw new HttpError(400, "Request body must be valid JSON");
  }
}

async function log(action: string, detail: string) {
  await db.insert(audit).values({ id: id("audit"), action, detail });
}

function assertDeliverable(o: Pick<Opportunity, "customer" | "scope" | "value">) {
  if (!o.customer?.trim() || !o.scope?.trim() || !(Number(o.value) > 0)) {
    throw new HttpError(422, "A Won deal requires a customer, project scope, and value greater than zero.");
  }
}

// Idempotent: returns the existing project when the opportunity was already converted.
async function makeProject(o: Opportunity) {
  const [existing] = await db.select().from(projects).where(eq(projects.opportunityId, o.id));
  if (existing) return existing;
  assertDeliverable(o);

  const milestoneId = id("mil");
  const [project] = await db
    .insert(projects)
    .values({
      id: id("prj"),
      opportunityId: o.id,
      name: o.title,
      customer: o.customer,
      scope: o.scope,
      status: "In Progress",
      milestones: [{ id: milestoneId, title: "Project kickoff", status: "Todo", dueAt: new Date(Date.now() + 7 * 86400000).toISOString() }],
    })
    .onConflictDoNothing({ target: projects.opportunityId })
    .returning();
  // A concurrent request won the race; return its project.
  if (!project) return (await db.select().from(projects).where(eq(projects.opportunityId, o.id)))[0];

  await db.insert(tasks).values([
    { id: id("task"), projectId: project.id, milestoneId, title: "Confirm scope and stakeholders", assignee: "manager@demo.com", position: 0 },
    { id: id("task"), projectId: project.id, milestoneId, title: "Prepare implementation plan", assignee: "dev1@demo.com", position: 1 },
    { id: id("task"), projectId: project.id, milestoneId, title: "Review delivery with customer", assignee: "manager@demo.com", position: 2 },
  ]);
  await log("project.created", project.name + " from " + o.id);
  return project;
}

async function stats() {
  const [o] = await db
    .select({
      count: sql<number>`count(*)::int`,
      pipeline: sql<number>`coalesce(sum(${opportunities.value}) filter (where ${opportunities.stage} not in ('Won','Lost')), 0)::float`,
    })
    .from(opportunities);
  const [p] = await db
    .select({ count: sql<number>`count(*)::int`, active: sql<number>`(count(*) filter (where ${projects.status} <> 'Completed'))::int` })
    .from(projects);
  const [t] = await db
    .select({ count: sql<number>`count(*)::int`, done: sql<number>`(count(*) filter (where ${tasks.status} = 'Done'))::int` })
    .from(tasks);
  return {
    opportunities: o.count,
    pipelineValue: o.pipeline,
    projects: p.count,
    activeProjects: p.active,
    tasks: t.count,
    completedTasks: t.done,
  };
}

async function setStage(oppId: string, req: Request) {
  const [o] = await db.select().from(opportunities).where(eq(opportunities.id, oppId));
  if (!o) return reply(404, { error: "Opportunity not found" });
  const { data } = await readBody(req);
  if (!STAGES.includes(data.stage)) return reply(422, { error: "Invalid stage" });
  // Validate before saving so an invalid deal is never left marked Won without a project.
  if (data.stage === "Won") assertDeliverable(o);

  const [updated] = await db.update(opportunities).set({ stage: data.stage }).where(eq(opportunities.id, o.id)).returning();
  await log("opportunity.stage_changed", o.title + " → " + updated.stage);
  const project = updated.stage === "Won" ? await makeProject(updated) : null;
  return reply(200, { opportunity: updated, project });
}

async function updateTask(taskId: string, req: Request) {
  const [t] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!t) return reply(404, { error: "Task not found" });
  const { data } = await readBody(req);
  if (!TASK_STATUSES.includes(data.status)) return reply(422, { error: "Invalid task status" });

  const [task] = await db.update(tasks).set({ status: data.status }).where(eq(tasks.id, t.id)).returning();
  const related = await db.select({ status: tasks.status }).from(tasks).where(eq(tasks.projectId, t.projectId));
  const status = related.length && related.every((x) => x.status === "Done") ? "Completed" : "In Progress";
  const [project] = await db.update(projects).set({ status }).where(eq(projects.id, t.projectId)).returning();
  await log("task.updated", t.title + " → " + task.status);
  return reply(200, { task, project: project ?? null });
}

async function riskScan() {
  const cutoff = new Date(Date.now() - 14 * 86400000);
  const [{ scanned }] = await db.select({ scanned: sql<number>`count(*)::int` }).from(projects);
  const flagged = await db
    .update(projects)
    .set({ status: "At Risk" })
    .where(and(ne(projects.status, "Completed"), lt(projects.createdAt, cutoff)))
    .returning({ id: projects.id });
  await log("risk.scan", "Scanned " + scanned + " project(s); " + flagged.length + " at risk");
  return reply(200, { scanned, atRisk: flagged.length });
}

async function crmWebhook(req: Request) {
  const { raw, data } = await readBody(req);
  const secret = process.env.WEBHOOK_SECRET || "change-me-too";
  const supplied = String(req.headers.get("x-signature") || "").replace(/^sha256=/, "");
  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return reply(401, { error: "Invalid webhook signature" });

  const d = data.data || data;
  const fields = {
    title: String(d.title || d.name || "CRM opportunity"),
    customer: String(d.customer?.name || (typeof d.customer === "string" ? d.customer : "")),
    email: String(d.customer?.email || ""),
    value: Number(d.value) || 0,
    type: String(d.type || "software"),
    scope: String(d.scope || ""),
    stage: STAGES.includes(d.stage) ? d.stage : "Qualified",
  };
  const oppId = String(d.id || id("opp"));

  if (fields.stage === "Won") {
    try {
      assertDeliverable(fields);
    } catch (e) {
      await log("webhook.validation_failed", (e as Error).message);
      throw new HttpError(422, (e as Error).message);
    }
  }

  // Upsert, preserving the original createdAt for known opportunities.
  const [saved] = await db
    .insert(opportunities)
    .values({ id: oppId, ...fields })
    .onConflictDoUpdate({ target: opportunities.id, set: fields })
    .returning();
  const project = saved.stage === "Won" ? await makeProject(saved) : null;
  await log("webhook.received", saved.title);
  return reply(202, { received: true, opportunity: saved, project });
}

async function route(req: Request, p: string) {
  const m = req.method;
  if (m === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (m === "GET" && p === "/api/health") return reply(200, { ok: true, service: "DeliveryFlow", time: new Date().toISOString() });
  if (m === "GET" && p === "/api/dashboard") return reply(200, await stats());
  if (m === "GET" && p === "/api/opportunities") {
    return reply(200, await db.select().from(opportunities).orderBy(desc(opportunities.createdAt)));
  }
  if (m === "GET" && p === "/api/projects") {
    const list = await db.select().from(projects).orderBy(desc(projects.createdAt));
    const all = list.length
      ? await db.select().from(tasks).where(inArray(tasks.projectId, list.map((x) => x.id))).orderBy(asc(tasks.position))
      : [];
    return reply(200, list.map((x) => ({ ...x, tasks: all.filter((t) => t.projectId === x.id) })));
  }
  if (m === "GET" && p === "/api/audit") return reply(200, await db.select().from(audit).orderBy(desc(audit.at)).limit(300));

  if (m === "POST" && p === "/api/opportunities") {
    const { data } = await readBody(req);
    const o = {
      id: id("opp"),
      title: String(data.title || "").trim(),
      customer: String(data.customer || "").trim(),
      email: String(data.email || "").trim(),
      value: Number(data.value),
      type: String(data.type || "software"),
      scope: String(data.scope || "").trim(),
      stage: "Qualified",
    };
    if (!o.title || !o.customer || !o.scope || !Number.isFinite(o.value) || o.value <= 0) {
      return reply(422, { error: "Title, customer, scope, and a positive deal value are required." });
    }
    const [saved] = await db.insert(opportunities).values(o).returning();
    await log("opportunity.created", saved.title);
    return reply(201, saved);
  }

  const stage = p.match(/^\/api\/opportunities\/([^/]+)\/stage$/);
  if (m === "POST" && stage) return setStage(decodeURIComponent(stage[1]), req);

  const task = p.match(/^\/api\/tasks\/([^/]+)$/);
  if (m === "PATCH" && task) return updateTask(decodeURIComponent(task[1]), req);

  if (m === "POST" && p === "/api/risk/scan") return riskScan();
  if (m === "POST" && p === "/api/webhooks/crm") return crmWebhook(req);

  return reply(404, { error: "API route not found" });
}

export default async (req: Request) => {
  try {
    return await route(req, new URL(req.url).pathname.replace(/\/+$/, ""));
  } catch (e) {
    if (e instanceof HttpError) return reply(e.status, { error: e.message, ...e.extra });
    console.error(e);
    return reply(500, { error: "Internal server error" });
  }
};

export const config: Config = {
  path: "/api/*",
};
