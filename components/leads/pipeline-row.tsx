"use client";

import { useEffect, useState } from "react";
import type {
  PipelineRow,
  PipelineStatus,
  LeadStatus,
  EngagementFunnelStatus,
  OutcomeVerdict,
} from "@/types";

export const STATUS_LABELS: Record<PipelineStatus, string> = {
  lead: "Lead",
  correspondence: "Correspondence",
  call_booked: "Call booked",
  no_show: "No-show",
  proposal_sent: "Proposal sent",
  won: "Won",
  lost: "Lost",
  disqualified: "Disqualified",
};

export const STATUS_COLORS: Record<PipelineStatus, string> = {
  lead: "bg-blue-100 text-blue-700",
  correspondence: "bg-yellow-100 text-yellow-700",
  call_booked: "bg-indigo-100 text-indigo-700",
  no_show: "bg-gray-100 text-gray-600",
  proposal_sent: "bg-purple-100 text-purple-700",
  won: "bg-green-100 text-green-700",
  lost: "bg-red-100 text-red-600",
  disqualified: "bg-gray-200 text-gray-700",
};

const LEAD_OPTIONS: LeadStatus[] = [
  "lead",
  "correspondence",
  "call_booked",
  "disqualified",
];
const ENGAGEMENT_OPTIONS: EngagementFunnelStatus[] = [
  "call_booked",
  "no_show",
  "proposal_sent",
  "won",
  "lost",
  "disqualified",
];

const VERDICT_LABELS: Record<OutcomeVerdict, string> = {
  win: "Win",
  potential_win: "Potential win",
  likely_loss: "Likely loss",
  loss: "Loss",
};

const VERDICT_COLORS: Record<OutcomeVerdict, string> = {
  win: "bg-green-100 text-green-700",
  potential_win: "bg-lime-100 text-lime-700",
  likely_loss: "bg-orange-100 text-orange-700",
  loss: "bg-red-100 text-red-600",
};

/**
 * Compact relative time: "just now", "5m ago", "3h ago", "2d ago".
 * Falls back to a short date for anything older than 7 days.
 */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diffSec = Math.max(0, (Date.now() - then) / 1000);
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface Props {
  row: PipelineRow;
  isExpanded: boolean;
  onToggle: () => void;
  onStatusChange: (row: PipelineRow, next: PipelineStatus) => Promise<void>;
  onActionsToTakeChange: (row: PipelineRow, next: string | null) => Promise<void>;
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
  onActionsToTakeChange,
  onAnalyse,
  onDelete,
  analysing,
  deleting,
  updating,
}: Props) {
  const options = row.source === "lead" ? LEAD_OPTIONS : ENGAGEMENT_OPTIONS;
  const canExpand = row.source === "engagement";

  const hasSalesCallSummary =
    row.business_summary != null ||
    row.sector != null ||
    row.outcome_verdict != null ||
    row.call_strengths != null ||
    row.call_improvements != null ||
    row.sales_call_doc_url != null;

  async function handleDeleteClick(ev: React.MouseEvent) {
    ev.stopPropagation();
    const label = row.name ?? row.email;
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
    await onDelete(row);
  }

  async function handleActionsBlur(ev: React.FocusEvent<HTMLTextAreaElement>) {
    const next = ev.target.value.trim();
    const current = row.actions_to_take ?? "";
    if (next === current) return;
    await onActionsToTakeChange(row, next === "" ? null : next);
  }

  return (
    <>
      <tr
        className={canExpand ? "hover:bg-gray-50 cursor-pointer" : "hover:bg-gray-50"}
        onClick={canExpand ? onToggle : undefined}
      >
        <td className="py-3 pr-4 font-medium text-gray-900 align-top">
          {row.name ?? "—"}
        </td>
        <td className="py-3 pr-4 text-gray-600 align-top">{row.email}</td>
        <td className="py-3 pr-4 align-top">
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
        <td className="py-3 pr-4 align-top">
          <textarea
            key={`${row.source_id}-${row.actions_to_take ?? ""}`}
            defaultValue={row.actions_to_take ?? ""}
            onClick={(ev) => ev.stopPropagation()}
            onBlur={handleActionsBlur}
            placeholder="Next steps, follow-ups, last email…"
            rows={3}
            disabled={updating || deleting}
            className="w-72 text-sm border border-gray-300 rounded-md px-2.5 py-2 leading-snug resize-y bg-white shadow-sm placeholder-gray-400 transition-colors focus:border-vr-green focus:ring-1 focus:ring-vr-green focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </td>
        <td
          className="py-3 pr-4 text-gray-500 text-xs align-top whitespace-nowrap"
          title={new Date(row.updated_at).toLocaleString()}
        >
          {relativeTime(row.updated_at)}
        </td>
        <td className="py-3 pr-4 text-gray-500 text-xs align-top">
          {row.scheduled_at
            ? new Date(row.scheduled_at).toLocaleDateString()
            : "—"}
        </td>
        <td className="py-3 pr-4 text-center align-top">
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
        <td className="py-3 pr-4 text-center text-xs align-top">
          {row.sales_call_doc_url ? (
            <div className="flex flex-col items-center gap-1">
              <a
                href={row.sales_call_doc_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(ev) => ev.stopPropagation()}
                className="text-vr-green underline hover:text-vr-green/70"
              >
                Open call →
              </a>
              {row.outcome_verdict && (
                <span
                  className={`px-2 py-0.5 rounded font-medium ${VERDICT_COLORS[row.outcome_verdict]}`}
                >
                  {VERDICT_LABELS[row.outcome_verdict]}
                </span>
              )}
            </div>
          ) : row.zoom_score != null ? (
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
        <td className="py-3 pr-4 text-xs text-gray-500 align-top">
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
        <td className="py-3 pr-4 text-xs text-gray-400 align-top">
          {row.utm_content || "—"}
        </td>
        <td className="py-3 pr-3 text-right align-top">
          <button
            onClick={handleDeleteClick}
            disabled={deleting || updating}
            className="text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {deleting ? "…" : "Delete"}
          </button>
        </td>
        <td className="py-3 text-gray-400 w-6 align-top">
          {canExpand ? (
            <span className="text-xs">{isExpanded ? "▲" : "▼"}</span>
          ) : null}
        </td>
      </tr>

      {isExpanded && canExpand && (
        <tr>
          <td colSpan={12} className="pb-4 pt-0">
            <div className="bg-gray-50 rounded-xl p-4 mx-2 space-y-4">
              {hasSalesCallSummary ? (
                <SalesCallSummary row={row} />
              ) : (
                <LegacyCallSummary row={row} />
              )}

              {(row.engagement_status === "transcript_pending" || row.transcript_url) &&
                !row.zoom_analysis &&
                !hasSalesCallSummary && (
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

/** Drawer body for engagements that have post-call structured fields (PR 4 pipeline). */
function SalesCallSummary({ row }: { row: PipelineRow }) {
  const facts: Array<[string, string | null]> = [
    ["Sector", row.sector],
    ["Geography", row.geography],
    ["Last revenue", row.last_revenue],
    ["Last profit", row.last_profit],
    ["Indicative valuation", row.indicative_valuation],
  ];
  const visibleFacts = facts.filter(([, v]) => v != null && v !== "");

  // If we have a doc URL but none of the AI fields are populated, this is
  // probably a name-matched legacy doc. Show the lazy-extracted doc summary.
  const onlyDocLink =
    row.sales_call_doc_url != null &&
    !row.business_summary &&
    !row.sector &&
    !row.outcome_verdict &&
    !row.call_strengths &&
    !row.call_improvements;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-gray-700">Sales call summary</h3>
        <div className="flex items-center gap-2">
          {row.outcome_verdict && (
            <span
              className={`text-xs font-medium px-2 py-1 rounded ${VERDICT_COLORS[row.outcome_verdict]}`}
            >
              {VERDICT_LABELS[row.outcome_verdict]}
            </span>
          )}
          {row.fit_score != null && (
            <span
              className={`text-xs font-bold ${
                row.fit_score >= 7
                  ? "text-green-600"
                  : row.fit_score >= 4
                    ? "text-yellow-600"
                    : "text-red-500"
              }`}
            >
              Fit {row.fit_score}/10
            </span>
          )}
          {row.sales_call_doc_url && (
            <a
              href={row.sales_call_doc_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(ev) => ev.stopPropagation()}
              className="text-xs font-medium text-vr-green underline hover:text-vr-green/70"
            >
              Full call doc →
            </a>
          )}
        </div>
      </div>

      {onlyDocLink && (
        <DocSummary
          engagementId={row.source_id}
          initialSummary={row.doc_summary}
          initialNextSteps={row.doc_next_steps}
        />
      )}

      {visibleFacts.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-700">
          {visibleFacts.map(([label, value]) => (
            <span key={label}>
              <span className="text-gray-500">{label}: </span>
              <span className="font-medium">{value}</span>
            </span>
          ))}
        </div>
      )}

      {row.business_summary && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Type of business
          </h4>
          <p className="text-sm text-gray-700">{row.business_summary}</p>
        </div>
      )}

      {row.pain_point && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Client&rsquo;s ask / pain point
          </h4>
          <p className="text-sm text-gray-700">{row.pain_point}</p>
        </div>
      )}

      {row.outcome_rationale && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            How it went / next steps
          </h4>
          <p className="text-sm text-gray-700">{row.outcome_rationale}</p>
        </div>
      )}

      {(row.call_strengths || row.call_improvements) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {row.call_strengths && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                What went well
              </h4>
              <BulletList text={row.call_strengths} />
            </div>
          )}
          {row.call_improvements && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                What to improve
              </h4>
              <BulletList text={row.call_improvements} />
            </div>
          )}
        </div>
      )}

    </div>
  );
}

/** Legacy drawer body for engagements without post-call structured fields. */
function LegacyCallSummary({ row }: { row: PipelineRow }) {
  return (
    <div className="space-y-4">
      {row.research && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Research
          </h4>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{row.research}</p>
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
    </div>
  );
}

/** Render a multi-line string (one item per line, optional leading "- ") as a bullet list. */
function BulletList({ text }: { text: string }) {
  const items = text
    .split(/\n+/)
    .map((l) => l.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);
  if (items.length === 0) return null;
  return (
    <ul className="list-disc list-inside text-sm text-gray-700 space-y-0.5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

/**
 * Summary for engagements whose sales call doc was matched by name (no full
 * AI summary stored on the row). Reads `doc_summary` and `doc_next_steps`
 * from the row when populated; otherwise lazy-fetches the doc-summary API
 * which extracts via Claude and persists the result for next time.
 */
function DocSummary({
  engagementId,
  initialSummary,
  initialNextSteps,
}: {
  engagementId: string;
  initialSummary: string | null;
  initialNextSteps: string | null;
}) {
  const hasCached = initialSummary != null || initialNextSteps != null;
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ready"; summary: string | null; nextSteps: string | null }
    | { kind: "error"; message: string }
  >(
    hasCached
      ? { kind: "ready", summary: initialSummary, nextSteps: initialNextSteps }
      : { kind: "loading" },
  );

  useEffect(() => {
    if (hasCached) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/engagements/${engagementId}/doc-summary`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setState({ kind: "error", message: data.error ?? "Failed to load summary" });
          return;
        }
        setState({
          kind: "ready",
          summary: data.summary ?? null,
          nextSteps: data.next_steps ?? null,
        });
      } catch {
        if (!cancelled) setState({ kind: "error", message: "Failed to load summary" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [engagementId, hasCached]);

  if (state.kind === "loading") {
    return (
      <p className="text-xs text-gray-500 italic">Reading sales call doc and summarising…</p>
    );
  }

  if (state.kind === "error") {
    return (
      <p className="text-xs text-red-500">
        Couldn&rsquo;t load summary: {state.message}. Open the doc above to read the full notes.
      </p>
    );
  }

  if (!state.summary && !state.nextSteps) {
    return (
      <p className="text-xs text-gray-500 italic">
        Matched a sales call doc by name, but couldn&rsquo;t extract a summary. Open the doc above.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {state.summary && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Brief summary
          </h4>
          <p className="text-sm text-gray-700">{state.summary}</p>
        </div>
      )}
      {state.nextSteps && (
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Next steps agreed
          </h4>
          <BulletList text={state.nextSteps} />
        </div>
      )}
    </div>
  );
}
