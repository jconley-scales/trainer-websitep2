import Link from "next/link";
import { SITE } from "@/lib/site";

/** Home-page hero: the page's single h1, plus the two primary calls to action. */
export function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="wrap hero-inner">
        <h1 id="hero-title" className="hero-title">
          Feel stronger, steadier and more confident
        </h1>
        <p className="hero-lead">
          {SITE.tagline} Whether you have never set foot in a gym or are
          returning to exercise after 50, we will start gently and go at your
          pace.
        </p>
        <div className="hero-actions">
          <Link className="button button--accent button--lg" href="/book">
            Book a session
          </Link>
          <Link className="button button-secondary button--lg" href="/contact">
            Free consultation
          </Link>
        </div>
        <p className="hero-credentials">{SITE.credentials}</p>
      </div>
    </section>
  );
}
