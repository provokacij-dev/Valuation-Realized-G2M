export const QUESTION_BANK = {
  leadership: {
    label: "Leadership & People",
    questions: [
      "What's your role day-to-day? How involved are you in operations?",
      "Do you have a management team that could run the business if you stepped back for three months?",
      "If you disappeared for three months — no calls, no emails — would revenue hold?",
      "Who is your number two, and have they actually run the business in your absence?",
      "Which client relationships are held by you personally versus by your team?",
      "Which decisions in the business require your sign-off today — pricing, hiring, client issues, major purchases?",
      "Do you have retention agreements, non-competes, or incentive plans in place for your top 5 most critical employees?",
      "If your two best people left within six months of a deal closing, what would happen to the business?",
      "Is there a documented succession plan or organisational chart that a buyer could review?",
      "How long has your senior leadership team been in place — and is there any near-term departure risk?",
      "Are your key customer and supplier relationships documented — meeting notes, account history, relationship owners?",
      "What is your plan for your own role post-close — are you willing to stay on, and for how long?",
      "Do you have an advisory board or external governance that a buyer could point to as independent oversight?",
      "If a buyer asked to speak directly with your leadership team during due diligence, would you be comfortable with that?",
    ],
  },
  commercial: {
    label: "Commercial",
    questions: [
      "How concentrated is your customer base? Does any single customer represent more than 15-20% of revenue?",
      "Can you articulate your total addressable market with evidence — not just an estimate, but a source?",
      "What is your competitive differentiation — and is it durable, or could a competitor replicate it within 12 months?",
      "What are your named growth levers for the next 3 years — specific geographies, products, channels, partnerships?",
      "Is your sales pipeline documented — with deal stages, conversion rates, and average deal sizes tracked?",
      "Do you know your customer acquisition cost (CAC)? Your customer lifetime value (LTV)? Your LTV:CAC ratio?",
      "What is your gross revenue retention and net revenue retention across your customer base?",
      "What are your gross margins by product line or service — and are they healthy and consistent?",
      "What is your churn rate — and do you know why customers leave?",
      "Have you modelled what your business would look like to a strategic buyer versus a financial buyer (PE)? Are you pitching the right story to the right audience?",
      "Is your revenue growing, and can you attribute growth to specific actions — or has it been passive?",
      "Do you have any customer references willing to speak to a buyer on your behalf?",
      "What would a competitor say about you — and is your answer to that something you'd be proud of in a data room?",
    ],
  },
  financial: {
    label: "Financial",
    questions: [
      "Have you had your financials professionally audited, or are you working off management accounts?",
      "Do you have financial statements for the last 3 years — and do they reconcile with your management accounts?",
      "Have you prepared a normalised EBITDA with documented add-backs? Can each add-back be evidenced?",
      "What % of your revenue is recurring versus project-based or one-off?",
      "What is your average contract length and renewal rate?",
      "Do any customers represent more than 15% of total revenue? What are the top 3 customers as a % of revenue?",
      "Have you had a Quality of Earnings (QofE) review done, or would your numbers survive one?",
      "Do your financial projections for the next 2-3 years have a model behind them, or are they directional estimates?",
      "Are there any related-party transactions — loans, payments to family members, personal expenses run through the business?",
    ],
  },
  operations: {
    label: "Operations",
    questions: [
      "Are your core operational processes documented — or do they exist primarily in people's heads?",
      "Could a new employee follow your onboarding documentation to do a key role without your intervention?",
      "Which functions have written SOPs, and which don't?",
      "Are your sales, finance, operations, and HR processes handled in separate systems — or is everything in one person's inbox/spreadsheet?",
      "What tools and systems run your business — and how integrated are they?",
      "If you doubled revenue tomorrow, would your operations scale — or would you need to double headcount too?",
      "Are your cost allocations clear — do you know the true cost of each product line or service?",
      "Is there any operational underinvestment a buyer would immediately spot — deferred maintenance, legacy systems, under-resourced functions?",
      "Do you have performance metrics tracked and reported regularly — revenue per head, utilisation, on-time delivery, etc.?",
      "Is there a single point of failure in your operations — one person, one system, one supplier — that if removed would halt the business?",
      "Have you had any major operational failures in the last three years — system outages, delivery failures, regulatory breaches?",
    ],
  },
  legal: {
    label: "Legal",
    questions: [
      "Are all major customer contracts written, current, signed, and stored in one place?",
      "Do any of your contracts contain change-of-control clauses — provisions that could allow a customer or supplier to exit when the business is sold?",
      "Is all intellectual property — software, brand, content, processes — formally assigned to the company, not to any individual?",
      "Are there any non-competes or exclusivity agreements that could restrict what a buyer does with the business post-close?",
      "Are all regulatory licences and permits current — and are they transferable to a new owner?",
      "Have there been any disputes, litigation, or threatened claims in the last 3 years?",
      "Do you have a data protection policy and privacy notice in place? Are you GDPR-compliant (if applicable)?",
      "Are all employment contracts documented, current, and compliant with local labour law?",
      "Have you ever used open-source software in your product or platform? Is its licensing documented and reviewed?",
      "Are all supplier and partner agreements written — or are any key relationships based on a handshake?",
    ],
  },
  technology: {
    label: "Technology & Data",
    questions: [
      "How old is your core technology stack — and are any components end-of-life or unsupported?",
      "Is your core product or platform built on proprietary technology, or is it primarily open-source or off-the-shelf tools configured together?",
      "Do you have any cybersecurity certifications — SOC 2, ISO 27001, Cyber Essentials, or equivalent?",
      "Have you ever had a data breach, security incident, or unauthorised access? If yes, was it disclosed and remediated?",
      "How is customer data stored, accessed, and protected — and who has access to it?",
      "Are you GDPR-compliant (or equivalent in your jurisdiction) in operational terms — not just in policy?",
      "What would it take for a buyer to integrate your systems with their own — weeks, months, or years?",
      "Do you have disaster recovery and business continuity plans tested and documented?",
      "Is your codebase version-controlled, documented, and accessible — or does it live on one developer's machine?",
      "Are there any open-source components in your product where the licence could restrict a buyer's use or resale rights?",
      "If a buyer's tech team ran a security penetration test on your systems tomorrow, what would they find?",
    ],
  },
} as const;

export type Domain = keyof typeof QUESTION_BANK;

export function formatQuestionBankForPrompt(): string {
  return Object.entries(QUESTION_BANK)
    .map(([, domain]) => {
      return `**${domain.label}**\n${domain.questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`;
    })
    .join("\n\n");
}
