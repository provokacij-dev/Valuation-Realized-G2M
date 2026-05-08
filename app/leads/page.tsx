"use client";

import { useState, useEffect } from "react";
import PipelineRowView, {
  STATUS_LABELS,
} from "@/components/leads/pipeline-row";
import type {
  PipelineRow,
  PipelineStatus,
  LeadStatus,
  EngagementFunnelStatus,
} from "@/types";

const FILTER_STATUSES: PipelineStatus[] = [
  "lead",
  "correspondence",
  "call_booked",
  "no_show",
  "proposal_sent",
  "won",
  "lost",
  "disqualified",
];

const LEAD_STATUSES = new Set<PipelineStatus>(["lead", "correspondence"]);

export default function LeadsPage() {
  const [rows, setRows] = useState<PipelineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [analysingId, setAnalysingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<PipelineStatus | "all">("all");

  useEffect(() => {
    fetch("/api/pipeline")
      .then((r) => r.json())
      .then((data) => {
        setRows(data.rows ?? []);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load pipeline");
        setLoading(false);
      });
  }, []);

  async function reload() {
    const r = await fetch("/api/pipeline");
    const data = await r.json();
    setRows(data.rows ?? []);
  }

  async function handleStatusChange(row: PipelineRow, next: PipelineStatus) {
    setUpdatingId(row.source_id);
    try {
      if (row.source === "lead") {
        if (next === "call_booked") {
          // Move lead -> engagement (UTMs carried through on server).
          const res = await fetch("/api/leads/move-to-engagement", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: row.source_id }),
          });
          if (!res.ok) throw new Error("Failed to move lead to engagement");
        } else {
          // Plain lead status update (lead / correspondence / disqualified).
          const res = await fetch("/api/leads", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: row.source_id, status: next as LeadStatus }),
          });
          if (!res.ok) throw new Error("Failed to update status");
        }
      } else {
        // Engagement row — set funnel_status.
        const res = await fetch("/api/engagements", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: row.source_id,
            funnel_status: next as EngagementFunnelStatus,
          }),
        });
        if (!res.ok) throw new Error("Failed to update status");
      }
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Status update failed");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleActionsToTakeChange(row: PipelineRow, next: string | null) {
    setUpdatingId(row.source_id);
    try {
      const endpoint = row.source === "lead" ? "/api/leads" : "/api/engagements";
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.source_id, actions_to_take: next }),
      });
      if (!res.ok) throw new Error("Failed to save next steps");
      // Patch local state in place — no full reload, so the textarea
      // doesn't lose focus context for adjacent rows.
      setRows((prev) =>
        prev.map((r) =>
          r.source_id === row.source_id ? { ...r, actions_to_take: next } : r
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleDelete(row: PipelineRow) {
    setDeletingId(row.source_id);
    try {
      const endpoint = row.source === "lead" ? "/api/leads" : "/api/engagements";
      const res = await fetch(endpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.source_id }),
      });
      if (!res.ok) throw new Error("Failed to delete row");
      setRows((prev) => prev.filter((r) => r.source_id !== row.source_id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleAnalyse(id: string) {
    setAnalysingId(id);
    try {
      const res = await fetch(`/api/engagements/${id}/analyse`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analysis failed");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalysingId(null);
    }
  }

  const counts = FILTER_STATUSES.reduce(
    (acc, s) => {
      acc[s] = rows.filter((r) => r.status === s).length;
      return acc;
    },
    {} as Record<PipelineStatus, number>
  );

  const visibleRows =
    filter === "all" ? rows : rows.filter((r) => r.status === filter);

  const leadCount = rows.filter((r) => LEAD_STATUSES.has(r.status)).length;
  const engagementCount = rows.length - leadCount;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-vr-green">Leads</h1>
          {!loading && (
            <p className="text-xs text-gray-400 mt-0.5">
              {rows.length} total · {leadCount} pre-call · {engagementCount} post-call
            </p>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <svg className="animate-spin h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          Loading pipeline...
        </div>
      )}

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={() => setFilter("all")}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                filter === "all"
                  ? "bg-vr-green text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              All ({rows.length})
            </button>
            {FILTER_STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  filter === s
                    ? "bg-vr-green text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {STATUS_LABELS[s]} ({counts[s]})
              </button>
            ))}
          </div>

          {visibleRows.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">No rows.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 pr-4 font-medium text-gray-500">Name</th>
                    <th className="text-left py-3 pr-4 font-medium text-gray-500">Email</th>
                    <th className="text-left py-3 pr-4 font-medium text-gray-500">Actions to take</th>
                    <th className="text-left py-3 pr-4 font-medium text-gray-500">Status</th>
                    <th className="text-left py-3 pr-4 font-medium text-gray-500">Scheduled</th>
                    <th className="text-center py-3 pr-4 font-medium text-gray-500">Fit</th>
                    <th className="text-center py-3 pr-4 font-medium text-gray-500">Call</th>
                    <th className="text-left py-3 pr-4 font-medium text-gray-500">Brief</th>
                    <th className="text-right py-3 pr-3 font-medium text-gray-500 w-20" />
                    <th className="text-left py-3 pr-4 font-medium text-gray-500">UTMs</th>
                    <th className="py-3 w-6" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {visibleRows.map((row) => (
                    <PipelineRowView
                      key={`${row.source}:${row.source_id}`}
                      row={row}
                      isExpanded={expandedId === row.source_id}
                      onToggle={() =>
                        setExpandedId((prev) =>
                          prev === row.source_id ? null : row.source_id
                        )
                      }
                      onStatusChange={handleStatusChange}
                      onActionsToTakeChange={handleActionsToTakeChange}
                      onAnalyse={handleAnalyse}
                      onDelete={handleDelete}
                      analysing={analysingId === row.source_id}
                      deleting={deletingId === row.source_id}
                      updating={updatingId === row.source_id}
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
