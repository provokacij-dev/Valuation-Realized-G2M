/**
 * One-time migration script: local JSON files → Supabase
 *
 * Run ONCE locally before first Vercel deploy:
 *   bun run scripts/migrate-local-to-supabase.ts
 *
 * After a successful run, local JSON files become read-only backups.
 * The app reads exclusively from Supabase after this.
 */

import { createClient } from "@supabase/supabase-js";
import { promises as fs } from "fs";
import path from "path";

// Bun loads .env.local automatically — no dotenv needed

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const ROOT = process.cwd();

async function readJSON<T>(file: string): Promise<T[]> {
  try {
    const text = await fs.readFile(path.join(ROOT, file), "utf-8");
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.warn(`  ⚠️  ${file} not found or empty — skipping`);
    return [];
  }
}

async function migrateSkills() {
  console.log("\n📚 Migrating skills.json → skills table");
  const skills = await readJSON<Record<string, unknown>>("skills.json");
  if (skills.length === 0) { console.log("  Nothing to migrate"); return; }

  const { error } = await supabase
    .from("skills")
    .upsert(skills, { onConflict: "rule_id" });

  if (error) { console.error("  ❌ Error:", error.message); return; }

  const { count } = await supabase.from("skills").select("*", { count: "exact", head: true });
  console.log(`  ✅ ${skills.length} local → ${count} in Supabase`);
}

async function migrateQueue() {
  console.log("\n📋 Migrating queue.json → queue table");
  const queue = await readJSON<Record<string, unknown>>("queue.json");
  if (queue.length === 0) { console.log("  Nothing to migrate"); return; }

  // Upsert in batches of 50 (large SVG data)
  const BATCH = 50;
  let inserted = 0;
  for (let i = 0; i < queue.length; i += BATCH) {
    const batch = queue.slice(i, i + BATCH).map((ad) => ({
      id: ad.id,
      primary_text: ad.primary_text ?? null,
      headline_a: ad.headline_a ?? null,
      headline_b: ad.headline_b ?? null,
      headline_c: ad.headline_c ?? null,
      description: ad.description ?? null,
      image_direction: ad.image_direction ?? null,
      adset_tag: ad.adset_tag ?? null,
      rationale: ad.rationale ?? null,
      svg_prompt: ad.svg_prompt ?? null,
      svg: ad.svg ?? null,
      source_image_url: ad.sourceImageUrl ?? null,
      status: ad.status ?? "approved",
    }));
    const { error } = await supabase.from("queue").upsert(batch, { onConflict: "id" });
    if (error) { console.error(`  ❌ Batch ${i}–${i + BATCH} error:`, error.message); }
    else { inserted += batch.length; process.stdout.write(`.`); }
  }

  const { count } = await supabase.from("queue").select("*", { count: "exact", head: true });
  console.log(`\n  ✅ ${inserted} local → ${count} in Supabase`);
}

async function migrateDrafts() {
  console.log("\n📝 Migrating drafts.json → drafts table");
  const drafts = await readJSON<Record<string, unknown>>("drafts.json");
  if (drafts.length === 0) { console.log("  Nothing to migrate"); return; }

  const now = new Date().toISOString();
  const rows = drafts.map((ad) => ({
    id: ad.id as string,
    data: ad,
    updated_at: now,
  }));

  const { error } = await supabase.from("drafts").upsert(rows, { onConflict: "id" });
  if (error) { console.error("  ❌ Error:", error.message); return; }

  const { count } = await supabase.from("drafts").select("*", { count: "exact", head: true });
  console.log(`  ✅ ${drafts.length} local → ${count} in Supabase`);
}

async function main() {
  console.log("🚀 VR Ads Platform — local JSON → Supabase migration");
  console.log(`   Target: ${process.env.SUPABASE_URL}`);

  await migrateSkills();
  await migrateQueue();
  await migrateDrafts();

  console.log("\n✅ Migration complete. Verify row counts above match your local files.");
  console.log("   Local JSON files are now backup-only. The app reads from Supabase.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
