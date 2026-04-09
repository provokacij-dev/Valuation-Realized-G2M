import { NextRequest, NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/anthropic";
import type Anthropic from "@anthropic-ai/sdk";

const SYSTEM_PROMPT = `You are the lead copywriter for Valuation Realized, a B2B exit advisory firm.
You help SME founders ($2M–$50M revenue) understand how buyers will price their business.
The core differentiator is the "Buyer Lens" — buy-side M&A perspective from 8 years at EY-Parthenon.
Founder: Vaiga Rimsaite, CFA, former EY-Parthenon Senior Manager.

You will be shown one or more ad images. For each image, analyse:
- The visual theme, mood, and message it conveys
- What emotion or problem it addresses
- The type of person it speaks to

Then write Meta ad copy that matches the image's energy and message, adapted for Valuation Realized.

For each image return a JSON object with:
{
  "filename": "...",
  "primary_text": "Full ad copy, 2-4 sentences, conversational, ends with CTA to book a free Exit Readiness Assessment",
  "headline_a": "Punchy headline A, under 40 chars",
  "headline_b": "Punchy headline B, under 40 chars",
  "headline_c": "Punchy headline C, under 40 chars",
  "description": "Link description, 1 sentence"
}

Return a JSON array of these objects — one per image. No markdown, no preamble.`;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const imageFiles = formData.getAll("images") as File[];
    const audience = formData.get("audience") as string || "SME founder general";
    const instruction = formData.get("instruction") as string || "";

    if (!imageFiles || imageFiles.length === 0) {
      return NextResponse.json({ error: "No images provided" }, { status: 400 });
    }

    type ValidMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";
    const VALID_TYPES: ValidMediaType[] = ["image/jpeg", "image/png", "image/gif", "image/webp"];

    // Convert images to base64 for Claude's vision API
    const imageContents: Anthropic.ImageBlockParam[] = [];

    for (const file of imageFiles.slice(0, 10)) {
      const rawType = file.type;
      const mediaType: ValidMediaType = VALID_TYPES.includes(rawType as ValidMediaType)
        ? (rawType as ValidMediaType)
        : "image/jpeg";
      const bytes = await file.arrayBuffer();
      const base64 = Buffer.from(bytes).toString("base64");
      imageContents.push({
        type: "image",
        source: {
          type: "base64",
          media_type: mediaType,
          data: base64,
        },
      });
    }

    const userPrompt: Anthropic.ContentBlockParam[] = [
      ...imageContents,
      {
        type: "text" as const,
        text: `Target audience: ${audience}${instruction ? `\nAdditional instruction: ${instruction}` : ""}

Image filenames (in order): ${imageFiles.map((f) => f.name).join(", ")}

Analyse each image and generate ad copy for each one. Return a JSON array.`,
      },
    ];

    const client = getAnthropicClient();
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const content = response.content[0];
    if (content.type !== "text") throw new Error("Unexpected response type");

    let copies: object[];
    try {
      const text = content.text.replace(/^```json\n?|\n?```$/g, "").trim();
      copies = JSON.parse(text);
      if (!Array.isArray(copies)) copies = [copies];
    } catch {
      throw new Error("Claude returned invalid JSON — try again");
    }

    // Ensure filenames match
    copies = copies.map((copy, i) => ({
      ...(copy as Record<string, string>),
      filename: imageFiles[i]?.name || `Image ${i + 1}`,
    }));

    return NextResponse.json({ copies });
  } catch (error) {
    console.error("Image generation error:", error);
    const message = error instanceof Error ? error.message : "Generation failed — try again";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
