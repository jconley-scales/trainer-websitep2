import Image from "next/image";
import Link from "next/link";
import { HERO_PHOTO } from "@/lib/photos";
import { SITE } from "@/lib/site";

/** Home-page hero: the page's single h1, the two primary calls to action and the lead photo. */
export function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="wrap hero-grid">
        <div className="hero-inner">
          <h1 id="hero-title" className="hero-title">
            Get fit with My Older Fitness
          </h1>
          <p className="hero-lead">
            My Older Fitness offers private personal training designed to help
            seniors and older adults become stronger, improve their balance and
            mobility, and ultimately maintain their independence. Each training
            session is tailored to the individual&rsquo;s abilities, needs, and
            fitness goals. Training is available throughout Chittenden County,
            Vermont.
          </p>
          <p className="hero-lead">
            It&rsquo;s never too late to start investing in your health,
            strength, and well-being. Take the first step toward feeling
            stronger and moving with confidence.
          </p>
          <div className="hero-actions">
            <Link className="button button--accent button--lg" href="/book">
              Book a session
            </Link>
            <Link className="button button-secondary button--lg" href="/pricing">
              See prices
            </Link>
          </div>
          <p className="hero-credentials">{SITE.credentials}</p>
        </div>
        <Image
          className="hero-photo"
          src={HERO_PHOTO.src}
          alt={HERO_PHOTO.alt}
          priority
          sizes="(max-width: 56rem) 100vw, 26rem"
        />
      </div>
    </section>
  );
}
