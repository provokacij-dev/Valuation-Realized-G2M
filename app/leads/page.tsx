"use client";

import { useState, useEffect } from "react";
import LeadsTable from "@/components/leads/leads-table";
import type { Lead } from "@/types";

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/leads")
      .then((r) => r.json())
      .then((data) => {
        setLeads(data.leads ?? []);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load leads");
        setLoading(false);
      });
  }, []);

  async function handleStatusChange(id: string, status: Lead["status"]) {
    const res = await fetch("/api/leads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (!res.ok) throw new Error("Failed to update status");
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-vr-green">Leads</h1>
          {!loading && (
            <p className="text-xs text-gray-400 mt-0.5">
              {leads.length} lead{leads.length !== 1 ? "s" : ""}
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
          Loading leads...
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <LeadsTable leads={leads} onStatusChange={handleStatusChange} />
        </div>
      )}
    </div>
  );
}
