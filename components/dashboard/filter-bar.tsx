"use client";

import type { AdSummary } from "@/types";

type FilterType = "All" | "SCALE" | "MAINTAIN" | "KILL" | "TEST VARIANT" | "Flagged";
type SortType = "cpl_asc" | "leads_desc" | "booking_desc" | "spend_desc";

interface Props {
  filter: FilterType;
  sort: SortType;
  onFilterChange: (f: FilterType) => void;
  onSortChange: (s: SortType) => void;
  count: number;
}

const FILTERS: FilterType[] = ["All", "SCALE", "MAINTAIN", "KILL", "TEST VARIANT", "Flagged"];

export default function FilterBar({ filter, sort, onFilterChange, onSortChange, count }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3 mb-6">
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => onFilterChange(f)}
            className={`text-xs px-3 py-1.5 rounded-full font-medium border transition-colors ${
              filter === f
                ? "bg-vr-green text-white border-vr-green"
                : "bg-white text-gray-600 border-gray-200 hover:border-vr-green hover:text-vr-green"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <span className="text-xs text-gray-400">{count} ads</span>
        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value as SortType)}
          className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-vr-green"
        >
          <option value="cpl_asc">CPL (low to high)</option>
          <option value="leads_desc">Leads (high to low)</option>
          <option value="booking_desc">Booking rate (high to low)</option>
          <option value="spend_desc">Spend (high to low)</option>
        </select>
      </div>
    </div>
  );
}

export function filterAndSort(
  ads: AdSummary[],
  filter: FilterType,
  sort: SortType
): AdSummary[] {
  let filtered = ads;

  if (filter === "Flagged") {
    filtered = ads.filter((a) => a.alert);
  } else if (filter !== "All") {
    filtered = ads.filter((a) => a.recommendation === filter);
  }

  return [...filtered].sort((a, b) => {
    switch (sort) {
      case "cpl_asc":
        return (a.avg_cpl || Infinity) - (b.avg_cpl || Infinity);
      case "leads_desc":
        return b.total_leads - a.total_leads;
      case "booking_desc":
        return b.booking_rate - a.booking_rate;
      case "spend_desc":
        return b.total_spend - a.total_spend;
      default:
        return 0;
    }
  });
}
