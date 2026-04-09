"use client";

import { useState } from "react";
import type { Skill } from "@/types";

interface Props {
  skill: Skill;
  onArchive: (ruleId: string) => Promise<void>;
  onEdit: (ruleId: string, newInstruction: string) => Promise<void>;
  onRestore?: (ruleId: string) => Promise<void>;
  archived?: boolean;
}

const CATEGORY_COLORS: Record<string, string> = {
  Copy: "bg-blue-50 text-blue-700",
  Visual: "bg-purple-50 text-purple-700",
  GCC: "bg-amber-50 text-amber-700",
  Audience: "bg-green-50 text-green-700",
  Format: "bg-gray-100 text-gray-600",
  "Never-do": "bg-red-50 text-red-700",
};

export default function RuleRow({ skill, onArchive, onEdit, onRestore, archived }: Props) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(skill.instruction);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await onEdit(skill.rule_id, text);
    setEditing(false);
    setSaving(false);
  }

  return (
    <div className={`flex items-start gap-3 py-3 border-b border-gray-50 last:border-0 ${archived ? "opacity-60" : ""}`}>
      <span className="text-xs text-gray-300 w-10 shrink-0 pt-0.5">{skill.rule_id}</span>

      <span
        className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
          CATEGORY_COLORS[skill.category] || "bg-gray-100 text-gray-600"
        }`}
      >
        {skill.category}
      </span>

      <div className="flex-1 min-w-0">
        {editing ? (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            className="w-full text-sm border border-vr-gold rounded-lg px-3 py-2 focus:outline-none resize-none"
          />
        ) : (
          <p
            className="text-sm text-gray-800 leading-relaxed cursor-pointer hover:text-vr-green"
            onClick={() => !archived && setEditing(true)}
            title={archived ? "" : "Click to edit"}
          >
            {text}
          </p>
        )}
        <div className="flex items-center gap-3 mt-1">
          <span className="text-xs text-gray-300">{skill.added_date}</span>
          {skill.source && (
            <span className="text-xs bg-gray-50 text-gray-400 px-1.5 py-0.5 rounded">
              {skill.source}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {editing ? (
          <>
            <button
              onClick={handleSave}
              disabled={saving}
              className="text-xs text-vr-green font-medium hover:underline disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              onClick={() => { setEditing(false); setText(skill.instruction); }}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Cancel
            </button>
          </>
        ) : archived ? (
          <button
            onClick={() => onRestore?.(skill.rule_id)}
            className="text-xs text-blue-500 hover:underline"
          >
            Restore
          </button>
        ) : (
          <button
            onClick={() => onArchive(skill.rule_id)}
            className="text-xs text-gray-300 hover:text-red-400"
          >
            Archive
          </button>
        )}
      </div>
    </div>
  );
}
