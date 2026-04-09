"use client";

import { useState, useEffect } from "react";
import EngagementRow from "@/components/engagements/engagement-row";
import type { Engagement } from "@/types";

export default function EngagementsPage() {
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [analysingId, setAnalysingId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<Engagement["status"] | "all">("all");

  useEffect(() => {
    fetch("/api/engagements")
      .then((r) => r.json())
      .then((data) => {
        setEngagements(data.engagements ?? []);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load engagements");
        setLoading(false);
      });
  }, []);

  async function handleStatusChange(id: string, status: Engagement["status"]) {
    const res = await fetch("/api/engagements", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (!res.ok) throw new Error("Failed to update status");
    setEngagements((prev) =>
      prev.map((e) => (e.id === id ? { ...e, status } : e))
    );
  }

  async function handleAnalyse(id: string) {
    setAnalysingId(id);
    try {
      const res = await fetch(`/api/engagements/${id}/analyse`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analysis failed");
      setEngagements((prev) =>
        prev.map((e) =>
          e.id === id
            ? {
                ...e,
                status: "completed",
                zoom_score: data.zoom_score,
                zoom_analysis: data.zoom_analysis,
              }
            : e
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalysingId(null);
    }
  }

  const STATUS_FILTER_OPTIONS: Array<Engagement["status"] | "all"> = [
    "all", "booked", "transcript_pending", "completed", "converted", "lost", "unmatched",
  ];

  const filtered =
    filterStatus === "all"
      ? engagements
      : engagements.filter((e) => e.status === filterStatus);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-vr-green">Engagements</h1>
          {!loading && (
            <p className="text-xs text-gray-400 mt-0.5">
              {engagements.length} engagement{engagements.length !== 1 ? "s" : ""}
            </p>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <svg className="animate-spin h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading engagements...
        </div>
      )}

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          {/* Status filters */}
          <div className="flex flex-wrap gap-2 mb-4">
            {STATUS_FILTER_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  filterStatus === s
                    ? "bg-vr-green text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {s === "all" ? `All (${engagements.length})` : s.replace("_", " ")}
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">No engagements found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 pr-4 font-medium text-gray-500">Name</th>
                    <th className="text-left py-3 pr-4 font-medium text-gray-500">Email</th>
                    <th className="text-left py-3 pr-4 font-medium text-gray-500">Scheduled</th>
                    <th className="text-left py-3 pr-4 font-medium text-gray-500">Status</th>
                    <th className="text-center py-3 pr-4 font-medium text-gray-500">Fit</th>
                    <th className="text-center py-3 pr-4 font-medium text-gray-500">Call</th>
                    <th className="text-left py-3 pr-4 font-medium text-gray-500">Brief</th>
                    <th className="py-3 w-6" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((e) => (
                    <EngagementRow
                      key={e.id}
                      engagement={e}
                      isExpanded={expandedId === e.id}
                      onToggle={() =>
                        setExpandedId((prev) => (prev === e.id ? null : e.id))
                      }
                      onStatusChange={handleStatusChange}
                      onAnalyse={handleAnalyse}
                      analysing={analysingId === e.id}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
