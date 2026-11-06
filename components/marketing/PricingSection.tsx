import Link from "next/link";
import { formatUsd } from "@/lib/format";
import { SITE } from "@/lib/site";
import { sectionClass, titleClass, type SectionProps } from "./types";

/**
 * Session prices. The full list is short, so both variants show every package;
 * "preview" adds a link to the Pricing page and "full" adds the per-session cost.
 */
export function PricingSection({
  headingLevel = "h2",
  variant = "full",
  tone = "default",
  page = false,
}: SectionProps) {
  const Heading = headingLevel;
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
        <ul className="price-grid">
          {SITE.prices.map(({ sessions, total }) => (
            <li key={sessions} className="price-card">
              <p className="price-sessions">
                {sessions} {sessions === 1 ? "session" : "sessions"}
              </p>
              <p className="price-total">{formatUsd(total)}</p>
              {preview ? null : (
                <p className="price-each">
                  {sessions === 1
                    ? "Pay as you go"
                    : `${formatUsd(total / sessions)} per session`}
                </p>
              )}
            </li>
          ))}
        </ul>
        {preview ? (
          <p className="section-more">
            <Link className="button button-secondary" href="/pricing">
              See pricing details
            </Link>
          </p>
        ) : null}
      </div>
    </section>
  );
}
