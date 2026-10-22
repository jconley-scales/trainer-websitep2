import Link from "next/link";
import { SITE } from "@/lib/site";

/** Closing call to action at the foot of the dedicated pages. */
export function ConsultCta() {
  return (
    <section className="section section--alt" aria-labelledby="consult-title">
      <div className="wrap contact-box">
        <h2 id="consult-title" className="section-title">
          Your first consultation is free
        </h2>
        <p className="section-intro">{SITE.contactIntro}</p>
        <div className="hero-actions contact-actions">
          <Link className="button button--accent button--lg" href="/contact">
            Book a free consult
          </Link>
        </div>
      </div>
    </section>
  );
}
