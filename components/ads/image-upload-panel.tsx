"use client";

import { useState, useRef } from "react";
import type { GeneratedAd } from "@/types";

interface Props {
  onAdsGenerated: (ads: GeneratedAd[]) => void;
}

/** Convert a File to a base64 data URL — self-contained, never expires */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ImageUploadPanel({ onAdsGenerated }: Props) {
  const [images, setImages] = useState<{ file: File; preview: string }[]>([]);
  const [audience, setAudience] = useState("SME founder general");
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    const incoming = Array.from(files).filter((f) => f.type.startsWith("image/")).slice(0, 10);
    // Convert to data URLs so previews are self-contained and never expire
    const newImages = await Promise.all(
      incoming.map(async (file) => ({ file, preview: await fileToDataUrl(file) }))
    );
    setImages((prev) => [...prev, ...newImages].slice(0, 10));
  }

  function removeImage(i: number) {
    // data URLs don't need revoking — just remove from state
    setImages((prev) => prev.filter((_, j) => j !== i));
  }

  async function handleGenerate() {
    if (images.length === 0) return;
    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      images.forEach((img) => formData.append("images", img.file));
      formData.append("audience", audience);
      formData.append("instruction", instruction);

      const res = await fetch("/api/generate-from-image", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      // Convert API response to GeneratedAd objects
      const ads: GeneratedAd[] = (data.copies as Array<{
        filename: string;
        primary_text: string;
        headline_a: string;
        headline_b: string;
        headline_c: string;
        description: string;
      }>).map((copy, i) => {
        // Match copy to the uploaded image by index
        const sourceImage = images[i] ?? images[images.length - 1];
        return {
          id: `img-${Date.now()}-${i}`,
          primary_text: copy.primary_text,
          headline_a: copy.headline_a,
          headline_b: copy.headline_b,
          headline_c: copy.headline_c,
          description: copy.description,
          image_direction: copy.filename,
          adset_tag: "From image",
          rationale: `Generated from uploaded image: ${copy.filename}`,
          svg_prompt: "",
          sourceImageUrl: sourceImage?.preview,
          status: "pending",
        };
      });

      onAdsGenerated(ads);

      // Clear the panel after successful generation
      setImages([]);
      setInstruction("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed — try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
      <div className="px-5 py-4 border-b border-gray-50">
        <h3 className="font-semibold text-vr-green">Generate copy from your images</h3>
        <p className="text-xs text-gray-400 mt-0.5">
          Upload existing ad images — Claude will analyse each one and write matching ad copy.
        </p>
      </div>

      <div className="p-5 space-y-4">
        {/* Drop zone */}
        <div
          className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-vr-green transition-colors"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); /* async, fires and forgets */ }}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <svg className="h-8 w-8 mx-auto text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className="text-sm text-gray-500">Drop images here or <span className="text-vr-gold underline">browse</span></p>
          <p className="text-xs text-gray-400 mt-1">JPG, PNG, WebP — up to 10 images</p>
        </div>

        {/* Image previews */}
        {images.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {images.map((img, i) => (
              <div key={i} className="relative group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.preview}
                  alt={img.file.name}
                  className="h-20 w-20 object-cover rounded-lg border border-gray-200"
                />
                <button
                  onClick={() => removeImage(i)}
                  className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ✕
                </button>
                <p className="text-xs text-gray-400 mt-0.5 truncate w-20">{img.file.name}</p>
              </div>
            ))}
          </div>
        )}

        {/* Options */}
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-40">
            <label className="block text-xs font-medium text-gray-500 mb-1">Target audience</label>
            <select
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-vr-green bg-white"
            >
              <option>SME founder general</option>
              <option>GCC founder</option>
              <option>Canadian founder</option>
              <option>German founder</option>
              <option>Pre-exit 6 months</option>
            </select>
          </div>
          <div className="flex-1 min-w-48">
            <label className="block text-xs font-medium text-gray-500 mb-1">Additional instruction (optional)</label>
            <input
              type="text"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="e.g. emphasise the 30% haircut stat..."
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-vr-green"
            />
          </div>
        </div>

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={loading || images.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-vr-green text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Analysing images...
            </>
          ) : (
            `Generate copy for ${images.length || 0} image${images.length !== 1 ? "s" : ""}`
          )}
        </button>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{error}</div>
        )}
      </div>
    </div>
  );
}
