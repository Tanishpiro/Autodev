import { pgTable, text, doublePrecision, timestamp, jsonb, index } from "drizzle-orm/pg-core";

export type Milestone = { id: string; title: string; status: string; dueAt: string };

export const opportunities = pgTable("opportunities", {
  id: text().primaryKey(),
  title: text().notNull(),
  customer: text().notNull().default(""),
  email: text().notNull().default(""),
  value: doublePrecision().notNull().default(0),
  type: text().notNull().default("software"),
  scope: text().notNull().default(""),
  stage: text().notNull().default("Qualified"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const projects = pgTable("projects", {
  id: text().primaryKey(),
  opportunityId: text("opportunity_id").notNull().unique().references(() => opportunities.id),
  name: text().notNull(),
  customer: text().notNull(),
  scope: text().notNull(),
  status: text().notNull().default("In Progress"),
  milestones: jsonb().$type<Milestone[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tasks = pgTable("tasks", {
  id: text().primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  milestoneId: text("milestone_id").notNull(),
  title: text().notNull(),
  assignee: text().notNull(),
  status: text().notNull().default("Todo"),
  position: doublePrecision().notNull().default(0),
}, (t) => [index("tasks_project_id_idx").on(t.projectId)]);

export const audit = pgTable("audit", {
  id: text().primaryKey(),
  action: text().notNull(),
  detail: text().notNull(),
  at: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("audit_at_idx").on(t.at)]);
