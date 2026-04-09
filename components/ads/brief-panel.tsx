"use client";

import { useState, useEffect } from "react";
import type { Brief, BriefTemplate } from "@/types";

const HOOK_TYPES = [
  "Fear stat",
  "Valuation delta",
  "Social proof",
  "Direct question",
  "Case study",
];

const AUDIENCES = [
  "SME founder general",
  "GCC founder",
  "Canadian founder",
  "German founder",
  "Pre-exit 6 months",
];

const QUICK_COUNTS = [3, 5, 7];
const STORAGE_KEY = "vr-brief";

interface Props {
  onGenerate: (brief: Brief) => void;
  loading: boolean;
}

export default function BriefPanel({ onGenerate, loading }: Props) {
  const [open, setOpen] = useState(true);
  const [brief, setBrief] = useState<Brief>({
    hookType: HOOK_TYPES[0],
    targetAudience: AUDIENCES[0],
    variantCount: 3,
    additionalInstruction: "",
  });
  const [customCount, setCustomCount] = useState("");

  // Template state
  const [templates, setTemplates] = useState<BriefTemplate[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);

  // Load brief from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try { setBrief(JSON.parse(saved)); } catch {}
    }
  }, []);

  // Load templates on mount
  useEffect(() => {
    fetch("/api/brief-templates")
      .then((r) => r.json())
      .then((data) => setTemplates(data.templates ?? []))
      .catch(() => {});
  }, []);

  function update<K extends keyof Brief>(key: K, value: Brief[K]) {
    const next = { ...brief, [key]: value };
    setBrief(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function handleCustomCount(val: string) {
    setCustomCount(val);
    const n = parseInt(val);
    if (!isNaN(n) && n >= 1 && n <= 20) update("variantCount", n);
  }

  function handleQuickCount(n: number) {
    setCustomCount("");
    update("variantCount", n);
  }

  function handleLoadTemplate(template: BriefTemplate) {
    const next: Brief = {
      hookType: template.hook_type ?? brief.hookType,
      targetAudience: template.target_audience ?? brief.targetAudience,
      variantCount: template.variant_count ?? brief.variantCount,
      additionalInstruction: template.additional_instruction ?? "",
    };
    setBrief(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  async function handleSaveTemplate() {
    if (!templateName.trim()) {
      setTemplateError("Template name is required");
      return;
    }
    setSavingTemplate(true);
    setTemplateError(null);
    try {
      const res = await fetch("/api/brief-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: templateName.trim(),
          hook_type: brief.hookType,
          target_audience: brief.targetAudience,
          variant_count: brief.variantCount,
          additional_instruction: brief.additionalInstruction,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      setTemplates((prev) => [data.template, ...prev]);
      setTemplateName("");
      setShowSaveForm(false);
    } catch (err) {
      setTemplateError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingTemplate(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm mb-8">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <span className="font-semibold text-vr-green">Creative Brief</span>
        <span className="text-gray-400 text-sm">{open ? "▲ Collapse" : "▼ Expand"}</span>
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-gray-50">
          {/* Template controls */}
          <div className="flex items-center gap-2 mt-4 mb-3">
            {templates.length > 0 && (
              <select
                defaultValue=""
                onChange={(e) => {
                  const t = templates.find((t) => t.id === e.target.value);
                  if (t) handleLoadTemplate(t);
                  e.target.value = "";
                }}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-vr-green bg-white text-gray-600"
              >
                <option value="" disabled>Load template…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => setShowSaveForm(!showSaveForm)}
              className="text-xs text-vr-green hover:underline"
            >
              Save as template
            </button>
          </div>

          {/* Save template inline form */}
          {showSaveForm && (
            <div className="flex items-center gap-2 mb-3">
              <input
                type="text"
                placeholder="Template name"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSaveTemplate(); }}
                className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-vr-green flex-1 max-w-xs"
              />
              <button
                type="button"
                onClick={handleSaveTemplate}
                disabled={savingTemplate}
                className="text-xs bg-vr-green text-white px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                {savingTemplate ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={() => { setShowSaveForm(false); setTemplateError(null); }}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Cancel
              </button>
              {templateError && (
                <span className="text-xs text-red-500">{templateError}</span>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Hook type */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                Hook type
              </label>
              <select
                value={brief.hookType}
                onChange={(e) => update("hookType", e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-vr-green bg-white"
              >
                {HOOK_TYPES.map((h) => (
                  <option key={h}>{h}</option>
                ))}
              </select>
            </div>

            {/* Target audience */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                Target audience
              </label>
              <select
                value={brief.targetAudience}
                onChange={(e) => update("targetAudience", e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-vr-green bg-white"
              >
                {AUDIENCES.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </div>

            {/* Variant count */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                Number of ads
              </label>
              <div className="flex gap-1.5 items-center">
                {QUICK_COUNTS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => handleQuickCount(n)}
                    className={`w-9 h-9 text-sm rounded-lg border font-medium transition-colors flex-shrink-0 ${
                      brief.variantCount === n && !customCount
                        ? "bg-vr-green text-white border-vr-green"
                        : "bg-white text-gray-600 border-gray-200 hover:border-vr-green"
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <input
                  type="number"
                  min={1}
                  max={20}
                  placeholder="?"
                  value={customCount}
                  onChange={(e) => handleCustomCount(e.target.value)}
                  className={`w-12 h-9 text-sm border rounded-lg text-center focus:outline-none transition-colors ${
                    customCount
                      ? "border-vr-green bg-vr-green/5 font-medium"
                      : "border-gray-200 focus:border-vr-green"
                  }`}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">max 20</p>
            </div>

            {/* Generate button */}
            <div className="flex flex-col justify-end">
              <button
                onClick={() => onGenerate(brief)}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-vr-green text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Generating...
                  </>
                ) : (
                  `Generate ${brief.variantCount} ad${brief.variantCount !== 1 ? "s" : ""}`
                )}
              </button>
            </div>
          </div>

          {/* Additional instruction */}
          <div className="mt-4">
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              Additional instruction (optional)
            </label>
            <textarea
              value={brief.additionalInstruction}
              onChange={(e) => update("additionalInstruction", e.target.value)}
              placeholder="e.g. Focus on the GCC market, use the 30% haircut stat prominently, avoid mentioning competitors..."
              rows={2}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-vr-green resize-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}
