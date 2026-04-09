"use client";

import { useState, useEffect, useCallback } from "react";
import RuleRow from "@/components/skills/rule-row";
import type { Skill } from "@/types";

const CATEGORIES = ["Copy", "Visual", "GCC", "Audience", "Format", "Never-do"] as const;

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [addingNew, setAddingNew] = useState(false);
  const [newCategory, setNewCategory] = useState<Skill["category"]>("Copy");
  const [newInstruction, setNewInstruction] = useState("");
  const [saving, setSaving] = useState(false);

  const loadSkills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/skills");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSkills(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load skills");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  async function callSkillsApi(payload: object) {
    const res = await fetch("/api/skills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.json();
  }

  async function handleArchive(ruleId: string) {
    await callSkillsApi({ action: "DELETE", rule_id: ruleId });
    setSkills((prev) =>
      prev.map((s) => (s.rule_id === ruleId ? { ...s, status: "archived" } : s))
    );
  }

  async function handleEdit(ruleId: string, newInstruction: string) {
    const skill = skills.find((s) => s.rule_id === ruleId);
    if (!skill) return;
    await callSkillsApi({
      action: "AMEND",
      rule_id: ruleId,
      category: skill.category,
      instruction: newInstruction,
      evidence: "Manual edit",
    });
    setSkills((prev) =>
      prev.map((s) =>
        s.rule_id === ruleId ? { ...s, instruction: newInstruction } : s
      )
    );
  }

  async function handleRestore(ruleId: string) {
    await callSkillsApi({ action: "RESTORE", rule_id: ruleId });
    setSkills((prev) =>
      prev.map((s) => (s.rule_id === ruleId ? { ...s, status: "active" } : s))
    );
  }

  async function handleAddNew() {
    if (!newInstruction.trim()) return;
    setSaving(true);
    const result = await callSkillsApi({
      action: "NEW",
      category: newCategory,
      instruction: newInstruction.trim(),
      evidence: "Manual",
      source: "Manual",
    });
    if (result.skill) {
      setSkills((prev) => [...prev, result.skill]);
    }
    setNewInstruction("");
    setAddingNew(false);
    setSaving(false);
  }

  const activeSkills = skills.filter((s) => s.status === "active");
  const archivedSkills = skills.filter((s) => s.status === "archived");

  const grouped = CATEGORIES.reduce((acc, cat) => {
    acc[cat] = activeSkills.filter((s) => s.category === cat);
    return acc;
  }, {} as Record<string, Skill[]>);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-vr-green">Skills</h1>
        <button
          onClick={() => setAddingNew(!addingNew)}
          className="px-4 py-2 text-sm font-medium bg-vr-green text-white rounded-lg hover:opacity-90"
        >
          + Add rule manually
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Add new rule form */}
      {addingNew && (
        <div className="mb-8 bg-white rounded-xl border border-vr-gold/30 shadow-sm p-5 space-y-4">
          <h3 className="font-semibold text-vr-green">New rule</h3>
          <div className="flex gap-3 items-start">
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as Skill["category"])}
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-vr-green bg-white shrink-0"
            >
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <textarea
              value={newInstruction}
              onChange={(e) => setNewInstruction(e.target.value)}
              placeholder="e.g. Always open primary text with a specific number or stat..."
              rows={2}
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-vr-green resize-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAddNew}
              disabled={saving || !newInstruction.trim()}
              className="px-4 py-2 text-sm font-medium bg-vr-green text-white rounded-lg hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save rule"}
            </button>
            <button
              onClick={() => setAddingNew(false)}
              className="px-4 py-2 text-sm font-medium bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <p className="text-sm">Loading skills...</p>
        </div>
      )}

      {/* Active rules grouped by category */}
      {!loading && (
        <div className="space-y-6 mb-10">
          {CATEGORIES.map((cat) => {
            const catSkills = grouped[cat];
            if (catSkills.length === 0) return null;
            return (
              <div key={cat} className="bg-white rounded-xl border border-gray-100 shadow-sm">
                <div className="px-5 py-3 border-b border-gray-50 flex items-center justify-between">
                  <h3 className="font-semibold text-vr-green text-sm">{cat}</h3>
                  <span className="text-xs text-gray-400">{catSkills.length} rule{catSkills.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="px-5">
                  {catSkills.map((skill) => (
                    <RuleRow
                      key={skill.rule_id}
                      skill={skill}
                      onArchive={handleArchive}
                      onEdit={handleEdit}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {activeSkills.length === 0 && !loading && (
            <div className="text-center py-16 text-gray-400">
              <p className="text-sm">No active skills yet. Add rules manually or generate ads to get Claude&apos;s suggestions.</p>
            </div>
          )}
        </div>
      )}

      {/* Archived rules */}
      {!loading && archivedSkills.length > 0 && (
        <div className="mb-8">
          <button
            onClick={() => setShowArchived(!showArchived)}
            className="flex items-center gap-2 text-sm font-medium text-gray-400 hover:text-gray-600 mb-3"
          >
            <span>{showArchived ? "▲" : "▼"}</span>
            Archived rules ({archivedSkills.length})
          </button>

          {showArchived && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
              <div className="px-5">
                {archivedSkills.map((skill) => (
                  <RuleRow
                    key={skill.rule_id}
                    skill={skill}
                    onArchive={handleArchive}
                    onEdit={handleEdit}
                    onRestore={handleRestore}
                    archived
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
