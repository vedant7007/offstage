CREATE TABLE "agent_configs" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"event_id" text NOT NULL,
	"agent" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"auto_approve_t_1" boolean DEFAULT true NOT NULL,
	"human_lead_role" text NOT NULL,
	"human_lead_user_id" text,
	"mandate" text,
	"model_tier" text DEFAULT 'fast' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"event_id" text,
	"actor" jsonb NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"proposal_id" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"event_id" text NOT NULL,
	"registration_id" text,
	"volunteer_id" text,
	"user_id" text,
	"consent_version" text NOT NULL,
	"purposes" text[] NOT NULL,
	"adult_confirmed" boolean NOT NULL,
	"guardian_consent" boolean DEFAULT false NOT NULL,
	"given_at" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "data_requests" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"event_id" text NOT NULL,
	"user_id" text,
	"registration_id" text,
	"type" text NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"note" text,
	"resolved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "domain_events" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"id" text DEFAULT gen_random_uuid()::text NOT NULL,
	"event_id" text NOT NULL,
	"type" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"actor" jsonb NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "domain_events_id_unique" UNIQUE("id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"tagline" text,
	"description" text DEFAULT '' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"venue" jsonb NOT NULL,
	"capacity" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"settings" jsonb NOT NULL,
	"brief" jsonb,
	"agents_enabled" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"event_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"domains" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orgs" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orgs_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"event_id" text NOT NULL,
	"channel" text NOT NULL,
	"driver" text NOT NULL,
	"to_enc" text NOT NULL,
	"recipient_type" text NOT NULL,
	"recipient_id" text,
	"subject" text,
	"body" text NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedupe_key" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"provider_id" text,
	"error" text,
	"announcement_id" text,
	"proposal_id" text,
	"scheduled_for" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_budget" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"event_id" text,
	"day" date NOT NULL,
	"spent_usd" numeric(12, 6) DEFAULT 0 NOT NULL,
	"cap_usd" numeric(12, 6) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"event_id" text NOT NULL,
	"name" text NOT NULL,
	"building" text,
	"kind" text NOT NULL,
	"capacity" integer NOT NULL,
	"features" text[] DEFAULT '{}'::text[] NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_speakers" (
	"session_id" text NOT NULL,
	"speaker_id" text NOT NULL,
	"role" text DEFAULT 'speaker' NOT NULL,
	CONSTRAINT "session_speakers_session_id_speaker_id_pk" PRIMARY KEY("session_id","speaker_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"event_id" text NOT NULL,
	"track_id" text,
	"room_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"kind" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"capacity" integer NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"delay_minutes" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "speaker_requirements" (
	"speaker_id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"av" text[] DEFAULT '{}'::text[] NOT NULL,
	"travel" text,
	"stay" text,
	"materials" text,
	"notes" text,
	"form_token_hash" text,
	"submitted_at" timestamp with time zone,
	"bio_confirmed" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "speaker_requirements_formTokenHash_unique" UNIQUE("form_token_hash")
);
--> statement-breakpoint
CREATE TABLE "speakers" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"event_id" text NOT NULL,
	"name" text NOT NULL,
	"title" text,
	"organization" text,
	"bio" text,
	"email_enc" text,
	"phone_enc" text,
	"status" text DEFAULT 'invited' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracks" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"event_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checkins" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"event_id" text NOT NULL,
	"ticket_id" text NOT NULL,
	"registration_id" text NOT NULL,
	"session_id" text,
	"scanner_user_id" text NOT NULL,
	"client_id" text NOT NULL,
	"device_time" timestamp with time zone NOT NULL,
	"server_time" timestamp with time zone DEFAULT now() NOT NULL,
	"duplicate" boolean DEFAULT false NOT NULL,
	"original_checkin_id" text
);
--> statement-breakpoint
CREATE TABLE "registrations" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"event_id" text NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"email_enc" text NOT NULL,
	"email_hash" text NOT NULL,
	"phone_enc" text,
	"phone_hash" text,
	"college" text NOT NULL,
	"department" text NOT NULL,
	"year" integer NOT NULL,
	"section" text NOT NULL,
	"roll_no" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"waitlist_position" integer,
	"team_id" text,
	"food_pref" text NOT NULL,
	"accessibility" text,
	"adult_confirmed" boolean NOT NULL,
	"guardian_consent" boolean DEFAULT false NOT NULL,
	"consent_version" text NOT NULL,
	"duplicate_of_id" text,
	"checked_in_at" timestamp with time zone,
	"anonymised_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_choices" (
	"registration_id" text NOT NULL,
	"session_id" text NOT NULL,
	"event_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_choices_registration_id_session_id_pk" PRIMARY KEY("registration_id","session_id")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"event_id" text NOT NULL,
	"name" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"event_id" text NOT NULL,
	"registration_id" text NOT NULL,
	"token" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL,
	"revoked_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "tickets_registrationId_unique" UNIQUE("registration_id")
);
--> statement-breakpoint
CREATE TABLE "availability" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"event_id" text NOT NULL,
	"volunteer_id" text NOT NULL,
	"start" timestamp with time zone NOT NULL,
	"end" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"event_id" text NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"severity" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"source" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"room_id" text,
	"emergency" boolean DEFAULT false NOT NULL,
	"reported_by_user_id" text,
	"assignee_user_id" text,
	"evidence_refs" text[] DEFAULT '{}'::text[] NOT NULL,
	"resolved_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shift_assignments" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"event_id" text NOT NULL,
	"shift_id" text NOT NULL,
	"volunteer_id" text NOT NULL,
	"status" text DEFAULT 'assigned' NOT NULL,
	"checked_in_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"event_id" text NOT NULL,
	"role" text NOT NULL,
	"room_id" text,
	"session_id" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"required_count" integer DEFAULT 1 NOT NULL,
	"skills" text[] DEFAULT '{}'::text[] NOT NULL,
	"briefing_markdown" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"event_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"assignee_volunteer_id" text,
	"skill" text,
	"room_id" text,
	"incident_id" text,
	"status" text DEFAULT 'open' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"due_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "volunteers" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"event_id" text NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"phone_enc" text,
	"phone_hash" text,
	"skills" text[] DEFAULT '{}'::text[] NOT NULL,
	"max_hours" numeric(4, 1) DEFAULT 8 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"event_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"body_by_channel" jsonb NOT NULL,
	"segment" jsonb NOT NULL,
	"channels" text[] NOT NULL,
	"category" text NOT NULL,
	"public" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"scheduled_for" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"approved_by_role" text,
	"drafted_by" text,
	"proposal_id" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"event_id" text NOT NULL,
	"channel" text NOT NULL,
	"user_id" text,
	"asker_role" text NOT NULL,
	"external_ref_hash" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "escalations" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"event_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"summary" text NOT NULL,
	"suggested_reply" text,
	"priority" text DEFAULT 'normal' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kb_chunks" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"event_id" text NOT NULL,
	"doc_id" text NOT NULL,
	"doc_version" integer NOT NULL,
	"ordinal" integer NOT NULL,
	"section" text DEFAULT '' NOT NULL,
	"text" text NOT NULL,
	"token_count" integer DEFAULT 0 NOT NULL,
	"embedding" vector(384),
	"tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('english'::regconfig, coalesce(section, '') || ' ' || coalesce(text, ''))) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kb_documents" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"event_id" text NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"mime_type" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"source_path" text,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"public" boolean DEFAULT false NOT NULL,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"event_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"role" text NOT NULL,
	"body" text NOT NULL,
	"citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"guard" text,
	"guard_score" real,
	"confidence" real,
	"escalation_id" text,
	"language" text,
	"cluster_key" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"event_id" text NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"category" text DEFAULT 'info' NOT NULL,
	"announcement_id" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"event_id" text NOT NULL,
	"agent" text NOT NULL,
	"trigger" jsonb NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"simulation" boolean DEFAULT false NOT NULL,
	"model_tier" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"step_count" integer DEFAULT 0 NOT NULL,
	"proposal_ids" text[] DEFAULT '{}' NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(12, 6) DEFAULT 0 NOT NULL,
	"latency_ms" integer,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "agent_steps" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"event_id" text NOT NULL,
	"run_id" text NOT NULL,
	"index" integer NOT NULL,
	"kind" text NOT NULL,
	"data" jsonb NOT NULL,
	"cost_usd" real,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposal_approvals" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"event_id" text NOT NULL,
	"proposal_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"diff_hash" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"event_id" text NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"proposed_by" jsonb NOT NULL,
	"proposer_agent" text,
	"plan_id" text,
	"parent_id" text,
	"domain" text NOT NULL,
	"summary" text NOT NULL,
	"rationale" text DEFAULT '' NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"impact" jsonb NOT NULL,
	"diff" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"diff_hash" text NOT NULL,
	"risk_tier" text NOT NULL,
	"tier_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"required_approvals" integer NOT NULL,
	"faculty_approval_required" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"idempotency_key" text NOT NULL,
	"preconditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"executed_at" timestamp with time zone,
	"undo_until" timestamp with time zone,
	"undo_data" jsonb,
	"error" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_categories" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"event_id" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"cap_inr" numeric(12, 2) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funnel_snapshots" (
	"event_id" text NOT NULL,
	"date" date NOT NULL,
	"registrations" integer NOT NULL,
	"target" integer NOT NULL,
	CONSTRAINT "funnel_snapshots_event_id_date_pk" PRIMARY KEY("event_id","date")
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"event_id" text NOT NULL,
	"type" text NOT NULL,
	"category_id" text,
	"amount_inr" numeric(12, 2) NOT NULL,
	"status" text NOT NULL,
	"vendor" text,
	"source" text,
	"sponsor_id" text,
	"note" text NOT NULL,
	"evidence_ref" text,
	"occurred_on" date NOT NULL,
	"proposal_id" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_posts" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"event_id" text NOT NULL,
	"platform" text NOT NULL,
	"body" text NOT NULL,
	"hashtags" text[] DEFAULT '{}' NOT NULL,
	"poster_brief" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"scheduled_for" timestamp with time zone,
	"posted_at" timestamp with time zone,
	"proposal_id" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"event_id" text NOT NULL,
	"title" text NOT NULL,
	"category_id" text,
	"rows" jsonb NOT NULL,
	"recommended_vendor" text,
	"proposal_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sponsor_deliverables" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"event_id" text NOT NULL,
	"prospect_id" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"due_on" date,
	"evidence_ref" text,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sponsor_prospects" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"event_id" text NOT NULL,
	"name" text NOT NULL,
	"stage" text DEFAULT 'prospect' NOT NULL,
	"tier" text,
	"fit_reason" text DEFAULT '' NOT NULL,
	"contact_name" text,
	"contact_email_enc" text,
	"ask_inr" numeric(12, 2),
	"committed_inr" numeric(12, 2),
	"last_touch_at" timestamp with time zone,
	"next_follow_up_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sponsor_touchpoints" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"event_id" text NOT NULL,
	"prospect_id" text NOT NULL,
	"kind" text NOT NULL,
	"direction" text NOT NULL,
	"summary" text NOT NULL,
	"draft_body" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "briefings" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"event_id" text NOT NULL,
	"date" date NOT NULL,
	"scope" jsonb NOT NULL,
	"sections" jsonb NOT NULL,
	"facts" jsonb NOT NULL,
	"generated_by" text NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "certificates" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"event_id" text NOT NULL,
	"kind" text NOT NULL,
	"recipient_name" text NOT NULL,
	"title" text NOT NULL,
	"registration_id" text,
	"volunteer_id" text,
	"hours" numeric(5, 1),
	"issued_by" text NOT NULL,
	"file_path" text,
	"revoked" boolean DEFAULT false NOT NULL,
	"revoked_at" timestamp with time zone,
	"proposal_id" text,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist_items" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"event_id" text NOT NULL,
	"checklist_id" text NOT NULL,
	"ordinal" integer DEFAULT 0 NOT NULL,
	"label" text NOT NULL,
	"status" text DEFAULT 'todo' NOT NULL,
	"notes" text,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklists" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"event_id" text NOT NULL,
	"title" text NOT NULL,
	"scope_type" text NOT NULL,
	"scope_ref" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"event_id" text NOT NULL,
	"registration_id" text,
	"rating" integer NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"event_id" text NOT NULL,
	"name" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"unit" text,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "milestones" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"event_id" text NOT NULL,
	"title" text NOT NULL,
	"domain" text NOT NULL,
	"due_on" date NOT NULL,
	"status" text DEFAULT 'not_started' NOT NULL,
	"owner_role" text NOT NULL,
	"depends_on" text[] DEFAULT '{}'::text[] NOT NULL,
	"critical" boolean DEFAULT false NOT NULL,
	"notes" text,
	"completed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "od_lists" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"event_id" text NOT NULL,
	"department" text NOT NULL,
	"year" integer NOT NULL,
	"section" text,
	"date" date NOT NULL,
	"time_from" timestamp with time zone NOT NULL,
	"time_to" timestamp with time zone NOT NULL,
	"entries" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"file_path" text,
	"proposal_id" text,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playbook_lessons" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"org_id" text NOT NULL,
	"event_type" text NOT NULL,
	"title" text NOT NULL,
	"lesson" text NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"evidence_refs" text[] DEFAULT '{}'::text[] NOT NULL,
	"source_event_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatif_runs" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"event_id" text NOT NULL,
	"scenario" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_configs" ADD CONSTRAINT "agent_configs_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_configs" ADD CONSTRAINT "agent_configs_human_lead_user_id_users_id_fk" FOREIGN KEY ("human_lead_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_events" ADD CONSTRAINT "domain_events_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_budget" ADD CONSTRAINT "usage_budget_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_budget" ADD CONSTRAINT "usage_budget_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_speakers" ADD CONSTRAINT "session_speakers_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_speakers" ADD CONSTRAINT "session_speakers_speaker_id_speakers_id_fk" FOREIGN KEY ("speaker_id") REFERENCES "public"."speakers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speaker_requirements" ADD CONSTRAINT "speaker_requirements_speaker_id_speakers_id_fk" FOREIGN KEY ("speaker_id") REFERENCES "public"."speakers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speaker_requirements" ADD CONSTRAINT "speaker_requirements_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speakers" ADD CONSTRAINT "speakers_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_scanner_user_id_users_id_fk" FOREIGN KEY ("scanner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_choices" ADD CONSTRAINT "session_choices_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_choices" ADD CONSTRAINT "session_choices_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_choices" ADD CONSTRAINT "session_choices_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability" ADD CONSTRAINT "availability_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability" ADD CONSTRAINT "availability_volunteer_id_volunteers_id_fk" FOREIGN KEY ("volunteer_id") REFERENCES "public"."volunteers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_reported_by_user_id_users_id_fk" FOREIGN KEY ("reported_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_volunteer_id_volunteers_id_fk" FOREIGN KEY ("volunteer_id") REFERENCES "public"."volunteers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_volunteer_id_volunteers_id_fk" FOREIGN KEY ("assignee_volunteer_id") REFERENCES "public"."volunteers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteers" ADD CONSTRAINT "volunteers_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volunteers" ADD CONSTRAINT "volunteers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_chunks" ADD CONSTRAINT "kb_chunks_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_chunks" ADD CONSTRAINT "kb_chunks_doc_id_kb_documents_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."kb_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_documents" ADD CONSTRAINT "kb_documents_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_steps" ADD CONSTRAINT "agent_steps_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_steps" ADD CONSTRAINT "agent_steps_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_approvals" ADD CONSTRAINT "proposal_approvals_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_approvals" ADD CONSTRAINT "proposal_approvals_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_approvals" ADD CONSTRAINT "proposal_approvals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_categories" ADD CONSTRAINT "budget_categories_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "funnel_snapshots" ADD CONSTRAINT "funnel_snapshots_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_category_id_budget_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."budget_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_posts" ADD CONSTRAINT "marketing_posts_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_category_id_budget_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."budget_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_deliverables" ADD CONSTRAINT "sponsor_deliverables_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_deliverables" ADD CONSTRAINT "sponsor_deliverables_prospect_id_sponsor_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."sponsor_prospects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_prospects" ADD CONSTRAINT "sponsor_prospects_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_touchpoints" ADD CONSTRAINT "sponsor_touchpoints_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_touchpoints" ADD CONSTRAINT "sponsor_touchpoints_prospect_id_sponsor_prospects_id_fk" FOREIGN KEY ("prospect_id") REFERENCES "public"."sponsor_prospects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "briefings" ADD CONSTRAINT "briefings_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_volunteer_id_volunteers_id_fk" FOREIGN KEY ("volunteer_id") REFERENCES "public"."volunteers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_checklist_id_checklists_id_fk" FOREIGN KEY ("checklist_id") REFERENCES "public"."checklists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklists" ADD CONSTRAINT "checklists_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "od_lists" ADD CONSTRAINT "od_lists_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook_lessons" ADD CONSTRAINT "playbook_lessons_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook_lessons" ADD CONSTRAINT "playbook_lessons_source_event_id_events_id_fk" FOREIGN KEY ("source_event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatif_runs" ADD CONSTRAINT "whatif_runs_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatif_runs" ADD CONSTRAINT "whatif_runs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_configs_event_id_agent_index" ON "agent_configs" USING btree ("event_id","agent");--> statement-breakpoint
CREATE INDEX "audit_log_event_id_at_index" ON "audit_log" USING btree ("event_id","at");--> statement-breakpoint
CREATE INDEX "audit_log_entity_entity_id_index" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "consents_event_id_index" ON "consents" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "consents_registration_id_index" ON "consents" USING btree ("registration_id");--> statement-breakpoint
CREATE INDEX "data_requests_event_id_status_index" ON "data_requests" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "domain_events_event_id_seq_index" ON "domain_events" USING btree ("event_id","seq");--> statement-breakpoint
CREATE INDEX "domain_events_event_id_type_index" ON "domain_events" USING btree ("event_id","type");--> statement-breakpoint
CREATE INDEX "events_org_id_index" ON "events" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_event_id_user_id_index" ON "memberships" USING btree ("event_id","user_id");--> statement-breakpoint
CREATE INDEX "memberships_user_id_index" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "outbox_status_scheduled_for_index" ON "outbox" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE INDEX "outbox_event_id_index" ON "outbox" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "outbox_recipient_id_created_at_index" ON "outbox" USING btree ("recipient_id","created_at");--> statement-breakpoint
CREATE INDEX "outbox_dedupe_key_index" ON "outbox" USING btree ("dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_budget_scope_day" ON "usage_budget" USING btree ("org_id",coalesce("event_id", ''),"day");--> statement-breakpoint
CREATE INDEX "rooms_event_id_index" ON "rooms" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "session_speakers_speaker_id_index" ON "session_speakers" USING btree ("speaker_id");--> statement-breakpoint
CREATE INDEX "sessions_event_id_starts_at_index" ON "sessions" USING btree ("event_id","starts_at");--> statement-breakpoint
CREATE INDEX "sessions_room_id_starts_at_index" ON "sessions" USING btree ("room_id","starts_at");--> statement-breakpoint
CREATE INDEX "speakers_event_id_index" ON "speakers" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "tracks_event_id_index" ON "tracks" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "checkins_event_id_client_id_index" ON "checkins" USING btree ("event_id","client_id");--> statement-breakpoint
CREATE INDEX "checkins_registration_id_index" ON "checkins" USING btree ("registration_id");--> statement-breakpoint
CREATE INDEX "checkins_event_id_server_time_index" ON "checkins" USING btree ("event_id","server_time");--> statement-breakpoint
CREATE UNIQUE INDEX "registrations_event_id_email_hash_index" ON "registrations" USING btree ("event_id","email_hash");--> statement-breakpoint
CREATE INDEX "registrations_event_id_status_index" ON "registrations" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "registrations_event_id_phone_hash_index" ON "registrations" USING btree ("event_id","phone_hash");--> statement-breakpoint
CREATE INDEX "registrations_user_id_index" ON "registrations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_choices_session_id_index" ON "session_choices" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "teams_event_id_index" ON "teams" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "tickets_event_id_revoked_index" ON "tickets" USING btree ("event_id","revoked");--> statement-breakpoint
CREATE INDEX "availability_event_id_index" ON "availability" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "availability_volunteer_id_index" ON "availability" USING btree ("volunteer_id");--> statement-breakpoint
CREATE INDEX "incidents_event_id_status_index" ON "incidents" USING btree ("event_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "shift_assignments_shift_id_volunteer_id_index" ON "shift_assignments" USING btree ("shift_id","volunteer_id");--> statement-breakpoint
CREATE INDEX "shift_assignments_event_id_index" ON "shift_assignments" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "shift_assignments_volunteer_id_index" ON "shift_assignments" USING btree ("volunteer_id");--> statement-breakpoint
CREATE INDEX "shifts_event_id_starts_at_index" ON "shifts" USING btree ("event_id","starts_at");--> statement-breakpoint
CREATE INDEX "tasks_event_id_status_index" ON "tasks" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "tasks_assignee_volunteer_id_index" ON "tasks" USING btree ("assignee_volunteer_id");--> statement-breakpoint
CREATE INDEX "volunteers_event_id_index" ON "volunteers" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "volunteers_event_id_user_id_index" ON "volunteers" USING btree ("event_id","user_id");--> statement-breakpoint
CREATE INDEX "announcements_event_id_status_index" ON "announcements" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "conversations_event_id_index" ON "conversations" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "conversations_external_ref_hash_index" ON "conversations" USING btree ("external_ref_hash");--> statement-breakpoint
CREATE INDEX "escalations_event_id_status_index" ON "escalations" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "kb_chunks_event_id_index" ON "kb_chunks" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "kb_chunks_doc_id_index" ON "kb_chunks" USING btree ("doc_id");--> statement-breakpoint
CREATE INDEX "kb_chunks_embedding_hnsw" ON "kb_chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "kb_chunks_tsv_gin" ON "kb_chunks" USING gin ("tsv");--> statement-breakpoint
CREATE INDEX "kb_documents_event_id_index" ON "kb_documents" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_id_at_index" ON "messages" USING btree ("conversation_id","at");--> statement-breakpoint
CREATE INDEX "messages_event_id_at_index" ON "messages" USING btree ("event_id","at");--> statement-breakpoint
CREATE INDEX "notifications_user_id_created_at_index" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_event_id_index" ON "notifications" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "agent_runs_event_id_started_at_index" ON "agent_runs" USING btree ("event_id","started_at");--> statement-breakpoint
CREATE INDEX "agent_runs_event_id_agent_started_at_index" ON "agent_runs" USING btree ("event_id","agent","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_steps_run_id_index_index" ON "agent_steps" USING btree ("run_id","index");--> statement-breakpoint
CREATE UNIQUE INDEX "proposal_approvals_proposal_id_user_id_index" ON "proposal_approvals" USING btree ("proposal_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "proposals_event_id_idempotency_key_index" ON "proposals" USING btree ("event_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "proposals_event_id_status_created_at_index" ON "proposals" USING btree ("event_id","status","created_at");--> statement-breakpoint
CREATE INDEX "proposals_parent_id_index" ON "proposals" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "proposals_event_id_domain_status_index" ON "proposals" USING btree ("event_id","domain","status");--> statement-breakpoint
CREATE UNIQUE INDEX "budget_categories_event_id_key_index" ON "budget_categories" USING btree ("event_id","key");--> statement-breakpoint
CREATE INDEX "ledger_entries_event_id_type_index" ON "ledger_entries" USING btree ("event_id","type");--> statement-breakpoint
CREATE INDEX "ledger_entries_category_id_index" ON "ledger_entries" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "marketing_posts_event_id_status_index" ON "marketing_posts" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "quotes_event_id_index" ON "quotes" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "sponsor_deliverables_prospect_id_index" ON "sponsor_deliverables" USING btree ("prospect_id");--> statement-breakpoint
CREATE INDEX "sponsor_prospects_event_id_stage_index" ON "sponsor_prospects" USING btree ("event_id","stage");--> statement-breakpoint
CREATE INDEX "sponsor_touchpoints_prospect_id_at_index" ON "sponsor_touchpoints" USING btree ("prospect_id","at");--> statement-breakpoint
CREATE INDEX "briefings_event_id_date_index" ON "briefings" USING btree ("event_id","date");--> statement-breakpoint
CREATE INDEX "certificates_event_id_index" ON "certificates" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "certificates_registration_id_index" ON "certificates" USING btree ("registration_id");--> statement-breakpoint
CREATE INDEX "checklist_items_checklist_id_index" ON "checklist_items" USING btree ("checklist_id");--> statement-breakpoint
CREATE INDEX "checklists_event_id_index" ON "checklists" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "feedback_event_id_index" ON "feedback" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "inventory_items_event_id_index" ON "inventory_items" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "milestones_event_id_due_on_index" ON "milestones" USING btree ("event_id","due_on");--> statement-breakpoint
CREATE INDEX "od_lists_event_id_index" ON "od_lists" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "playbook_lessons_org_id_event_type_index" ON "playbook_lessons" USING btree ("org_id","event_type");--> statement-breakpoint
CREATE INDEX "whatif_runs_event_id_created_at_index" ON "whatif_runs" USING btree ("event_id","created_at");