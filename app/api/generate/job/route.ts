import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get("id");
  if (!jobId) return NextResponse.json({ error: "Missing job id" }, { status: 400 });

  const { data, error } = await supabase
    .from("generation_jobs")
    .select("id, status, ads, skill_updates, error")
    .eq("id", jobId)
    .single();

  if (error || !data) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  return NextResponse.json(data);
}
