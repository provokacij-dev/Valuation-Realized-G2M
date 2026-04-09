"use client";

import { useState } from "react";
import type { SkillUpdateProposal } from "@/types";

const TYPE_STYLES: Record<string, string> = {
  NEW: "bg-blue-100 text-blue-800",
  AMEND: "bg-amber-100 text-amber-800",
  REVIEW: "bg-gray-100 text-gray-700",
};

interface Props {
  proposal: SkillUpdateProposal;
  onAccept: (proposal: SkillUpdateProposal) => Promise<void>;
  onReject: () => void;
}

export default function SkillUpdateCard({ proposal, onAccept, onReject }: Props) {
  const [editing, setEditing] = useState(false);
  const [editedText, setEditedText] = useState(proposal.proposed_instruction);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  if (done) return null;

  async function handleAccept(text: string) {
    setSaving(true);
    await onAccept({ ...proposal, proposed_instruction: text });
    setDone(true);
    setSaving(false);
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TYPE_STYLES[proposal.type]}`}>
          {proposal.type}
        </span>
        <span className="text-xs text-gray-400 px-2 py-0.5 bg-gray-50 rounded-full">
          {proposal.category}
        </span>
        {proposal.rule_id && (
          <span className="text-xs text-gray-300">{proposal.rule_id}</span>
        )}
      </div>

      {/* AMEND: show side by side */}
      {proposal.type === "AMEND" && proposal.current_instruction && (
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <p className="text-xs font-medium text-gray-400 mb-1">Current</p>
            <p className="text-xs text-gray-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2 leading-relaxed">
              {proposal.current_instruction}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400 mb-1">Proposed</p>
            {editing ? (
              <textarea
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                rows={3}
                className="w-full text-xs border border-vr-gold rounded-lg px-3 py-2 focus:outline-none resize-none"
              />
            ) : (
              <p className="text-xs text-gray-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2 leading-relaxed">
                {editedText}
              </p>
            )}
          </div>
        </div>
      )}

      {/* NEW or REVIEW */}
      {proposal.type !== "AMEND" && (
        <div className="mb-3">
          {editing ? (
            <textarea
              value={editedText}
              onChange={(e) => setEditedText(e.target.value)}
              rows={3}
              className="w-full text-sm border border-vr-gold rounded-lg px-3 py-2 focus:outline-none resize-none"
            />
          ) : (
            <p className="text-sm text-gray-700 leading-relaxed">{editedText}</p>
          )}
        </div>
      )}

      {/* Evidence */}
      <p className="text-xs text-gray-400 italic mb-4">
        Evidence: {proposal.evidence}
      </p>

      {/* Actions */}
      <div className="flex gap-2">
        {editing ? (
          <>
            <button
              onClick={() => handleAccept(editedText)}
              disabled={saving}
              className="px-3 py-1.5 text-xs font-medium bg-vr-green text-white rounded-lg hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save & accept"}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => handleAccept(editedText)}
              disabled={saving}
              className="px-3 py-1.5 text-xs font-medium bg-vr-green text-white rounded-lg hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Accept"}
            </button>
            <button
              onClick={() => setEditing(true)}
              className="px-3 py-1.5 text-xs font-medium bg-white border border-gray-200 text-gray-600 rounded-lg hover:border-vr-green"
            >
              Edit then accept
            </button>
            <button
              onClick={() => { onReject(); setDone(true); }}
              className="px-3 py-1.5 text-xs font-medium text-gray-400 hover:text-red-500"
            >
              Reject
            </button>
          </>
        )}
      </div>
    </div>
  );
}
