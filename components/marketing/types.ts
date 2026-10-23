/**
 * Props shared by the marketing section components.
 *
 * - `headingLevel`: "h1" when the section is the main content of its own page,
 *   "h2" when it sits under the home page's hero h1.
 * - `variant`: "preview" is the short home-page teaser (with a link to the full
 *   page); "full" is the complete section.
 * - `tone`: background band, so stacked sections alternate.
 */
export type SectionProps = {
  headingLevel?: "h1" | "h2";
  variant?: "preview" | "full";
  tone?: "default" | "alt";
  /**
   * True when the section is the body of a dedicated page whose <h1> and lead
   * live in a <PageHeader> above it. The section then renders its content only
   * (no title or intro of its own) and its region is labelled by that h1.
   */
  page?: boolean;
};

export function sectionClass(tone: SectionProps["tone"]): string {
  return tone === "alt" ? "section section--alt" : "section";
}

export function titleClass(level: SectionProps["headingLevel"]): string {
  return level === "h1" ? "section-title section-title--page" : "section-title";
}
