"use client";

import { useState } from "react";
import type { GeneratedAd, Brief } from "@/types";

interface Props {
  ad: GeneratedAd;
  brief: Brief;
  onApprove: (ad: GeneratedAd) => void;
  onReplace: (oldId: string, newAd: GeneratedAd) => void;
  onReject: (id: string) => void;
}

/** Force SVG to fill its container regardless of hardcoded width/height attrs */
function normaliseSvg(svg: string): string {
  return svg.replace(/<svg([^>]*)>/i, (_match, attrs: string) => {
    const cleaned = attrs
      .replace(/\bwidth="[^"]*"/g, "")
      .replace(/\bheight="[^"]*"/g, "");
    return `<svg${cleaned} width="100%" height="100%" style="display:block;">`;
  });
}

export default function GeneratedAdCard({ ad, brief, onApprove, onReplace, onReject }: Props) {
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState({
    primary_text: ad.primary_text,
    headline_a: ad.headline_a,
    headline_b: ad.headline_b,
    headline_c: ad.headline_c,
    description: ad.description,
  });
  const [changeRequest, setChangeRequest] = useState("");
  const [showChangeInput, setShowChangeInput] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [showPrevious, setShowPrevious] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  const approved = ad.status === "approved";

  function handleApprove() {
    onApprove({ ...ad, ...fields, status: "approved" });
  }

  function handleSave() {
    onApprove({ ...ad, ...fields, status: "approved" });
    setEditing(false);
  }

  async function handleRegenerate() {
    if (!changeRequest.trim()) return;
    setRegenerating(true);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief, changeRequest: changeRequest.trim() }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const newAdData = data.ads[0];
      if (!newAdData) throw new Error("No ad returned");

      const newAd: GeneratedAd = {
        ...newAdData,
        id: ad.id,
        svg: undefined,
        status: "pending",
        previousVersion: { ...ad, previousVersion: undefined },
      };

      if (newAd.svg_prompt) {
        const svgRes = await fetch("/api/generate-svg", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ svg_prompt: newAd.svg_prompt }),
        });
        const svgData = await svgRes.json();
        if (svgData.svg) newAd.svg = svgData.svg;
      }

      onReplace(ad.id, newAd);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Regeneration failed");
    } finally {
      setRegenerating(false);
    }
  }

  const borderClass = approved
    ? "border-2 border-green-400"
    : regenerating
    ? "border-2 border-amber-400 animate-pulse"
    : "border border-gray-100";

  return (
    <>
      {/* Zoom modal */}
      {zoomed && (ad.svg || ad.sourceImageUrl) && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setZoomed(false)}
        >
          <div className="relative max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setZoomed(false)}
              className="absolute -top-10 right-0 text-white/70 hover:text-white text-sm flex items-center gap-1"
            >
              ✕ Close
            </button>
            {ad.svg ? (
              <div
                className="w-full aspect-square rounded-xl overflow-hidden shadow-2xl"
                dangerouslySetInnerHTML={{ __html: normaliseSvg(ad.svg) }}
              />
            ) : ad.sourceImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={ad.sourceImageUrl}
                alt="Ad creative"
                className="w-full aspect-square rounded-xl overflow-hidden shadow-2xl object-cover"
              />
            ) : null}
          </div>
        </div>
      )}

      <div className={`bg-white rounded-xl shadow-sm ${borderClass} overflow-hidden`}>
        {/* Previous version toggle */}
        {ad.previousVersion && (
          <div className="bg-amber-50 border-b border-amber-100 px-4 py-2 flex items-center justify-between">
            <span className="text-xs text-amber-700">Updated from change request</span>
            <button
              onClick={() => setShowPrevious(!showPrevious)}
              className="text-xs text-amber-600 underline"
            >
              {showPrevious ? "Hide previous" : "View previous"}
            </button>
          </div>
        )}

        {showPrevious && ad.previousVersion && (
          <div className="bg-gray-50 border-b border-gray-100 p-4 text-xs text-gray-500 space-y-1">
            <p><strong>Previous primary text:</strong> {ad.previousVersion.primary_text}</p>
            <p><strong>Previous headline A:</strong> {ad.previousVersion.headline_a}</p>
          </div>
        )}

        <div className="flex flex-col lg:flex-row">
          {/* Visual panel */}
          <div className="lg:w-64 shrink-0 bg-gray-50 border-b lg:border-b-0 lg:border-r border-gray-100 p-4 flex flex-col items-center justify-center min-h-[200px] gap-2">
            {ad.svg ? (
              <>
                <div
                  className="w-full max-w-[200px] aspect-square cursor-zoom-in hover:opacity-90 transition-opacity overflow-hidden"
                  onClick={() => setZoomed(true)}
                  title="Click to zoom"
                  dangerouslySetInnerHTML={{ __html: normaliseSvg(ad.svg) }}
                />
                <button
                  onClick={() => setZoomed(true)}
                  className="text-xs text-gray-400 hover:text-vr-green flex items-center gap-1"
                >
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                  </svg>
                  Zoom in
                </button>
              </>
            ) : ad.sourceImageUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={ad.sourceImageUrl}
                  alt="Uploaded creative"
                  className="w-full max-w-[200px] aspect-square object-cover rounded-lg cursor-zoom-in hover:opacity-90 transition-opacity"
                  onClick={() => setZoomed(true)}
                  title="Click to zoom"
                />
                <button
                  onClick={() => setZoomed(true)}
                  className="text-xs text-gray-400 hover:text-vr-green flex items-center gap-1"
                >
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                  </svg>
                  Zoom in
                </button>
              </>
            ) : regenerating ? (
              <div className="flex flex-col items-center gap-2 text-gray-300">
                <svg className="animate-spin h-6 w-6 text-amber-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <p className="text-xs text-center text-amber-400">Regenerating visual...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-gray-300">
                <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-xs text-center leading-tight px-2">{ad.image_direction}</p>
              </div>
            )}
          </div>

          {/* Copy fields */}
          <div className="flex-1 p-5 space-y-4">
            {/* Ad set + status header */}
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs bg-vr-green/10 text-vr-green px-2 py-0.5 rounded-full font-medium">
                {ad.adset_tag}
              </span>
              {approved && (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                  ✓ Approved
                </span>
              )}
            </div>

            <Field label="Primary text" value={fields.primary_text} multiline editing={editing} onChange={(v) => setFields((f) => ({ ...f, primary_text: v }))} />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Headline A" value={fields.headline_a} editing={editing} onChange={(v) => setFields((f) => ({ ...f, headline_a: v }))} />
              <Field label="Headline B" value={fields.headline_b} editing={editing} onChange={(v) => setFields((f) => ({ ...f, headline_b: v }))} />
              <Field label="Headline C" value={fields.headline_c} editing={editing} onChange={(v) => setFields((f) => ({ ...f, headline_c: v }))} />
            </div>
            <Field label="Description" value={fields.description} editing={editing} onChange={(v) => setFields((f) => ({ ...f, description: v }))} />

            {/* Rationale */}
            <details className="text-xs text-gray-400 cursor-pointer group">
              <summary className="list-none flex items-center gap-1 cursor-pointer text-gray-400 hover:text-vr-gold">
                <span className="group-open:rotate-90 transition-transform inline-block">›</span>
                Rationale
              </summary>
              <p className="mt-1.5 pl-3 border-l-2 border-gray-100 leading-relaxed text-gray-500">
                {ad.rationale}
              </p>
            </details>

            {/* Actions */}
            <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-50">
              {editing ? (
                <>
                  <button onClick={handleSave} className="px-3 py-1.5 text-sm font-medium bg-green-600 text-white rounded-lg hover:opacity-90">
                    Save
                  </button>
                  <button onClick={() => setEditing(false)} className="px-3 py-1.5 text-sm font-medium bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200">
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  {!approved && (
                    <button onClick={handleApprove} className="px-3 py-1.5 text-sm font-medium bg-green-600 text-white rounded-lg hover:opacity-90">
                      ✅ Approve
                    </button>
                  )}
                  <button onClick={() => setEditing(true)} className="px-3 py-1.5 text-sm font-medium bg-white border border-gray-200 text-gray-600 rounded-lg hover:border-vr-green">
                    ✏️ Edit
                  </button>
                  {!approved && (
                    <button onClick={() => setShowChangeInput(!showChangeInput)} className="px-3 py-1.5 text-sm font-medium bg-white border border-gray-200 text-gray-600 rounded-lg hover:border-amber-400">
                      🔄 Request change
                    </button>
                  )}
                  <button
                    onClick={() => onReject(ad.id)}
                    className="px-3 py-1.5 text-sm font-medium text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg border border-transparent hover:border-red-200 transition-colors"
                  >
                    ✕ Reject
                  </button>
                </>
              )}
            </div>

            {/* Change request input */}
            {showChangeInput && !editing && (
              <div className="bg-amber-50 rounded-lg p-3 space-y-2">
                <textarea
                  value={changeRequest}
                  onChange={(e) => setChangeRequest(e.target.value)}
                  placeholder="What should change? e.g. Make the tone more urgent, focus on GCC market..."
                  rows={2}
                  className="w-full text-sm border border-amber-200 rounded-lg px-3 py-2 focus:outline-none resize-none bg-white"
                />
                <button
                  onClick={handleRegenerate}
                  disabled={regenerating || !changeRequest.trim()}
                  className="px-3 py-1.5 text-sm font-medium bg-vr-green text-white rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
                >
                  {regenerating ? (
                    <>
                      <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Regenerating...
                    </>
                  ) : (
                    "Regenerate"
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Field({ label, value, editing, multiline, onChange }: {
  label: string; value: string; editing: boolean; multiline?: boolean; onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-gray-400 mb-1">{label}</p>
      {editing ? (
        multiline ? (
          <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} className="w-full text-sm border border-vr-gold rounded-lg px-3 py-2 focus:outline-none resize-none" />
        ) : (
          <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className="w-full text-sm border border-vr-gold rounded-lg px-3 py-2 focus:outline-none" />
        )
      ) : (
        <p className="text-sm text-gray-800 leading-relaxed">{value}</p>
      )}
    </div>
  );
}
