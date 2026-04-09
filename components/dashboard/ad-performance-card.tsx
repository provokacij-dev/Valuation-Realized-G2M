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

export default function AdPerformanceCard({ ad }: Props) {
  const badgeStyle = BADGE_STYLES[ad.recommendation] || BADGE_STYLES.MAINTAIN;
  const highFrequency = ad.frequency > 3.5;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col gap-4 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-vr-green text-sm leading-snug truncate">
            {ad.ad_name}
          </p>
          <p className="text-xs text-gray-400 mt-0.5 truncate">{ad.campaign_name}</p>
        </div>
        <span
          className={`shrink-0 text-xs font-semibold px-2 py-1 rounded-full ${badgeStyle}`}
        >
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

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2">
        <StatPill label="Spend" value={`$${ad.total_spend.toFixed(0)}`} />
        <StatPill label="Leads" value={String(ad.total_leads)} />
        <StatPill
          label="CPL"
          value={ad.avg_cpl > 0 ? `$${ad.avg_cpl.toFixed(0)}` : "—"}
        />
        <StatPill label="CTR" value={`${ad.avg_ctr.toFixed(2)}%`} />
        <StatPill label="Bookings" value={String(ad.total_bookings)} />
        <StatPill
          label="Book rate"
          value={ad.booking_rate > 0 ? `${ad.booking_rate.toFixed(1)}%` : "—"}
        />
      </div>

      {/* Frequency */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-500">Frequency:</span>
        <span
          className={`text-xs font-medium ${
            highFrequency ? "text-amber-600" : "text-gray-700"
          }`}
        >
          {ad.frequency.toFixed(1)}
          {highFrequency && " ⚠"}
        </span>
        {highFrequency && (
          <span className="text-xs text-amber-600">— audience fatigue risk</span>
        )}
      </div>

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

      {/* Status */}
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
        <span className="text-xs text-gray-400">{ad.adset_name}</span>
      </div>
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-lg px-2.5 py-2 text-center">
      <p className="text-xs text-gray-400 leading-none mb-1">{label}</p>
      <p className="text-sm font-semibold text-vr-green">{value}</p>
    </div>
  );
}
