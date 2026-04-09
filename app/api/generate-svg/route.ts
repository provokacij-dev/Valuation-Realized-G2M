import { NextRequest, NextResponse } from "next/server";
import { getAnthropicClient } from "@/lib/anthropic";
import { buildSvgPrompt } from "@/lib/prompts";

function isValidSvg(svg: string): boolean {
  if (!svg || svg.length < 200) return false;
  // Must contain at least one drawing element with content
  const hasDrawingElements = /<(rect|text|path|circle|line|polygon|ellipse|g)[^>]*>/.test(svg);
  const hasContent = svg.replace(/<[^>]+>/g, "").trim().length > 0 || hasDrawingElements;
  return hasDrawingElements && hasContent;
}

function extractSvg(text: string): string {
  const svgStart = text.indexOf("<svg");
  const svgEnd = text.lastIndexOf("</svg>") + 6;
  if (svgStart !== -1 && svgEnd > svgStart) {
    return text.slice(svgStart, svgEnd);
  }
  return text.trim();
}

async function generateSvg(svgInstruction: string, attempt: number = 1): Promise<string> {
  const client = getAnthropicClient();

  const extraGuidance = attempt > 1
    ? "\n\nIMPORTANT: The previous attempt produced an empty or invalid SVG. Make sure to include substantial visual content — at minimum: a background rect, large headline text, at least one data element (number, bar, or comparison), and the Valuation Realized wordmark. Do NOT return an empty SVG."
    : "";

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [{ role: "user", content: buildSvgPrompt(svgInstruction) + extraGuidance }],
  });

  const content = response.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type");

  return extractSvg(content.text.trim());
}

export async function POST(request: NextRequest) {
  try {
    const { svg_prompt } = await request.json();

    if (!svg_prompt) {
      return NextResponse.json({ error: "svg_prompt is required" }, { status: 400 });
    }

    // First attempt
    let svg = await generateSvg(svg_prompt, 1);

    // Retry once if blank/invalid
    if (!isValidSvg(svg)) {
      console.log("SVG attempt 1 invalid, retrying...");
      svg = await generateSvg(svg_prompt, 2);
    }

    // If still invalid, return a branded fallback SVG
    if (!isValidSvg(svg)) {
      console.log("SVG attempt 2 invalid, returning fallback");
      svg = `<svg viewBox="0 0 1080 1080" xmlns="http://www.w3.org/2000/svg" width="1080" height="1080">
  <rect width="1080" height="1080" fill="#F7F5F1"/>
  <rect x="0" y="0" width="1080" height="8" fill="#BC8F4D"/>
  <rect x="80" y="80" width="920" height="920" rx="24" fill="#12301E"/>
  <text x="540" y="420" font-family="system-ui, sans-serif" font-size="72" font-weight="bold" fill="#F7F5F1" text-anchor="middle">30%</text>
  <text x="540" y="520" font-family="system-ui, sans-serif" font-size="36" fill="#BC8F4D" text-anchor="middle">Valuation Haircut</text>
  <text x="540" y="620" font-family="system-ui, sans-serif" font-size="24" fill="#F7F5F1" text-anchor="middle" opacity="0.7">Most founders never see it coming.</text>
  <text x="540" y="700" font-family="system-ui, sans-serif" font-size="20" fill="#F7F5F1" text-anchor="middle" opacity="0.5">We help you fix it before buyers find it.</text>
  <text x="980" y="980" font-family="system-ui, sans-serif" font-size="16" fill="#BC8F4D" text-anchor="end" opacity="0.8">Valuation Realized</text>
</svg>`;
    }

    return NextResponse.json({ svg });
  } catch (error) {
    console.error("SVG generation error:", error);
    return NextResponse.json(
      { error: "SVG generation failed — try again" },
      { status: 500 }
    );
  }
}
