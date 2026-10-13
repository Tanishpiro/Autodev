CREATE TABLE "audit" (
	"id" text PRIMARY KEY,
	"action" text NOT NULL,
	"detail" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" text PRIMARY KEY,
	"title" text NOT NULL,
	"customer" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"value" double precision DEFAULT 0 NOT NULL,
	"type" text DEFAULT 'software' NOT NULL,
	"scope" text DEFAULT '' NOT NULL,
	"stage" text DEFAULT 'Qualified' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY,
	"opportunity_id" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"customer" text NOT NULL,
	"scope" text NOT NULL,
	"status" text DEFAULT 'In Progress' NOT NULL,
	"milestones" jsonb DEFAULT '[]' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY,
	"project_id" text NOT NULL,
	"milestone_id" text NOT NULL,
	"title" text NOT NULL,
	"assignee" text NOT NULL,
	"status" text DEFAULT 'Todo' NOT NULL,
	"position" double precision DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "audit_at_idx" ON "audit" ("at");--> statement-breakpoint
CREATE INDEX "tasks_project_id_idx" ON "tasks" ("project_id");--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_opportunity_id_opportunities_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE;