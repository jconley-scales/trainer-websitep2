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
            Friendly, one-to-one personal training that helps you get stronger,
            steadier and more flexible, whatever your age or starting point. In
            the Greater Burlington, Vermont area, at the YMCA or in your home.
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
