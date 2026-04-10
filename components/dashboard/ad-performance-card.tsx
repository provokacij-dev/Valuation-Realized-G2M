import type { AdSummary } from "@/types";

const BADGE_STYLES: Record<string, string> = {
  SCALE: "bg-green-100 text-green-800 border border-green-200",
  MAINTAIN: "bg-gray-100 text-gray-700 border border-gray-200",
  KILL: "bg-red-100 text-red-800 border border-red-200",
  "TEST VARIANT": "bg-amber-100 text-amber-800 border border-amber-200",
};

interface Props {
  ad: AdSummary;
}

function fmt(n: number, prefix = "", suffix = "", decimals = 0) {
  if (!n && n !== 0) return "—";
  return `${prefix}${n.toLocaleString("en-US", { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}${suffix}`;
}

function fmtEur(n: number) { return n > 0 ? fmt(n, "€", "", 0) : "—"; }
function fmtPct(n: number) { return n > 0 ? fmt(n, "", "%", 1) : "—"; }

export default function AdPerformanceCard({ ad }: Props) {
  const badgeStyle = BADGE_STYLES[ad.recommendation] || BADGE_STYLES.MAINTAIN;
  const highFrequency = ad.frequency > 3.5;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col gap-4 hover:shadow-md transition-shadow">

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-vr-green text-sm leading-snug truncate" title={ad.ad_name}>
            {ad.ad_name || "—"}
          </p>
          <p className="text-xs text-gray-400 mt-0.5 truncate">{ad.campaign_name}</p>
        </div>
        <span className={`shrink-0 text-xs font-semibold px-2 py-1 rounded-full ${badgeStyle}`}>
          {ad.recommendation}
        </span>
      </div>

      {/* Alert */}
      {ad.alert && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          <span className="text-red-500 text-sm mt-0.5">⚠</span>
          <p className="text-xs text-red-700">{ad.alert_reason || ad.alert}</p>
        </div>
      )}

      {/* AD PERFORMANCE */}
      <Section label="Ad Performance">
        <Row label="Spend"       value={fmtEur(ad.total_spend)} />
        <Row label="Impressions" value={fmt(ad.impressions)} />
        <Row label="Clicks"      value={fmt(ad.clicks)} />
        <Row label="CTR"         value={fmtPct(ad.avg_ctr)} />
        <Row label="CPC"         value={fmtEur(ad.avg_cpc)} />
        <Row label="CPM"         value={fmtEur(ad.avg_cpm)} />
        <Row
          label="Frequency"
          value={ad.frequency > 0 ? ad.frequency.toFixed(1) : "—"}
          warn={highFrequency}
          warnText="audience fatigue"
        />
      </Section>

      {/* FUNNEL */}
      <Section label="Funnel">
        <Row label="CTA / video clicks" value={fmt(ad.cta_video_clicks)} />
        <Row label="Emails captured"    value={fmt(ad.emails_captured)} />
        <Row label="Click→Email rate"   value={fmtPct(ad.click_email_rate)} />
        <Row label="Cost per lead"      value={fmtEur(ad.cost_per_lead)} />
      </Section>

      {/* CALLS */}
      <Section label="Calls">
        <Row label="Book call clicked"      value={fmt(ad.book_call_clicked)} />
        <Row label="Calls booked"           value={fmt(ad.calls_booked)} />
        <Row label="No-shows"               value={fmt(ad.no_shows)} />
        <Row label="Show-ups"               value={fmt(ad.show_ups)} />
        <Row label="Show-up rate"           value={fmtPct(ad.show_up_rate)} />
        <Row label="Email→Call rate"        value={fmtPct(ad.email_call_rate)} />
        <Row label="Cost / booked call"     value={fmtEur(ad.cost_per_booked_call)} />
        <Row label="Cost / actual call"     value={fmtEur(ad.cost_per_actual_call)} />
      </Section>

      {/* REVENUE */}
      <Section label="Revenue">
        <Row label="Proposals sent"       value={fmt(ad.proposals_sent)} />
        <Row label="Deals closed"         value={fmt(ad.deals_closed)} />
        <Row label="Revenue"              value={fmtEur(ad.revenue)} />
        <Row label="Cost / closed deal"   value={fmtEur(ad.cost_per_closed_deal)} />
      </Section>

      {/* Reasoning — expandable */}
      {ad.recommendation_reasoning && (
        <details className="text-xs text-gray-500 cursor-pointer group">
          <summary className="text-vr-gold font-medium list-none flex items-center gap-1 cursor-pointer">
            <span className="group-open:rotate-90 transition-transform inline-block">›</span>
            Why {ad.recommendation}
          </summary>
          <p className="mt-2 leading-relaxed text-gray-600 pl-3 border-l-2 border-gray-100">
            {ad.recommendation_reasoning}
          </p>
        </details>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-gray-50 pt-3">
        <span
          className={`text-xs px-2 py-0.5 rounded-full ${
            ad.status === "active"
              ? "bg-green-50 text-green-700"
              : ad.status === "paused"
              ? "bg-amber-50 text-amber-700"
              : "bg-gray-100 text-gray-500"
          }`}
        >
          {ad.status}
        </span>
        <span className="text-xs text-gray-400 truncate ml-2">{ad.adset_name}</span>
      </div>
    </div>
  );
}

/* ── Helpers ─────────────────────────────────────────────── */

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details open className="group">
      <summary className="flex items-center gap-1.5 cursor-pointer list-none mb-1.5">
        <span className="group-open:rotate-90 transition-transform inline-block text-gray-400 text-xs">›</span>
        <span className="text-[10px] font-semibold tracking-widest uppercase text-gray-400">{label}</span>
      </summary>
      <div className="space-y-1 pl-2">{children}</div>
    </details>
  );
}

function Row({
  label,
  value,
  warn,
  warnText,
}: {
  label: string;
  value: string;
  warn?: boolean;
  warnText?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-gray-400 shrink-0">{label}</span>
      <span className={`text-xs font-semibold ${warn ? "text-amber-600" : "text-vr-green"} text-right`}>
        {value}
        {warn && warnText && <span className="font-normal text-amber-500 ml-1">⚠ {warnText}</span>}
      </span>
    </div>
  );
}
