export interface AdSummary {
  // Identity
  ad_id: string;
  ad_name: string;
  campaign_name: string;
  adset_name: string;
  period: string;
  status: "active" | "paused" | "killed";

  // AD PERFORMANCE
  total_spend: number;       // Ad Spend (€)
  impressions: number;
  clicks: number;
  avg_ctr: number;           // CTR (%)
  avg_cpc: number;           // CPC (€)
  avg_cpm: number;           // CPM (€)
  frequency: number;

  // FUNNEL
  cta_video_clicks: number;  // CTA or video Clicks
  emails_captured: number;   // Emails Captured
  click_email_rate: number;  // Click→Email Rate (%)
  cost_per_lead: number;     // Cost per Lead (€)

  // CALLS
  book_call_clicked: number;
  calls_booked: number;
  no_shows: number;
  show_ups: number;
  show_up_rate: number;           // Show-up Rate (%)
  email_call_rate: number;        // Email→Call Rate (%)
  cost_per_booked_call: number;
  cost_per_actual_call: number;

  // REVENUE
  proposals_sent: number;
  deals_closed: number;
  revenue: number;
  cost_per_closed_deal: number;

  // Analysis
  recommendation: "SCALE" | "MAINTAIN" | "KILL" | "TEST VARIANT";
  recommendation_reasoning: string;
  alert?: string;
  alert_reason?: string;

  // Legacy aliases (kept for filter-bar / sort compatibility)
  total_leads: number;       // = emails_captured
  avg_cpl: number;           // = cost_per_lead
  total_bookings: number;    // = calls_booked
  booking_rate: number;      // = show_up_rate
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

export type LeadStatus = "lead" | "correspondence" | "call_booked" | "disqualified";

export interface Lead {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  source: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  status: LeadStatus;
  brevo_list_id: number | null;
  created_at: string;
}

export type EngagementFunnelStatus =
  | "call_booked"
  | "no_show"
  | "won"
  | "proposal_sent"
  | "lost"
  | "disqualified";

export type OutcomeVerdict = "win" | "potential_win" | "likely_loss" | "loss";

export interface Engagement {
  id: string;
  name: string | null;
  email: string;
  scheduled_at: string | null;
  // Internal pipeline state, driven by the Zoom webhook and analyse endpoint.
  // Not edited from the UI.
  status: "booked" | "completed" | "converted" | "lost" | "unmatched" | "transcript_pending" | "transcript_failed";
  // User-facing sales funnel stage, editable via the pipeline UI dropdown.
  funnel_status: EngagementFunnelStatus;
  utm_term: string | null;
  utm_content: string | null;
  research: string | null;
  fit_score: number | null;
  fit_reasoning: string | null;
  likely_objection: string | null;
  meeting_angle: string | null;
  brief_doc_url: string | null;
  brief_doc_id: string | null;
  // Legacy 31-category Zoom analysis. Replaced by sales-call fields below;
  // kept on the type only because historical rows still have these populated.
  zoom_score: number | null;
  zoom_analysis: ZoomAnalysisCategory[] | null;
  zoom_meeting_id: string | null;
  transcript_url: string | null;
  // Post-call sales analysis (PR 4): the new flow creates a separate doc
  // in the Sales calls Drive folder rather than appending to the brief doc.
  sales_call_doc_url: string | null;
  sales_call_doc_id: string | null;
  sector: string | null;
  geography: string | null;
  last_revenue: string | null;
  last_profit: string | null;
  indicative_valuation: string | null;
  business_summary: string | null;
  pain_point: string | null;
  outcome_verdict: OutcomeVerdict | null;
  outcome_rationale: string | null;
  call_strengths: string | null;
  call_improvements: string | null;
  created_at: string;
  updated_at: string;
}

export type PipelineStatus = LeadStatus | EngagementFunnelStatus;

export interface PipelineRow {
  source: "lead" | "engagement";
  source_id: string;
  name: string | null;
  email: string;
  status: PipelineStatus;
  utm_term: string | null;
  utm_content: string | null;
  created_at: string;
  // engagement-only (null for lead rows)
  scheduled_at: string | null;
  fit_score: number | null;
  fit_reasoning: string | null;
  likely_objection: string | null;
  meeting_angle: string | null;
  brief_doc_url: string | null;
  zoom_score: number | null;
  zoom_analysis: ZoomAnalysisCategory[] | null;
  research: string | null;
  engagement_status: Engagement["status"] | null;
  transcript_url: string | null;
  // Post-call sales analysis (PR 4)
  sales_call_doc_url: string | null;
  sector: string | null;
  geography: string | null;
  last_revenue: string | null;
  last_profit: string | null;
  indicative_valuation: string | null;
  business_summary: string | null;
  pain_point: string | null;
  outcome_verdict: OutcomeVerdict | null;
  outcome_rationale: string | null;
  call_strengths: string | null;
  call_improvements: string | null;
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
