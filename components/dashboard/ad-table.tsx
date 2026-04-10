"use client";

import { Fragment, useState } from "react";
import type { AdSummary } from "@/types";

type GroupBy = "none" | "campaign" | "adset";
type SortDir = "asc" | "desc";

interface ColDef {
  key: keyof AdSummary;
  label: string;
  fmt: (v: number) => string;
  warn?: (v: number) => boolean;
}

interface Section {
  label: string;
  bg: string;
  cols: ColDef[];
}

const SECTIONS: Section[] = [
  {
    label: "AD PERFORMANCE",
    bg: "#1e3a5f",
    cols: [
      { key: "total_spend",  label: "Spend (€)",    fmt: (v) => v > 0 ? `€${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—" },
      { key: "impressions",  label: "Impressions",   fmt: (v) => v > 0 ? v.toLocaleString("en-US") : "—" },
      { key: "clicks",       label: "Clicks",        fmt: (v) => v > 0 ? v.toLocaleString("en-US") : "—" },
      { key: "avg_ctr",      label: "CTR (%)",       fmt: (v) => v > 0 ? `${v.toFixed(2)}%` : "—" },
      { key: "avg_cpc",      label: "CPC (€)",       fmt: (v) => v > 0 ? `€${v.toFixed(2)}` : "—" },
      { key: "avg_cpm",      label: "CPM (€)",       fmt: (v) => v > 0 ? `€${v.toFixed(2)}` : "—" },
      { key: "frequency",    label: "Frequency",     fmt: (v) => v > 0 ? v.toFixed(2) : "—", warn: (v) => v > 3.5 },
    ],
  },
  {
    label: "FUNNEL",
    bg: "#1a5c3a",
    cols: [
      { key: "cta_video_clicks", label: "CTA Clicks",     fmt: (v) => v > 0 ? v.toLocaleString("en-US") : "—" },
      { key: "emails_captured",  label: "Emails",         fmt: (v) => v > 0 ? v.toLocaleString("en-US") : "—" },
      { key: "click_email_rate", label: "Click→Email %",  fmt: (v) => v > 0 ? `${v.toFixed(1)}%` : "—" },
      { key: "cost_per_lead",    label: "CPL (€)",        fmt: (v) => v > 0 ? `€${v.toFixed(2)}` : "—" },
    ],
  },
  {
    label: "CALLS",
    bg: "#1a5c3a",
    cols: [
      { key: "calls_booked",          label: "Booked",         fmt: (v) => String(v || 0) },
      { key: "no_shows",              label: "No-Shows",       fmt: (v) => String(v || 0) },
      { key: "show_ups",              label: "Show-Ups",       fmt: (v) => String(v || 0) },
      { key: "show_up_rate",          label: "Show-Up %",      fmt: (v) => v > 0 ? `${v.toFixed(1)}%` : "—" },
      { key: "email_call_rate",       label: "Email→Call %",   fmt: (v) => v > 0 ? `${v.toFixed(1)}%` : "—" },
      { key: "cost_per_booked_call",  label: "€/Booked",       fmt: (v) => v > 0 ? `€${v.toFixed(0)}` : "—" },
      { key: "cost_per_actual_call",  label: "€/Actual",       fmt: (v) => v > 0 ? `€${v.toFixed(0)}` : "—" },
    ],
  },
  {
    label: "REVENUE",
    bg: "#5c3a1a",
    cols: [
      { key: "proposals_sent",      label: "Proposals",   fmt: (v) => String(v || 0) },
      { key: "deals_closed",        label: "Deals",       fmt: (v) => String(v || 0) },
      { key: "revenue",             label: "Revenue (€)", fmt: (v) => v > 0 ? `€${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—" },
      { key: "cost_per_closed_deal",label: "€/Deal",      fmt: (v) => v > 0 ? `€${v.toFixed(0)}` : "—" },
    ],
  },
];

const ALL_COLS = SECTIONS.flatMap((s) => s.cols);

const BADGE: Record<string, string> = {
  SCALE: "bg-green-100 text-green-800",
  MAINTAIN: "bg-gray-100 text-gray-600",
  KILL: "bg-red-100 text-red-700",
  "TEST VARIANT": "bg-amber-100 text-amber-700",
};

interface Props {
  ads: AdSummary[];
}

function sumCol(ads: AdSummary[], key: keyof AdSummary): number {
  return ads.reduce((s, a) => s + ((a[key] as number) || 0), 0);
}

function avgCol(ads: AdSummary[], key: keyof AdSummary): number {
  const vals = ads.filter((a) => ((a[key] as number) || 0) > 0);
  if (!vals.length) return 0;
  return vals.reduce((s, a) => s + ((a[key] as number) || 0), 0) / vals.length;
}

// For rate/percentage columns, use average; for counts/money, use sum
const RATE_KEYS = new Set<keyof AdSummary>([
  "avg_ctr", "avg_cpc", "avg_cpm", "frequency",
  "click_email_rate", "cost_per_lead",
  "show_up_rate", "email_call_rate", "cost_per_booked_call", "cost_per_actual_call",
  "cost_per_closed_deal",
]);

function aggregateCol(ads: AdSummary[], key: keyof AdSummary): number {
  return RATE_KEYS.has(key) ? avgCol(ads, key) : sumCol(ads, key);
}

export default function AdTable({ ads }: Props) {
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [sortKey, setSortKey] = useState<keyof AdSummary>("total_spend");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function handleSort(key: keyof AdSummary) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function sortedAds(list: AdSummary[]) {
    return [...list].sort((a, b) => {
      const av = (a[sortKey] as number) ?? 0;
      const bv = (b[sortKey] as number) ?? 0;
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }

  // Build rows
  const groups: { label: string; ads: AdSummary[] }[] = [];

  if (groupBy === "none") {
    groups.push({ label: "", ads: sortedAds(ads) });
  } else {
    const key = groupBy === "campaign" ? "campaign_name" : "adset_name";
    const map = new Map<string, AdSummary[]>();
    for (const ad of ads) {
      const g = (ad[key] as string) || "Unknown";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(ad);
    }
    for (const [label, list] of map) {
      groups.push({ label, ads: sortedAds(list) });
    }
    groups.sort((a, b) =>
      sumCol(b.ads, "total_spend") - sumCol(a.ads, "total_spend")
    );
  }

  const totalCols = ALL_COLS.length;

  return (
    <div>
      {/* Group toggle */}
      <div className="flex items-center gap-2 mb-4 text-xs">
        <span className="text-gray-400">Group by:</span>
        {(["none", "campaign", "adset"] as GroupBy[]).map((g) => (
          <button
            key={g}
            onClick={() => setGroupBy(g)}
            className={`px-3 py-1.5 rounded-full border font-medium transition-colors ${
              groupBy === g
                ? "bg-vr-green text-white border-vr-green"
                : "bg-white text-gray-600 border-gray-200 hover:border-vr-green hover:text-vr-green"
            }`}
          >
            {g === "none" ? "None" : g === "campaign" ? "Campaign" : "Ad Set"}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-sm">
        <table className="text-xs border-collapse min-w-max w-full">
          <thead>
            {/* Section headers */}
            <tr>
              <th
                className="sticky left-0 z-20 bg-[#1a2e1a] text-white px-4 py-2 text-left font-semibold min-w-[200px]"
                rowSpan={2}
              >
                Ad
              </th>
              {SECTIONS.map((s) => (
                <th
                  key={s.label}
                  colSpan={s.cols.length}
                  className="text-white text-center py-2 px-2 font-semibold tracking-wider text-[10px] uppercase border-l border-white/20"
                  style={{ backgroundColor: s.bg }}
                >
                  {s.label}
                </th>
              ))}
              <th
                className="bg-gray-700 text-white text-center py-2 px-2 font-semibold tracking-wider text-[10px] uppercase border-l border-white/20"
                rowSpan={2}
              >
                Signal
              </th>
            </tr>

            {/* Column headers */}
            <tr>
              {SECTIONS.map((s) =>
                s.cols.map((col, i) => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    className="text-white text-center px-3 py-1.5 cursor-pointer select-none whitespace-nowrap border-l border-white/10 hover:opacity-80"
                    style={{ backgroundColor: s.bg }}
                  >
                    {col.label}
                    {sortKey === col.key && (
                      <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>
                    )}
                  </th>
                ))
              )}
            </tr>
          </thead>

          <tbody>
            {groups.map(({ label, ads: groupAds }) => (
              <Fragment key={label || "all"}>
                {/* Group header row */}
                {groupBy !== "none" && (
                  <tr key={`group-${label}`} className="bg-gray-50 border-t-2 border-gray-200">
                    <td className="sticky left-0 z-10 bg-gray-50 px-4 py-2 font-semibold text-vr-green">
                      {label}
                      <span className="ml-2 text-gray-400 font-normal">({groupAds.length} ads)</span>
                    </td>
                    {ALL_COLS.map((col) => {
                      const v = aggregateCol(groupAds, col.key);
                      return (
                        <td key={col.key} className="px-3 py-2 text-center font-semibold text-gray-700 border-l border-gray-100">
                          {col.fmt(v)}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 border-l border-gray-100" />
                  </tr>
                )}

                {/* Ad rows */}
                {groupAds.map((ad) => (
                  <tr
                    key={ad.ad_id}
                    className="border-t border-gray-50 hover:bg-gray-50/60 transition-colors"
                  >
                    {/* Frozen ad name cell */}
                    <td className="sticky left-0 z-10 bg-white px-4 py-2.5 min-w-[200px] border-r border-gray-100">
                      <p className="font-medium text-vr-green leading-snug truncate max-w-[180px]" title={ad.ad_name}>
                        {ad.ad_name || "—"}
                      </p>
                      {groupBy === "none" && (
                        <p className="text-gray-400 text-[10px] truncate max-w-[180px]">{ad.campaign_name}</p>
                      )}
                      {ad.alert && (
                        <span className="text-[10px] text-red-600">⚠ {ad.alert}</span>
                      )}
                    </td>

                    {/* Metric cells */}
                    {ALL_COLS.map((col) => {
                      const v = (ad[col.key] as number) ?? 0;
                      const isWarn = col.warn?.(v);
                      return (
                        <td
                          key={col.key}
                          className={`px-3 py-2.5 text-center tabular-nums border-l border-gray-50 ${
                            isWarn ? "text-amber-600 font-semibold" : "text-gray-700"
                          } ${col.key === sortKey ? "bg-vr-green/5" : ""}`}
                        >
                          {col.fmt(v)}
                        </td>
                      );
                    })}

                    {/* Signal/recommendation */}
                    <td className="px-3 py-2.5 text-center border-l border-gray-100">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${BADGE[ad.recommendation] || BADGE.MAINTAIN}`}>
                        {ad.recommendation}
                      </span>
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
