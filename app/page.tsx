"use client";

import { useState, useEffect, useCallback } from "react";
import AdPerformanceCard from "@/components/dashboard/ad-performance-card";
import FilterBar, { filterAndSort } from "@/components/dashboard/filter-bar";
import type { AdSummary } from "@/types";

type FilterType = "All" | "SCALE" | "MAINTAIN" | "KILL" | "TEST VARIANT" | "Flagged";
type SortType = "cpl_asc" | "leads_desc" | "booking_desc" | "spend_desc";

export default function DashboardPage() {
  const [ads, setAds] = useState<AdSummary[]>([]);
  const [filter, setFilter] = useState<FilterType>("All");
  const [sort, setSort] = useState<SortType>("cpl_asc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sheets/summary");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAds(data);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/webhook/refresh", { method: "POST" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  }

  async function handleAnalysis() {
    setAnalyzing(true);
    try {
      const res = await fetch("/api/webhook/analysis", { method: "POST" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  const displayed = filterAndSort(ads, filter, sort);

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-vr-green">Ad Performance</h1>
          {lastUpdated && (
            <p className="text-xs text-gray-400 mt-0.5">Last updated: {lastUpdated}</p>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing || analyzing}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-white border border-gray-200 rounded-lg hover:border-vr-green text-gray-700 hover:text-vr-green disabled:opacity-50"
          >
            {refreshing ? (
              <>
                <Spinner />
                Pulling Meta data...
              </>
            ) : (
              "Refresh data"
            )}
          </button>
          <button
            onClick={handleAnalysis}
            disabled={refreshing || analyzing}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-vr-green text-white rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {analyzing ? (
              <>
                <Spinner light />
                Running analysis...
              </>
            ) : (
              "Run analysis"
            )}
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Filter bar */}
      {!loading && (
        <FilterBar
          filter={filter}
          sort={sort}
          onFilterChange={setFilter}
          onSortChange={setSort}
          count={displayed.length}
        />
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400">
          <Spinner large />
          <p className="mt-3 text-sm">Loading ad performance data...</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && ads.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400">
          <p className="text-lg font-medium">No ad data yet</p>
          <p className="text-sm mt-1">
            Click &ldquo;Refresh data&rdquo; to pull from Meta, or check your Google Sheets connection.
          </p>
        </div>
      )}

      {/* Card grid */}
      {!loading && displayed.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {displayed.map((ad) => (
            <AdPerformanceCard key={ad.ad_id} ad={ad} />
          ))}
        </div>
      )}

      {/* No results after filter */}
      {!loading && ads.length > 0 && displayed.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <p className="text-sm">No ads match this filter.</p>
        </div>
      )}
    </div>
  );
}

function Spinner({ light, large }: { light?: boolean; large?: boolean }) {
  return (
    <svg
      className={`animate-spin ${large ? "h-8 w-8" : "h-4 w-4"} ${light ? "text-white" : "text-vr-green"}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
