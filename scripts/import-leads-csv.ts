import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const CSV_PATH = process.argv[2] ?? "C:/Users/vrimsaite/Desktop/email_leads_20260417_144823.csv";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row: Record<string, string> = {};
    header.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
}

function emptyToNull(v: string | undefined): string | null {
  if (!v) return null;
  const trimmed = v.trim();
  return trimmed.length === 0 ? null : trimmed;
}

async function main() {
  const csvPath = resolve(CSV_PATH);
  console.log(`Reading ${csvPath}`);
  const text = readFileSync(csvPath, "utf-8");
  const rows = parseCsv(text);
  console.log(`Parsed ${rows.length} rows from CSV`);

  const { data: existing, error: fetchErr } = await sb
    .from("leads")
    .select("id, email");
  if (fetchErr) {
    console.error("Failed to fetch existing leads:", fetchErr);
    process.exit(1);
  }
  const existingByEmail = new Map<string, string>();
  (existing ?? []).forEach((r) =>
    existingByEmail.set(r.email.toLowerCase(), r.id)
  );
  console.log(`Found ${existingByEmail.size} existing leads in Supabase`);

  const toInsert: Record<string, unknown>[] = [];
  const toPatch: { id: string; utm_term: string | null; utm_content: string | null }[] = [];
  const seenEmails = new Set<string>();
  let skippedDupInCsv = 0;

  for (const r of rows) {
    const email = (r.email ?? "").toLowerCase().trim();
    if (!email) continue;
    if (seenEmails.has(email)) {
      skippedDupInCsv++;
      continue;
    }
    seenEmails.add(email);

    const utm_term = emptyToNull(r.utmTerm);
    const utm_content = emptyToNull(r.utmContent);
    const existingId = existingByEmail.get(email);

    if (existingId) {
      if (utm_term || utm_content) {
        toPatch.push({ id: existingId, utm_term, utm_content });
      }
    } else {
      toInsert.push({
        name: emptyToNull(r.name),
        email,
        phone: null,
        source: emptyToNull(r.source) ?? "exitreadiness",
        utm_source: emptyToNull(r.utmSource),
        utm_medium: emptyToNull(r.utmMedium),
        utm_campaign: emptyToNull(r.utmCampaign),
        utm_term,
        utm_content,
        status: "lead",
        brevo_list_id: 1,
        created_at: emptyToNull(r.createdAt) ?? new Date().toISOString(),
      });
    }
  }

  console.log(`\nPlanned:`);
  console.log(`  Inserts (new emails):    ${toInsert.length}`);
  console.log(`  Patches (backfill UTMs): ${toPatch.length}`);
  console.log(`  Skipped (dup in CSV):    ${skippedDupInCsv}`);

  if (toInsert.length > 0) {
    const { error } = await sb.from("leads").insert(toInsert);
    if (error) {
      console.error("Insert failed:", error);
      process.exit(1);
    }
    console.log(`✓ Inserted ${toInsert.length} new leads`);
  }

  let patched = 0;
  for (const p of toPatch) {
    const patch: Record<string, unknown> = {};
    if (p.utm_term !== null) patch.utm_term = p.utm_term;
    if (p.utm_content !== null) patch.utm_content = p.utm_content;
    if (Object.keys(patch).length === 0) continue;
    const { error } = await sb.from("leads").update(patch).eq("id", p.id);
    if (error) {
      console.error(`Patch failed for id=${p.id}:`, error);
      continue;
    }
    patched++;
  }
  if (toPatch.length > 0) {
    console.log(`✓ Backfilled UTM term/content on ${patched}/${toPatch.length} existing leads`);
  }

  const { count } = await sb
    .from("leads")
    .select("*", { count: "exact", head: true });
  console.log(`\nLeads table total row count: ${count}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
