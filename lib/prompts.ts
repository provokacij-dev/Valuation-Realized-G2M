import type { Skill, Rule, AdSummary, Brief } from "@/types";

export function buildGenerationPrompt(
  skills: Skill[],
  summaryData: AdSummary[],
  rules: Rule[],
  brief: Brief
): string {
  const skillsList = skills
    .map((s, i) => `${i + 1}. [${s.category}] ${s.instruction}`)
    .join("\n");

  const summaryJson = JSON.stringify(summaryData, null, 2);

  const rulesList = rules
    .map(
      (r) =>
        `- [${r.signal}] ${r.hook_angle} (${r.geo}): CPL $${r.cpl}, CTR ${r.ctr}%, Booking rate ${r.booking_rate}% — ${r.rule_extracted}`
    )
    .join("\n");

  return `You are the lead creative strategist for Valuation Realized, a B2B exit advisory firm.
You help SME founders ($2M–$50M revenue) understand how buyers will price their business.
The core differentiator is the "Buyer Lens" — buy-side M&A perspective from 8 years at EY-Parthenon.
Founder: Vaiga Rimsaite, CFA, former EY-Parthenon Senior Manager, $70bn+ combined deal experience.

PRODUCTION SKILL (follow these instructions on every generation):
${skillsList || "No active skills yet — use best judgment."}

PERFORMANCE DATA (last 7 days from Meta):
${summaryData.length > 0 ? summaryJson : "No performance data available yet."}

ACCUMULATED RULES (what has worked and not worked):
${rulesList || "No rules accumulated yet."}

BRIEF:
Hook type: ${brief.hookType}
Target audience: ${brief.targetAudience}
Number of variants: ${brief.variantCount}
Additional instruction: ${brief.additionalInstruction || "None"}

Generate exactly ${brief.variantCount} ad variants. Each variant must use a different angle, hook, or framing.
For each variant, return a JSON object with these exact fields:
{
  "primary_text": "Full ad copy, 2-4 sentences, conversational, ends with CTA",
  "headline_a": "Punchy headline option A, under 40 chars",
  "headline_b": "Punchy headline option B, under 40 chars",
  "headline_c": "Punchy headline option C, under 40 chars",
  "description": "Link description, 1 sentence",
  "image_direction": "Plain text description of the visual concept for the SVG graphic",
  "adset_tag": "Which campaign/audience this targets",
  "rationale": "1 sentence explaining why this angle, referencing performance data if available",
  "svg_prompt": "Detailed instruction for SVG graphic generation — be specific about layout, numbers to display, visual metaphors"
}

Also return a "skill_updates" array with proposed rule changes based on performance patterns you observe:
{
  "skill_updates": [
    {
      "type": "NEW" | "AMEND" | "REVIEW",
      "rule_id": "R001",
      "category": "Copy" | "Visual" | "GCC" | "Audience" | "Format" | "Never-do",
      "proposed_instruction": "The new or amended instruction",
      "current_instruction": "Only for AMEND — the existing instruction text",
      "evidence": "What data or pattern supports this change"
    }
  ]
}

Return ONLY valid JSON in this exact structure:
{
  "ads": [...],
  "skill_updates": [...]
}

No markdown, no preamble, no explanation. Just the JSON.`;
}

export function buildSvgPrompt(svgInstruction: string): string {
  return `You are a graphic designer creating Meta ad visuals for Valuation Realized, a premium B2B exit advisory firm.

BRAND:
- Background: #F7F5F1 (warm off-white)
- Primary: #12301E (dark green)
- Accent: #BC8F4D (gold)
- Typography: clean, modern, financial services aesthetic
- Style: native/editorial — NOT polished corporate. Text-forward. Data-driven.
- Format: 1080x1080px square (use viewBox="0 0 1080 1080")

DESIGN RULES:
- The visual should be primarily data/text-driven (charts, numbers, comparisons, stats)
- No stock photo style. Think: financial data visualisation meets editorial design
- Use only SVG primitives: rect, text, line, circle, path, polygon
- Embed all text in the SVG (no external fonts — use font-family="system-ui, -apple-system, sans-serif")
- Make numbers large and prominent (48px+ for key stats)
- Include "Valuation Realized" as small text (14px, gold color) bottom right
- Use the brand color palette consistently
- Create clear visual hierarchy: one dominant element, supporting details
- Total SVG must be complete and self-contained

AD VISUAL BRIEF:
${svgInstruction}

Return ONLY the complete SVG code starting with <svg and ending with </svg>.
No explanation, no markdown, no preamble.`;
}
