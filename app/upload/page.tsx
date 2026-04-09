"use client";

import { useState, useEffect } from "react";
import UploadAdRow from "@/components/upload/upload-ad-row";
import type { GeneratedAd } from "@/types";

/** Renders an SVG string to a 1080×1080 PNG via canvas and triggers download */
async function svgToPng(svgString: string, filename: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const SIZE = 1080;

    // Ensure SVG has explicit width/height at full resolution
    const sized = svgString.replace(
      /<svg([^>]*)>/,
      (match, attrs) => {
        const withSize = attrs
          .replace(/width="[^"]*"/, "")
          .replace(/height="[^"]*"/, "");
        return `<svg${withSize} width="${SIZE}" height="${SIZE}">`;
      }
    );

    const blob = new Blob([sized], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas context unavailable")); return; }
      ctx.drawImage(img, 0, 0, SIZE, SIZE);
      URL.revokeObjectURL(url);

      canvas.toBlob((pngBlob) => {
        if (!pngBlob) { reject(new Error("Canvas toBlob failed")); return; }
        const a = document.createElement("a");
        a.href = URL.createObjectURL(pngBlob);
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        resolve();
      }, "image/png");
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("SVG failed to load as image"));
    };

    img.src = url;
  });
}

export default function UploadQueuePage() {
  const [ads, setAds] = useState<GeneratedAd[]>([]);
  const [mounted, setMounted] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    setMounted(true);
    fetch("/api/queue")
      .then((r) => r.json())
      .then((data) => {
        if (data.queue) setAds(data.queue);
      })
      .catch(() => {});
  }, []);

  async function removeAd(id: string) {
    await fetch("/api/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove", ad: { id } }),
    });
    setAds((prev) => prev.filter((a) => a.id !== id));
  }

  function handleMarkUploaded(id: string) {
    removeAd(id);
  }

  async function handleDownloadPng(ad: GeneratedAd) {
    if (!ad.svg) return;
    try {
      await svgToPng(ad.svg, `vr-ad-${ad.id.slice(-6)}.png`);
    } catch (e) {
      console.error("PNG export failed:", e);
      alert("PNG export failed — try again");
    }
  }

  function downloadDataUrl(dataUrl: string, filename: string) {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    a.click();
  }

  async function handleDownloadAll() {
    setDownloading(true);
    for (const ad of ads) {
      try {
        if (ad.svg) {
          await svgToPng(ad.svg, `vr-ad-${ad.id.slice(-6)}.png`);
        } else if (ad.sourceImageUrl?.startsWith("data:")) {
          const ext = ad.sourceImageUrl.startsWith("data:image/png") ? "png"
            : ad.sourceImageUrl.startsWith("data:image/webp") ? "webp"
            : "jpg";
          downloadDataUrl(ad.sourceImageUrl, `vr-ad-${ad.id.slice(-6)}.${ext}`);
        }
        await new Promise((r) => setTimeout(r, 400));
      } catch (e) {
        console.error("Download failed for", ad.id, e);
      }
    }
    setDownloading(false);
  }

  function handleCopyAllCopy() {
    const text = ads
      .map((ad, i) =>
        [
          `=== Ad ${i + 1} — ${ad.adset_tag} ===`,
          ``,
          `Primary Text:`,
          ad.primary_text,
          ``,
          `Headline A: ${ad.headline_a}`,
          `Headline B: ${ad.headline_b}`,
          `Headline C: ${ad.headline_c}`,
          ``,
          `Description: ${ad.description}`,
          ``,
        ].join("\n")
      )
      .join("\n");

    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = "vr-ad-copy.txt";
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (!mounted) return null;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-vr-green">Upload Queue</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {ads.length === 0
              ? "No ads ready to upload"
              : `${ads.length} ad${ads.length === 1 ? "" : "s"} ready to upload — PNGs export at 1080×1080px`}
          </p>
        </div>

        {ads.length > 0 && (
          <div className="flex gap-2">
            {ads.some((a) => a.svg || a.sourceImageUrl) && (
              <button
                onClick={handleDownloadAll}
                disabled={downloading}
                className="px-4 py-2 text-sm font-medium bg-white border border-gray-200 rounded-lg text-gray-700 hover:border-vr-green hover:text-vr-green disabled:opacity-50"
              >
                {downloading ? "Downloading..." : "Download all images"}
              </button>
            )}
            <button
              onClick={handleCopyAllCopy}
              className="px-4 py-2 text-sm font-medium bg-vr-green text-white rounded-lg hover:opacity-90"
            >
              Export all copy (.txt)
            </button>
          </div>
        )}
      </div>

      {/* Empty state */}
      {ads.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400">
          <p className="text-lg font-medium">Queue is empty</p>
          <p className="text-sm mt-1">
            Approve ads on the{" "}
            <a href="/ads" className="text-vr-gold underline">New Ads</a>{" "}
            page to add them here.
          </p>
        </div>
      )}

      {/* Ad rows */}
      <div className="space-y-4">
        {ads.map((ad) => (
          <UploadAdRow
            key={ad.id}
            ad={ad}
            onMarkUploaded={handleMarkUploaded}
            onDownloadPng={handleDownloadPng}
          />
        ))}
      </div>
    </div>
  );
}
