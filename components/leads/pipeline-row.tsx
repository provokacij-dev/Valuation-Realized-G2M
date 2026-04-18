"use client";

import type {
  PipelineRow,
  PipelineStatus,
  LeadStatus,
  EngagementFunnelStatus,
} from "@/types";

export const STATUS_LABELS: Record<PipelineStatus, string> = {
  lead: "Lead",
  correspondence: "Correspondence",
  call_booked: "Call booked",
  no_show: "No-show",
  proposal_sent: "Proposal sent",
  won: "Won",
  lost: "Lost",
};

export const STATUS_COLORS: Record<PipelineStatus, string> = {
  lead: "bg-blue-100 text-blue-700",
  correspondence: "bg-yellow-100 text-yellow-700",
  call_booked: "bg-indigo-100 text-indigo-700",
  no_show: "bg-gray-100 text-gray-600",
  proposal_sent: "bg-purple-100 text-purple-700",
  won: "bg-green-100 text-green-700",
  lost: "bg-red-100 text-red-600",
};

const LEAD_OPTIONS: LeadStatus[] = ["lead", "correspondence", "call_booked"];
const ENGAGEMENT_OPTIONS: EngagementFunnelStatus[] = [
  "call_booked",
  "no_show",
  "proposal_sent",
  "won",
  "lost",
];

interface Props {
  row: PipelineRow;
  isExpanded: boolean;
  onToggle: () => void;
  onStatusChange: (row: PipelineRow, next: PipelineStatus) => Promise<void>;
  onAnalyse: (id: string) => Promise<void>;
  onDelete: (row: PipelineRow) => Promise<void>;
  analysing: boolean;
  deleting: boolean;
  updating: boolean;
}

export default function PipelineRowView({
  row,
  isExpanded,
  onToggle,
  onStatusChange,
  onAnalyse,
  onDelete,
  analysing,
  deleting,
  updating,
}: Props) {
  const options = row.source === "lead" ? LEAD_OPTIONS : ENGAGEMENT_OPTIONS;
  const canExpand = row.source === "engagement";

  async function handleDeleteClick(ev: React.MouseEvent) {
    ev.stopPropagation();
    const label = row.name ?? row.email;
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
    await onDelete(row);
  }

  return (
    <>
      <tr
        className={canExpand ? "hover:bg-gray-50 cursor-pointer" : "hover:bg-gray-50"}
        onClick={canExpand ? onToggle : undefined}
      >
        <td className="py-3 pr-4 font-medium text-gray-900">
          {row.name ?? "—"}
        </td>
        <td className="py-3 pr-4 text-gray-600">{row.email}</td>
        <td className="py-3 pr-4 text-xs text-gray-400">
          {[row.utm_term, row.utm_content].filter(Boolean).join(" / ") || "—"}
        </td>
        <td className="py-3 pr-4">
          <select
            value={row.status}
            disabled={updating || deleting}
            onClick={(ev) => ev.stopPropagation()}
            onChange={async (ev) => {
              ev.stopPropagation();
              await onStatusChange(row, ev.target.value as PipelineStatus);
            }}
            className={`text-xs font-medium px-2 py-1 rounded border-0 cursor-pointer appearance-none ${STATUS_COLORS[row.status]} ${
              updating ? "opacity-50" : ""
            }`}
          >
            {options.map((val) => (
              <option key={val} value={val}>
                {STATUS_LABELS[val]}
              </option>
            ))}
          </select>
        </td>
        <td className="py-3 pr-4 text-gray-500 text-xs">
          {row.scheduled_at
            ? new Date(row.scheduled_at).toLocaleDateString()
            : "—"}
        </td>
        <td className="py-3 pr-4 text-center">
          {row.fit_score != null ? (
            <span
              className={`text-sm font-bold ${
                row.fit_score >= 7
                  ? "text-green-600"
                  : row.fit_score >= 4
                    ? "text-yellow-600"
                    : "text-red-500"
              }`}
            >
              {row.fit_score}/10
            </span>
          ) : (
            "—"
          )}
        </td>
        <td className="py-3 pr-4 text-center">
          {row.zoom_score != null ? (
            <span
              className={`text-sm font-bold ${
                row.zoom_score >= 70
                  ? "text-green-600"
                  : row.zoom_score >= 50
                    ? "text-yellow-600"
                    : "text-red-500"
              }`}
            >
              {row.zoom_score}/100
            </span>
          ) : (
            "—"
          )}
        </td>
        <td className="py-3 pr-4 text-xs text-gray-500">
          {row.brief_doc_url ? (
            <a
              href={row.brief_doc_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(ev) => ev.stopPropagation()}
              className="text-vr-green underline hover:text-vr-green/70"
            >
              Open →
            </a>
          ) : (
            "—"
          )}
        </td>
        <td className="py-3 pr-3 text-right">
          <button
            onClick={handleDeleteClick}
            disabled={deleting || updating}
            className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {deleting ? "…" : "Delete"}
          </button>
        </td>
        <td className="py-3 text-gray-400 w-6">
          {canExpand ? (
            <span className="text-xs">{isExpanded ? "▲" : "▼"}</span>
          ) : null}
        </td>
      </tr>

      {isExpanded && canExpand && (
        <tr>
          <td colSpan={10} className="pb-4 pt-0">
            <div className="bg-gray-50 rounded-xl p-4 mx-2 space-y-4">
              {row.research && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Research
                  </h4>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {row.research}
                  </p>
                </div>
              )}

              {(row.fit_reasoning || row.likely_objection || row.meeting_angle) && (
                <div className="grid grid-cols-3 gap-4">
                  {row.fit_reasoning && (
                    <div>
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                        Fit reasoning
                      </h4>
                      <p className="text-sm text-gray-700">{row.fit_reasoning}</p>
                    </div>
                  )}
                  {row.likely_objection && (
                    <div>
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                        Likely objection
                      </h4>
                      <p className="text-sm text-gray-700">{row.likely_objection}</p>
                    </div>
                  )}
                  {row.meeting_angle && (
                    <div>
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                        Meeting angle
                      </h4>
                      <p className="text-sm text-gray-700">{row.meeting_angle}</p>
                    </div>
                  )}
                </div>
              )}

              {row.zoom_analysis && row.zoom_analysis.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Call analysis
                  </h4>
                  <div className="grid grid-cols-2 gap-1">
                    {row.zoom_analysis.map((cat) => (
                      <div key={cat.category} className="flex items-start gap-2 text-xs">
                        <span
                          className={`font-bold mt-0.5 ${
                            cat.score >= 4
                              ? "text-green-600"
                              : cat.score >= 3
                                ? "text-yellow-600"
                                : "text-red-500"
                          }`}
                        >
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

              {(row.engagement_status === "transcript_pending" || row.transcript_url) &&
                !row.zoom_analysis && (
                  <div>
                    <button
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onAnalyse(row.source_id);
                      }}
                      disabled={analysing}
                      className="px-4 py-2 bg-vr-green text-white text-sm font-medium rounded-lg hover:bg-vr-green/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {analysing ? "Analysing transcript…" : "Analyse transcript"}
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
