"use client";

import type { Engagement } from "@/types";

const STATUS_LABELS: Record<Engagement["status"], string> = {
  booked: "Booked",
  completed: "Completed",
  converted: "Converted",
  lost: "Lost",
  unmatched: "Unmatched",
  transcript_pending: "Transcript ready",
  transcript_failed: "Transcript failed",
};

const STATUS_COLORS: Record<Engagement["status"], string> = {
  booked: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  converted: "bg-vr-gold/20 text-amber-700",
  lost: "bg-gray-100 text-gray-500",
  unmatched: "bg-orange-100 text-orange-700",
  transcript_pending: "bg-purple-100 text-purple-700",
  transcript_failed: "bg-red-100 text-red-600",
};

interface Props {
  engagement: Engagement;
  isExpanded: boolean;
  onToggle: () => void;
  onStatusChange: (id: string, status: Engagement["status"]) => Promise<void>;
  onAnalyse: (id: string) => Promise<void>;
  analysing: boolean;
}

export default function EngagementRow({
  engagement,
  isExpanded,
  onToggle,
  onStatusChange,
  onAnalyse,
  analysing,
}: Props) {
  const e = engagement;

  return (
    <>
      <tr
        className="hover:bg-gray-50 cursor-pointer"
        onClick={onToggle}
      >
        <td className="py-3 pr-4 font-medium text-gray-900">
          {e.name ?? "—"}
        </td>
        <td className="py-3 pr-4 text-gray-600">{e.email}</td>
        <td className="py-3 pr-4 text-gray-500 text-xs">
          {e.scheduled_at
            ? new Date(e.scheduled_at).toLocaleDateString()
            : "—"}
        </td>
        <td className="py-3 pr-4">
          <select
            value={e.status}
            onClick={(ev) => ev.stopPropagation()}
            onChange={async (ev) => {
              ev.stopPropagation();
              await onStatusChange(e.id, ev.target.value as Engagement["status"]);
            }}
            className={`text-xs font-medium px-2 py-1 rounded border-0 cursor-pointer appearance-none ${STATUS_COLORS[e.status]}`}
          >
            {Object.entries(STATUS_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </td>
        <td className="py-3 pr-4 text-center">
          {e.fit_score != null ? (
            <span className={`text-sm font-bold ${e.fit_score >= 7 ? "text-green-600" : e.fit_score >= 4 ? "text-yellow-600" : "text-red-500"}`}>
              {e.fit_score}/10
            </span>
          ) : "—"}
        </td>
        <td className="py-3 pr-4 text-center">
          {e.zoom_score != null ? (
            <span className={`text-sm font-bold ${e.zoom_score >= 70 ? "text-green-600" : e.zoom_score >= 50 ? "text-yellow-600" : "text-red-500"}`}>
              {e.zoom_score}/100
            </span>
          ) : "—"}
        </td>
        <td className="py-3 pr-4 text-xs text-gray-500">
          {e.brief_doc_url ? (
            <a
              href={e.brief_doc_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(ev) => ev.stopPropagation()}
              className="text-vr-green underline hover:text-vr-green/70"
            >
              Open →
            </a>
          ) : "—"}
        </td>
        <td className="py-3 text-gray-400">
          <span className="text-xs">{isExpanded ? "▲" : "▼"}</span>
        </td>
      </tr>

      {isExpanded && (
        <tr>
          <td colSpan={8} className="pb-4 pt-0">
            <div className="bg-gray-50 rounded-xl p-4 mx-2 space-y-4">
              {/* Research */}
              {e.research && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Research</h4>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{e.research}</p>
                </div>
              )}

              {/* Scoring */}
              {(e.fit_reasoning || e.likely_objection || e.meeting_angle) && (
                <div className="grid grid-cols-3 gap-4">
                  {e.fit_reasoning && (
                    <div>
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Fit reasoning</h4>
                      <p className="text-sm text-gray-700">{e.fit_reasoning}</p>
                    </div>
                  )}
                  {e.likely_objection && (
                    <div>
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Likely objection</h4>
                      <p className="text-sm text-gray-700">{e.likely_objection}</p>
                    </div>
                  )}
                  {e.meeting_angle && (
                    <div>
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Meeting angle</h4>
                      <p className="text-sm text-gray-700">{e.meeting_angle}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Zoom analysis */}
              {e.zoom_analysis && e.zoom_analysis.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Call Analysis (31 categories)</h4>
                  <div className="grid grid-cols-2 gap-1">
                    {e.zoom_analysis.map((cat) => (
                      <div key={cat.category} className="flex items-start gap-2 text-xs">
                        <span className={`font-bold mt-0.5 ${cat.score >= 4 ? "text-green-600" : cat.score >= 3 ? "text-yellow-600" : "text-red-500"}`}>
                          {cat.score}/5
                        </span>
                        <div>
                          <span className="font-medium text-gray-700">{cat.category}</span>
                          {cat.notes && <span className="text-gray-400 ml-1">— {cat.notes}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Analyse transcript button */}
              {(e.status === "transcript_pending" || e.transcript_url) && !e.zoom_analysis && (
                <div>
                  <button
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onAnalyse(e.id);
                    }}
                    disabled={analysing}
                    className="px-4 py-2 bg-vr-green text-white text-sm font-medium rounded-lg hover:bg-vr-green/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {analysing ? (
                      <>
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Analysing transcript...
                      </>
                    ) : (
                      "Analyse transcript"
                    )}
                  </button>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
