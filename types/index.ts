export interface AdSummary {
  ad_id: string;
  ad_name: string;
  campaign_name: string;
  adset_name: string;
  total_spend: number;
  total_leads: number;
  avg_cpl: number;
  avg_ctr: number;
  total_bookings: number;
  booking_rate: number;
  frequency: number;
  recommendation: "SCALE" | "MAINTAIN" | "KILL" | "TEST VARIANT";
  recommendation_reasoning: string;
  alert?: string;
  alert_reason?: string;
  status: "active" | "paused" | "killed";
}

export interface Rule {
  rule_id: string;
  week: string;
  creative_type: string;
  hook_angle: string;
  geo: string;
  cpl: number;
  ctr: number;
  booking_rate: number;
  signal: "WINNER" | "KILL" | "TEST";
  rule_extracted: string;
}

export interface Skill {
  rule_id: string;
  category: "Copy" | "Visual" | "GCC" | "Audience" | "Format" | "Never-do";
  instruction: string;
  status: "active" | "archived";
  added_date: string;
  modified_date: string;
  source: string;
  evidence: string;
}

export interface Booking {
  timestamp: string;
  name: string;
  email: string;
  utm_source: string;
  utm_campaign: string;
  utm_content: string;
  utm_medium: string;
}

export interface GeneratedAd {
  id: string;
  primary_text: string;
  headline_a: string;
  headline_b: string;
  headline_c: string;
  description: string;
  image_direction: string;
  adset_tag: string;
  rationale: string;
  svg_prompt: string;
  svg?: string;
  sourceImageUrl?: string; // object URL for image-uploaded ads
  status: "pending" | "approved" | "change_requested";
  previousVersion?: Omit<GeneratedAd, "previousVersion">;
}

export interface SkillUpdateProposal {
  type: "NEW" | "AMEND" | "REVIEW";
  rule_id?: string;
  category: string;
  proposed_instruction: string;
  current_instruction?: string;
  evidence: string;
}

export interface Brief {
  hookType: string;
  targetAudience: string;
  variantCount: number;
  additionalInstruction: string;
}

export interface Lead {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  source: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  status: "new" | "contacted" | "qualified" | "disqualified";
  brevo_list_id: number | null;
  created_at: string;
}

export interface Engagement {
  id: string;
  name: string | null;
  email: string;
  scheduled_at: string | null;
  status: "booked" | "completed" | "converted" | "lost" | "unmatched" | "transcript_pending" | "transcript_failed";
  research: string | null;
  fit_score: number | null;
  fit_reasoning: string | null;
  likely_objection: string | null;
  meeting_angle: string | null;
  brief_doc_url: string | null;
  brief_doc_id: string | null;
  zoom_score: number | null;
  zoom_analysis: ZoomAnalysisCategory[] | null;
  transcript_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ZoomAnalysisCategory {
  category: string;
  score: number; // 1–5
  notes: string;
}

export interface BriefTemplate {
  id: string;
  name: string;
  hook_type: string | null;
  target_audience: string | null;
  variant_count: number;
  additional_instruction: string | null;
  created_at: string;
}

export interface PendingSkillProposal {
  id: string;
  type: "NEW" | "AMEND" | "REVIEW";
  rule_id: string | null;
  category: string;
  proposed_instruction: string;
  current_instruction: string | null;
  evidence: string | null;
  status: "pending" | "accepted" | "dismissed";
  created_at: string;
}
