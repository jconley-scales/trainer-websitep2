import Link from "next/link";
import { HealthNote } from "@/components/marketing/HealthNote";
import { formatUsd } from "@/lib/format";
import { SITE } from "@/lib/site";
import { sectionClass, titleClass, type SectionProps } from "./types";

/**
 * Session prices, one labelled group per kind of training (1-on-1, partner,
 * and the virtual versions of each).
 * The full list is short, so both variants show every package; "preview" adds
 * a link to the Pricing page and "full" adds the per-session cost.
 */
export function PricingSection({
  headingLevel = "h2",
  variant = "full",
  tone = "default",
  page = false,
}: SectionProps) {
  const Heading = headingLevel;
  // Group headings sit one level below the section's (or page's) title.
  const GroupHeading = page || headingLevel === "h1" ? "h2" : "h3";
  const preview = variant === "preview";
  return (
    <section
      className={sectionClass(tone)}
      aria-labelledby={page ? "page-title" : "pricing-title"}
    >
      <div className="wrap">
        {page ? null : (
          <>
            <Heading id="pricing-title" className={titleClass(headingLevel)}>
              Session prices
            </Heading>
            <p className="section-intro">{SITE.assessmentNote}</p>
          </>
        )}
        {SITE.pricing.map((group) => (
          <div key={group.id} className="price-group">
            <GroupHeading id={`price-group-${group.id}`} className="price-group-title">
              {group.title}
            </GroupHeading>
            <p className="price-group-intro">{group.intro}</p>
            <ul className="price-grid" aria-labelledby={`price-group-${group.id}`}>
              {group.prices.map(({ sessions, total }) => (
                <li key={sessions} className="price-card">
                  <p className="price-sessions">
                    {sessions} {sessions === 1 ? "session" : "sessions"}
                  </p>
                  <p className="price-total">{formatUsd(total)}</p>
                  {preview ? null : (
                    <p className="price-each">
                      {sessions > 1
                        ? `${formatUsd(total / sessions)} per session`
                        : group.firstSession !== undefined
                          ? `First session ${formatUsd(group.firstSession)}`
                          : "Pay as you go"}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
        {preview ? (
          <p className="section-more">
            <Link className="button button-secondary" href="/pricing">
              See pricing details
            </Link>
          </p>
        ) : (
          <HealthNote />
        )}
      </div>
    </section>
  );
}
