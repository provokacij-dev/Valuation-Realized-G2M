"use client";

import { useState } from "react";
import type { GeneratedAd } from "@/types";

interface Props {
  ad: GeneratedAd;
  onMarkUploaded: (id: string) => void;
  onDownloadPng: (ad: GeneratedAd) => void;
}

/** Force SVG to fill its container regardless of hardcoded width/height */
function normaliseSvg(svg: string): string {
  return svg.replace(/<svg([^>]*)>/i, (_match, attrs: string) => {
    const cleaned = attrs
      .replace(/\bwidth="[^"]*"/g, "")
      .replace(/\bheight="[^"]*"/g, "");
    return `<svg${cleaned} width="100%" height="100%" style="display:block;">`;
  });
}

/** Download a data: URL directly as a file */
function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

export default function UploadAdRow({ ad, onMarkUploaded, onDownloadPng }: Props) {
  const [copied, setCopied] = useState<string | null>(null);

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    }).catch(() => {});
  }

  function handleDownload() {
    if (ad.svg) {
      onDownloadPng(ad);
    } else if (ad.sourceImageUrl?.startsWith("data:")) {
      // Image-uploaded ad — download the original image directly
      const ext = ad.sourceImageUrl.startsWith("data:image/png") ? "png"
        : ad.sourceImageUrl.startsWith("data:image/webp") ? "webp"
        : "jpg";
      downloadDataUrl(ad.sourceImageUrl, `vr-ad-${ad.id.slice(-6)}.${ext}`);
    }
  }

  const hasVisual = !!(ad.svg || ad.sourceImageUrl);

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="flex flex-col lg:flex-row gap-6">

        {/* Visual thumbnail */}
        <div className="lg:w-48 shrink-0">
          <div className="w-full aspect-square bg-gray-50 rounded-lg overflow-hidden flex items-center justify-center border border-gray-100">
            {ad.svg ? (
              <div
                className="w-full h-full"
                dangerouslySetInnerHTML={{ __html: normaliseSvg(ad.svg) }}
              />
            ) : ad.sourceImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={ad.sourceImageUrl}
                alt="Ad creative"
                className="w-full h-full object-cover"
              />
            ) : (
              <p className="text-xs text-gray-300 text-center px-2">No visual</p>
            )}
          </div>
          <button
            onClick={handleDownload}
            disabled={!hasVisual}
            className="mt-2 w-full text-xs text-center text-gray-400 hover:text-vr-green py-1.5 border border-gray-200 rounded-lg hover:border-vr-green transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {ad.svg ? "Download PNG (1080px)" : "Download image"}
          </button>
        </div>

        {/* Copy fields */}
        <div className="flex-1 space-y-3">
          <CopyField label="Primary text" value={ad.primary_text} fieldKey="primary" copied={copied} onCopy={copyToClipboard} multiline />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <CopyField label="Headline A" value={ad.headline_a} fieldKey="ha" copied={copied} onCopy={copyToClipboard} />
            <CopyField label="Headline B" value={ad.headline_b} fieldKey="hb" copied={copied} onCopy={copyToClipboard} />
            <CopyField label="Headline C" value={ad.headline_c} fieldKey="hc" copied={copied} onCopy={copyToClipboard} />
          </div>
          <CopyField label="Description" value={ad.description} fieldKey="desc" copied={copied} onCopy={copyToClipboard} />

          {/* Ad set + actions */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-50">
            <span className="text-xs bg-vr-green/10 text-vr-green px-2 py-0.5 rounded-full">
              {ad.adset_tag}
            </span>
            <button
              onClick={() => onMarkUploaded(ad.id)}
              className="px-4 py-1.5 text-sm font-medium bg-green-600 text-white rounded-lg hover:opacity-90"
            >
              ✓ Mark as uploaded
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CopyField({ label, value, fieldKey, copied, onCopy, multiline }: {
  label: string;
  value: string;
  fieldKey: string;
  copied: string | null;
  onCopy: (v: string, key: string) => void;
  multiline?: boolean;
}) {
  const isCopied = copied === fieldKey;
  return (
    <div className="relative group">
      <p className="text-xs font-medium text-gray-400 mb-1">{label}</p>
      <div className="bg-gray-50 rounded-lg px-3 py-2 pr-10">
        <p className={`text-sm text-gray-800 leading-relaxed ${multiline ? "" : "truncate"}`}>
          {value}
        </p>
      </div>
      <button
        onClick={() => onCopy(value, fieldKey)}
        title="Copy"
        className="absolute right-2 top-6 text-gray-300 hover:text-vr-green opacity-0 group-hover:opacity-100 transition-opacity"
      >
        {isCopied ? (
          <svg className="h-4 w-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        )}
      </button>
    </div>
  );
}
