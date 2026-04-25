-- Migration: Add post-call sales analysis fields to engagements
-- Run this in Supabase SQL Editor BEFORE merging the corresponding PR.
-- Idempotent (uses IF NOT EXISTS) so safe to re-run.

ALTER TABLE engagements
  ADD COLUMN IF NOT EXISTS sales_call_doc_url    text,
  ADD COLUMN IF NOT EXISTS sales_call_doc_id     text,
  ADD COLUMN IF NOT EXISTS sector                text,
  ADD COLUMN IF NOT EXISTS geography             text,
  ADD COLUMN IF NOT EXISTS last_revenue          text,
  ADD COLUMN IF NOT EXISTS last_profit           text,
  ADD COLUMN IF NOT EXISTS indicative_valuation  text,
  ADD COLUMN IF NOT EXISTS business_summary      text,
  ADD COLUMN IF NOT EXISTS pain_point            text,
  ADD COLUMN IF NOT EXISTS outcome_verdict       text,
  ADD COLUMN IF NOT EXISTS outcome_rationale     text,
  ADD COLUMN IF NOT EXISTS call_strengths        text,
  ADD COLUMN IF NOT EXISTS call_improvements     text;
