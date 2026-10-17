-- usage_ledger is append-only (AGENTS.md invariant 1): reject UPDATE and DELETE.
CREATE FUNCTION usage_ledger_reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'usage_ledger is append-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER usage_ledger_append_only
  BEFORE UPDATE OR DELETE ON usage_ledger
  FOR EACH ROW EXECUTE FUNCTION usage_ledger_reject_mutation();
--> statement-breakpoint
CREATE TRIGGER usage_ledger_no_truncate
  BEFORE TRUNCATE ON usage_ledger
  FOR EACH STATEMENT EXECUTE FUNCTION usage_ledger_reject_mutation();
