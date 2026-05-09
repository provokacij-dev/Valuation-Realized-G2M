-- Migration: Cache the brief sales-call summary + next steps extracted from
-- a name-matched Drive doc, so the drawer doesn't re-run Claude on every
-- expand. Run this in Supabase SQL Editor BEFORE merging the corresponding PR.
-- Idempotent (uses IF NOT EXISTS) so safe to re-run.

ALTER TABLE engagements
  ADD COLUMN IF NOT EXISTS doc_summary    text,
  ADD COLUMN IF NOT EXISTS doc_next_steps text;
