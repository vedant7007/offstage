-- audit_log and domain_events are append-only.
-- 1. A trigger rejects UPDATE and DELETE for every role, including the owner.
--    TRUNCATE (used only by demo:reset, which connects as the owner) does not fire row triggers.
CREATE OR REPLACE FUNCTION sutradhar_reject_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION sutradhar_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER domain_events_append_only BEFORE UPDATE OR DELETE ON "domain_events"
  FOR EACH ROW EXECUTE FUNCTION sutradhar_reject_mutation();
--> statement-breakpoint

-- 2. The role the app and worker run as (DATABASE_APP_ROLE). It can read and write domain
--    tables but has no UPDATE, DELETE or TRUNCATE on the append-only tables, and cannot change the schema.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sutradhar_app') THEN
    CREATE ROLE sutradhar_app NOLOGIN;
  END IF;
END
$$;
--> statement-breakpoint
GRANT sutradhar_app TO CURRENT_USER;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO sutradhar_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sutradhar_app;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sutradhar_app;
--> statement-breakpoint
REVOKE UPDATE, DELETE, TRUNCATE ON "audit_log", "domain_events" FROM sutradhar_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sutradhar_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO sutradhar_app;
