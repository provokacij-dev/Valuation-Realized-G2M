"use client";

import { useState } from "react";
import type { Lead } from "@/types";

const STATUS_LABELS: Record<Lead["status"], string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  disqualified: "Disqualified",
};

const STATUS_COLORS: Record<Lead["status"], string> = {
  new: "bg-blue-100 text-blue-700",
  contacted: "bg-yellow-100 text-yellow-700",
  qualified: "bg-green-100 text-green-700",
  disqualified: "bg-gray-100 text-gray-500",
};

interface Props {
  leads: Lead[];
  onStatusChange: (id: string, status: Lead["status"]) => Promise<void>;
}

export default function LeadsTable({ leads, onStatusChange }: Props) {
  const [updating, setUpdating] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<Lead["status"] | "all">("all");

  const filtered = filterStatus === "all"
    ? leads
    : leads.filter((l) => l.status === filterStatus);

  async function handleStatusChange(id: string, status: Lead["status"]) {
    setUpdating(id);
    try {
      await onStatusChange(id, status);
    } finally {
      setUpdating(null);
    }
  }

  return (
    <div>
      {/* Filter bar */}
      <div className="flex gap-2 mb-4">
        {(["all", "new", "contacted", "qualified", "disqualified"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filterStatus === s
                ? "bg-vr-green text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {s === "all" ? "All" : STATUS_LABELS[s]}
            {s === "all"
              ? ` (${leads.length})`
              : ` (${leads.filter((l) => l.status === s).length})`}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">No leads found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 pr-4 font-medium text-gray-500">Name</th>
                <th className="text-left py-3 pr-4 font-medium text-gray-500">Email</th>
                <th className="text-left py-3 pr-4 font-medium text-gray-500">Source</th>
                <th className="text-left py-3 pr-4 font-medium text-gray-500">UTMs</th>
                <th className="text-left py-3 pr-4 font-medium text-gray-500">Status</th>
                <th className="text-left py-3 font-medium text-gray-500">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((lead) => (
                <tr key={lead.id} className="hover:bg-gray-50">
                  <td className="py-3 pr-4 font-medium text-gray-900">
                    {lead.name ?? "—"}
                    {lead.phone && (
                      <div className="text-xs text-gray-400">{lead.phone}</div>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-gray-600">{lead.email}</td>
                  <td className="py-3 pr-4 text-gray-500">{lead.source ?? "—"}</td>
                  <td className="py-3 pr-4 text-xs text-gray-400">
                    {[lead.utm_source, lead.utm_medium, lead.utm_campaign]
                      .filter(Boolean)
                      .join(" / ") || "—"}
                  </td>
                  <td className="py-3 pr-4">
                    <select
                      value={lead.status}
                      disabled={updating === lead.id}
                      onChange={(e) =>
                        handleStatusChange(lead.id, e.target.value as Lead["status"])
                      }
                      className={`text-xs font-medium px-2 py-1 rounded border-0 cursor-pointer appearance-none ${STATUS_COLORS[lead.status]} ${
                        updating === lead.id ? "opacity-50" : ""
                      }`}
                    >
                      {Object.entries(STATUS_LABELS).map(([val, label]) => (
                        <option key={val} value={val}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-3 text-xs text-gray-400">
                    {new Date(lead.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
