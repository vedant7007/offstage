import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * KB document bodies. HackNova uses the helpdesk golden set documents in tests/evals/kb/
 * (issue #12), so the eval and the running app answer from the same text.
 */
const HACKNOVA_FILES: Record<string, string> = {
  "kb-rulebook": "rulebook.md",
  "kb-faq": "faq.md",
  "kb-venue": "venue-notes.md",
  "kb-menu": "menu.md",
};

const CHARITY_DOCS: Record<string, string> = {
  "kb-raktdaan-faq": `# Raktdaan 2026 Donor FAQ

## When and where is the drive?

Saturday 14 November 2026, 09:00 to 16:00, in the Donation Hall (Seminar Hall 1), Block A, Deccan Institute.

## How long does donating take?

About 45 minutes: registration, a short health screening, the donation itself (8 to 10 minutes), and 15 minutes of rest with refreshments.

## What should I bring?

A photo ID and your ticket QR. Eat a proper breakfast and drink water before you come.

## Do I get a certificate?

Yes. Everyone who donates gets a donor certificate by email within 4 days, with an ID you can check on the verify page.
`,
  "kb-raktdaan-eligibility": `# Donor eligibility

## Who can donate

You can donate if you are 18 to 65 years old, weigh at least 50 kg, and feel well on the day.

## Please do not donate today if

You have a fever or a cold, took antibiotics in the last 7 days, got a tattoo or piercing in the last 6 months, or donated blood in the last 3 months.

## Screening

The blood bank team checks your haemoglobin, blood pressure and pulse before donation. Their decision is final and is for your safety.
`,
};

export function kbContent(docId: string): string {
  const file = HACKNOVA_FILES[docId];
  if (file) return readFileSync(join(process.cwd(), "tests", "evals", "kb", file), "utf8");
  const inline = CHARITY_DOCS[docId];
  if (inline) return inline;
  throw new Error(`No KB content for document ${docId}`);
}
