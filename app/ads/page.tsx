"use client";

import { useState, useEffect, useRef } from "react";
import BriefPanel from "@/components/ads/brief-panel";
import GeneratedAdCard from "@/components/ads/generated-ad-card";
import SkillUpdateCard from "@/components/ads/skill-update-card";
import ImageUploadPanel from "@/components/ads/image-upload-panel";
import type { GeneratedAd, SkillUpdateProposal, Brief } from "@/types";

// ── Queue helpers ────────────────────────────────────────────────────────────

async function addToQueue(ad: GeneratedAd): Promise<void> {
  await fetch("/api/queue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "add", ad }),
  });
}

async function removeFromQueue(id: string): Promise<void> {
  await fetch("/api/queue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "remove", ad: { id } }),
  });
}

// ── Drafts helpers ───────────────────────────────────────────────────────────

async function loadDrafts(): Promise<GeneratedAd[]> {
  try {
    const res = await fetch("/api/drafts");
    const data = await res.json();
    return data.drafts ?? [];
  } catch {
    return [];
  }
}

async function saveDrafts(ads: GeneratedAd[]): Promise<void> {
  // Strip blob: URLs (they expire) but keep data: URLs (self-contained base64)
  const serialisable = ads.map((ad) => ({
    ...ad,
    sourceImageUrl: ad.sourceImageUrl?.startsWith("blob:") ? undefined : ad.sourceImageUrl,
  }));
  // data: URLs can be large — skip persisting them if the payload is too big (>4MB)
  const json = JSON.stringify(serialisable, null, 2);
  if (json.length > 4 * 1024 * 1024) {
    // Strip image data from drafts to keep the file manageable
    const slim = serialisable.map((ad) => ({ ...ad, sourceImageUrl: undefined }));
    await fetch("/api/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set", drafts: slim }),
    });
    return;
  }
  await fetch("/api/drafts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "set", drafts: serialisable }),
  });
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AdsPage() {
  const [ads, setAds] = useState<GeneratedAd[]>([]);
  const [skillUpdates, setSkillUpdates] = useState<SkillUpdateProposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingSvgs, setLoadingSvgs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftsLoaded, setDraftsLoaded] = useState(false);
  const [brief, setBrief] = useState<Brief>({
    hookType: "Fear stat",
    targetAudience: "SME founder general",
    variantCount: 3,
    additionalInstruction: "",
  });

  // Track whether we're in the middle of generating so we don't overwrite with stale drafts
  const generatingRef = useRef(false);

  // ── Load drafts on mount ──────────────────────────────────────────────────
  useEffect(() => {
    loadDrafts().then((saved) => {
      if (saved.length > 0 && !generatingRef.current) {
        setAds(saved);
      }
      setDraftsLoaded(true);
    });
  }, []);

  // ── Sync ads → drafts.json whenever ads state changes ────────────────────
  // Debounced so rapid SVG updates don't hammer the API
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!draftsLoaded) return; // don't write before we've loaded
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      saveDrafts(ads);
    }, 600);
    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, [ads, draftsLoaded]);

  // ── Generate from brief ───────────────────────────────────────────────────
  async function handleGenerate(b: Brief) {
    setBrief(b);
    setLoading(true);
    setError(null);
    generatingRef.current = true;

    // Keep approved ads AND image-uploaded pending ads; only clear previous brief-generated drafts
    setAds((prev) => prev.filter((a) => a.status === "approved" || !!a.sourceImageUrl));
    setSkillUpdates([]);

    try {
      // Kick off background job — returns immediately with job_id
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief: b }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const jobId: string = data.job_id;

      // Poll until complete — survives navigation away and phone lock
      const generatedAds: GeneratedAd[] = await new Promise((resolve, reject) => {
        const poll = setInterval(async () => {
          try {
            const jobRes = await fetch(`/api/generate/job?id=${jobId}`);
            const job = await jobRes.json();
            if (job.status === "complete") {
              clearInterval(poll);
              resolve(job.ads ?? []);
              setSkillUpdates(job.skill_updates || []);
            } else if (job.status === "error") {
              clearInterval(poll);
              reject(new Error(job.error || "Generation failed"));
            }
          } catch (e) {
            clearInterval(poll);
            reject(e);
          }
        }, 2000);
      });

      setAds((prev) => {
        const keep = prev.filter((a) => a.status === "approved" || !!a.sourceImageUrl);
        return [...keep, ...generatedAds];
      });
      setLoading(false);

      // Generate SVGs in parallel
      setLoadingSvgs(true);
      const svgResults = await Promise.allSettled(
        generatedAds.map(async (ad) => {
          if (!ad.svg_prompt) return { id: ad.id, svg: undefined };
          const svgRes = await fetch("/api/generate-svg", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ svg_prompt: ad.svg_prompt }),
          });
          const svgData = await svgRes.json();
          return { id: ad.id, svg: svgData.svg };
        })
      );

      setAds((prev) =>
        prev.map((ad) => {
          const result = svgResults.find(
            (r) => r.status === "fulfilled" && r.value.id === ad.id
          );
          if (result?.status === "fulfilled" && result.value.svg) {
            return { ...ad, svg: result.value.svg };
          }
          return ad;
        })
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed — try again");
    } finally {
      setLoading(false);
      setLoadingSvgs(false);
      generatingRef.current = false;
    }
  }

  // ── Approve — removes from New Ads, moves to Upload Queue ────────────────
  function handleApprove(approvedAd: GeneratedAd) {
    setAds((prev) => prev.filter((a) => a.id !== approvedAd.id));
    addToQueue({ ...approvedAd, status: "approved" });

    // Fire skill extraction in background — non-blocking, don't await
    fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "extract_skill", ad: approvedAd }),
    }).catch(() => {});
  }

  // ── Replace (after change request) ───────────────────────────────────────
  function handleReplace(oldId: string, newAd: GeneratedAd) {
    setAds((prev) => prev.map((a) => (a.id === oldId ? newAd : a)));
  }

  // ── Reject ────────────────────────────────────────────────────────────────
  function handleReject(id: string) {
    setAds((prev) => prev.filter((a) => a.id !== id));
    removeFromQueue(id);
  }

  // ── Image upload ──────────────────────────────────────────────────────────
  function handleImageAdsGenerated(newAds: GeneratedAd[]) {
    setAds((prev) => [...prev, ...newAds]);
  }

  // ── Skill updates ─────────────────────────────────────────────────────────
  async function handleSkillAccept(proposal: SkillUpdateProposal) {
    // Always write to local skills.json (persists across reloads)
    await fetch("/api/skills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: proposal.type,
        rule_id: proposal.rule_id,
        category: proposal.category,
        instruction: proposal.proposed_instruction,
        evidence: proposal.evidence,
        source: "Claude suggestion",
      }),
    });
    // Also fire Make webhook if configured (best-effort, don't block on failure)
    fetch("/api/webhook/skill-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: proposal.type,
        rule_id: proposal.rule_id,
        category: proposal.category,
        instruction: proposal.proposed_instruction,
        evidence: proposal.evidence,
      }),
    }).catch(() => {});
  }

  const pendingCount = ads.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-vr-green">New Ads</h1>
          {pendingCount > 0 && (
            <p className="text-xs text-gray-400 mt-0.5">
              {pendingCount} draft{pendingCount !== 1 ? "s" : ""} — approve to move to Upload Queue
            </p>
          )}
        </div>
        <a
          href="/upload"
          className="text-sm font-medium text-vr-gold hover:underline"
        >
          Upload Queue →
        </a>
      </div>

      <BriefPanel onGenerate={handleGenerate} loading={loading} />

      {/* Error */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400">
          <svg className="animate-spin h-8 w-8 text-vr-green" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="mt-3 text-sm">Claude is generating your ads...</p>
        </div>
      )}

      {/* SVG loading banner */}
      {loadingSvgs && !loading && (
        <div className="mb-4 flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5 text-sm text-blue-700">
          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Generating SVG visuals...
        </div>
      )}

      {/* Ad cards — from generation or image upload */}
      {ads.length > 0 && (
        <div className="space-y-6 mb-10">
          <h2 className="text-lg font-semibold text-vr-green">
            Ads ({ads.length})
          </h2>
          {ads.map((ad) => (
            <GeneratedAdCard
              key={ad.id}
              ad={ad}
              brief={brief}
              onApprove={handleApprove}
              onReplace={handleReplace}
              onReject={handleReject}
            />
          ))}
        </div>
      )}

      {/* Image upload section */}
      <div className="mb-10">
        <h2 className="text-lg font-semibold text-vr-green mb-4">Generate copy from existing images</h2>
        <ImageUploadPanel onAdsGenerated={handleImageAdsGenerated} />
      </div>

      {/* Skill updates */}
      {skillUpdates.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-vr-green">
            Proposed Skill Updates ({skillUpdates.length})
          </h2>
          <p className="text-sm text-gray-500">
            Claude identified these pattern-based rule changes. Review and accept what makes sense.
          </p>
          {skillUpdates.map((proposal, i) => (
            <SkillUpdateCard
              key={i}
              proposal={proposal}
              onAccept={handleSkillAccept}
              onReject={() =>
                setSkillUpdates((prev) => prev.filter((_, j) => j !== i))
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
