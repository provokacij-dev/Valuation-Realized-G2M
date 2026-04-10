"use client";

import { useState, useEffect, useCallback } from "react";
import AdTable from "@/components/dashboard/ad-table";
import type { AdSummary } from "@/types";

interface PipelineCounts {
  leads: number;
  engagements: number;
  queue: number;
}

function today() {
  return new Date().toISOString().split("T")[0];
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

export default function DashboardPage() {
  const [ads, setAds] = useState<AdSummary[]>([]);
  const [pipeline, setPipeline] = useState<PipelineCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState(daysAgo(30));
  const [dateTo, setDateTo] = useState(today());

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryRes, leadsRes, engagementsRes, queueRes] = await Promise.allSettled([
        fetch("/api/ad-performance").then((r) => r.json()),
        fetch("/api/leads").then((r) => r.json()),
        fetch("/api/engagements").then((r) => r.json()),
        fetch("/api/queue?fields=list").then((r) => r.json()),
      ]);

      if (summaryRes.status === "fulfilled") {
        const data = summaryRes.value;
        if (data.error) throw new Error(data.error);
        setAds(Array.isArray(data) ? data : []);
      }

      setPipeline({
        leads: leadsRes.status === "fulfilled" ? (leadsRes.value.leads?.length ?? 0) : 0,
        engagements: engagementsRes.status === "fulfilled" ? (engagementsRes.value.engagements?.length ?? 0) : 0,
        queue: queueRes.status === "fulfilled" ? (queueRes.value.queue?.length ?? 0) : 0,
      });

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
    setError(null);
    try {
      const res = await fetch("/api/webhook/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date_from: dateFrom, date_to: dateTo }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      // Give Make a few seconds to process then reload
      setTimeout(() => loadData(), 5000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  }

  async function handleAnalysis() {
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const res = await fetch("/api/webhook/analysis", { method: "POST" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await loadData();
    } catch (e) {
      setAnalysisError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  // KPIs
  const totalSpend   = ads.reduce((s, a) => s + a.total_spend, 0);
  const totalLeads   = ads.reduce((s, a) => s + a.emails_captured, 0);
  const totalBooked  = ads.reduce((s, a) => s + a.calls_booked, 0);
  const totalRevenue = ads.reduce((s, a) => s + a.revenue, 0);
  const totalDeals   = ads.reduce((s, a) => s + a.deals_closed, 0);
  const avgCpl       = totalLeads > 0 ? totalSpend / totalLeads : 0;
  const avgShowUp    = ads.length > 0 ? ads.reduce((s, a) => s + a.show_up_rate, 0) / ads.length : 0;
  const toScale      = ads.filter((a) => a.recommendation === "SCALE").length;
  const toKill       = ads.filter((a) => a.recommendation === "KILL").length;
  const flagged      = ads.filter((a) => a.alert).length;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-vr-green">Ad Performance</h1>
          {lastUpdated && (
            <p className="text-xs text-gray-400 mt-0.5">Last updated: {lastUpdated}</p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          {/* Date range + action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-3 py-2">
              <input
                type="date"
                value={dateFrom}
                max={dateTo}
                onChange={(e) => setDateFrom(e.target.value)}
                className="text-sm text-gray-700 outline-none bg-transparent w-32"
              />
              <span className="text-gray-300">→</span>
              <input
                type="date"
                value={dateTo}
                min={dateFrom}
                max={today()}
                onChange={(e) => setDateTo(e.target.value)}
                className="text-sm text-gray-700 outline-none bg-transparent w-32"
              />
            </div>

            <button
              onClick={handleRefresh}
              disabled={refreshing || analyzing}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-white border border-gray-200 rounded-lg hover:border-vr-green text-gray-700 hover:text-vr-green disabled:opacity-50"
            >
              {refreshing ? <><Spinner />Pulling Meta data...</> : "Refresh data"}
            </button>

            <button
              onClick={handleAnalysis}
              disabled={refreshing || analyzing}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-vr-green text-white rounded-lg hover:opacity-90 disabled:opacity-50"
            >
              {analyzing ? <><Spinner light />Running analysis...</> : "Run analysis"}
            </button>
          </div>

          {analysisError && (
            <p className="text-xs text-amber-600">⚠ {analysisError}</p>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Pipeline strip */}
      {pipeline !== null && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <a href="/leads" className="bg-white border border-gray-100 rounded-xl px-4 py-3 flex items-center gap-3 hover:border-vr-green transition-colors group">
            <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <p className="text-xl font-bold text-vr-green">{pipeline.leads}</p>
              <p className="text-xs text-gray-400">Leads</p>
            </div>
          </a>

          <a href="/engagements" className="bg-white border border-gray-100 rounded-xl px-4 py-3 flex items-center gap-3 hover:border-vr-green transition-colors group">
            <div className="w-9 h-9 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <p className="text-xl font-bold text-vr-green">{pipeline.engagements}</p>
              <p className="text-xs text-gray-400">Engagements</p>
            </div>
          </a>

          <a href="/upload" className="bg-white border border-gray-100 rounded-xl px-4 py-3 flex items-center gap-3 hover:border-vr-green transition-colors group">
            <div className="w-9 h-9 rounded-full bg-green-50 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-vr-green" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </div>
            <div>
              <p className="text-xl font-bold text-vr-green">{pipeline.queue}</p>
              <p className="text-xs text-gray-400">In upload queue</p>
            </div>
          </a>
        </div>
      )}

      {/* KPI row */}
      {!loading && ads.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
          <KpiCard label="Total spend"     value={totalSpend > 0 ? `€${totalSpend.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—"} />
          <KpiCard label="Emails captured" value={String(totalLeads)} />
          <KpiCard label="Avg CPL"         value={avgCpl > 0 ? `€${avgCpl.toFixed(0)}` : "—"} />
          <KpiCard label="Calls booked"    value={String(totalBooked)} />
          <KpiCard label="Avg show-up"     value={avgShowUp > 0 ? `${avgShowUp.toFixed(1)}%` : "—"} />
          <KpiCard label="Revenue"         value={totalRevenue > 0 ? `€${totalRevenue.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : totalDeals > 0 ? `${totalDeals} deals` : "—"} />
        </div>
      )}

      {/* Recommendation chips */}
      {!loading && ads.length > 0 && (toScale > 0 || toKill > 0 || flagged > 0) && (
        <div className="flex flex-wrap gap-2 mb-4">
          {toScale > 0 && <span className="text-xs font-medium px-3 py-1.5 rounded-full bg-green-100 text-green-800 border border-green-200">{toScale} to SCALE</span>}
          {toKill > 0 && <span className="text-xs font-medium px-3 py-1.5 rounded-full bg-red-100 text-red-800 border border-red-200">{toKill} to KILL</span>}
          {flagged > 0 && <span className="text-xs font-medium px-3 py-1.5 rounded-full bg-orange-100 text-orange-800 border border-orange-200">{flagged} flagged</span>}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400">
          <Spinner large />
          <p className="mt-3 text-sm">Loading ad performance data...</p>
        </div>
      )}

      {/* Empty */}
      {!loading && ads.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400">
          <p className="text-lg font-medium">No ad data yet</p>
          <p className="text-sm mt-1 text-center max-w-xs">
            Select a date range and click &ldquo;Refresh data&rdquo; to pull your Meta ad stats.
          </p>
        </div>
      )}

      {/* Table */}
      {!loading && ads.length > 0 && <AdTable ads={ads} />}
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl px-4 py-3">
      <p className="text-xs text-gray-400 leading-none mb-1.5">{label}</p>
      <p className="text-xl font-bold text-vr-green">{value}</p>
    </div>
  );
}

function Spinner({ light, large }: { light?: boolean; large?: boolean }) {
  return (
    <svg className={`animate-spin ${large ? "h-8 w-8" : "h-4 w-4"} ${light ? "text-white" : "text-vr-green"}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
