import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const STATUS_PRIORITY: Record<string, number> = {
  converted: 6,
  completed: 5,
  booked: 4,
  transcript_pending: 3,
  transcript_failed: 2,
  unmatched: 1,
  lost: 0,
};

type EngagementRow = {
  id: string;
  email: string;
  scheduled_at: string | null;
  status: string;
  created_at: string;
  [k: string]: unknown;
};

function richness(r: EngagementRow): number {
  return Object.entries(r).reduce((n, [k, v]) => {
    if (k === "id" || k === "created_at" || k === "updated_at") return n;
    return n + (v !== null && v !== undefined && v !== "" ? 1 : 0);
  }, 0);
}

function pickKeeper(rows: EngagementRow[]): EngagementRow {
  return rows.slice().sort((a, b) => {
    const dr = richness(b) - richness(a);
    if (dr !== 0) return dr;
    const ds = (STATUS_PRIORITY[b.status] ?? -1) - (STATUS_PRIORITY[a.status] ?? -1);
    if (ds !== 0) return ds;
    return a.created_at.localeCompare(b.created_at);
  })[0];
}

async function main() {
  const { data, error } = await sb.from("engagements").select("*");
  if (error) {
    console.error(error);
    process.exit(1);
  }
  const rows = (data ?? []) as EngagementRow[];
  console.log(`Loaded ${rows.length} engagement rows`);

  const groups = new Map<string, EngagementRow[]>();
  for (const r of rows) {
    if (!r.scheduled_at) continue;
    const key = `${r.email.toLowerCase()}|${r.scheduled_at}`;
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }

  const toDelete: string[] = [];
  let kept = 0;
  for (const [key, groupRows] of groups) {
    if (groupRows.length <= 1) {
      kept++;
      continue;
    }
    const keeper = pickKeeper(groupRows);
    kept++;
    for (const r of groupRows) {
      if (r.id !== keeper.id) toDelete.push(r.id);
    }
    console.log(
      `  ${key}: kept ${keeper.id} (${keeper.status}, richness=${richness(keeper)}), deleting ${groupRows.length - 1}`
    );
  }

  const nullGroup = rows.filter((r) => !r.scheduled_at);
  console.log(`\nSummary:`);
  console.log(`  Groups with scheduled_at: ${groups.size} (keeping ${kept})`);
  console.log(`  Rows with NULL scheduled_at (left alone): ${nullGroup.length}`);
  console.log(`  Rows to delete: ${toDelete.length}`);

  if (toDelete.length === 0) {
    console.log("Nothing to delete.");
    return;
  }

  const { error: delErr } = await sb.from("engagements").delete().in("id", toDelete);
  if (delErr) {
    console.error("Delete failed:", delErr);
    process.exit(1);
  }
  console.log(`\n✓ Deleted ${toDelete.length} duplicate rows`);

  const { count } = await sb
    .from("engagements")
    .select("*", { count: "exact", head: true });
  console.log(`Final engagement row count: ${count}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
