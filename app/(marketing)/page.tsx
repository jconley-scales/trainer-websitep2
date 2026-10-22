import Link from "next/link";
import { SITE } from "@/lib/site";

export default function HomePage() {
  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <div className="wrap hero-inner">
          <p className="hero-eyebrow">{SITE.credentials}</p>
          <h1 id="hero-title" className="hero-title">
            Feel stronger, steadier and more confident
          </h1>
          <p className="hero-lead">
            {SITE.tagline} Whether you have never set foot in a gym or are
            returning to exercise after 50, we will start gently and go at your
            pace.
          </p>
          <div className="hero-actions">
            <Link className="button button--accent button--lg" href="#contact">
              Book a free consult
            </Link>
            <Link
              className="button button-secondary button--lg"
              href="/login"
            >
              Client login
            </Link>
          </div>
        </div>
      </section>

      <section id="services" className="section" aria-labelledby="services-title">
        <div className="wrap">
          <h2 id="services-title" className="section-title">
            What I offer
          </h2>
          <p className="section-intro">
            Simple, friendly training with no pressure and no jargon.
          </p>
          <ul className="feature-grid">
            {SITE.services.map((service) => (
              <li key={service.title} className="feature-card">
                <h3>{service.title}</h3>
                <p>{service.blurb}</p>
                <p className="feature-price">{service.price}</p>
              </li>
            ))}
          </ul>
          <p className="section-note">
            Packages available &mdash; get in touch below and we will find what
            suits you.
          </p>
        </div>
      </section>

      <section id="about" className="section section--alt" aria-labelledby="about-title">
        <div className="wrap about-grid">
          <div className="photo-placeholder" role="img" aria-label={`Photo of ${SITE.trainer} (coming soon)`}>
            <span className="photo-initials" aria-hidden="true">
              {SITE.initials}
            </span>
          </div>
          <div>
            <h2 id="about-title" className="section-title">
              About {SITE.trainerFirstName}
            </h2>
            <p className="about-credentials">{SITE.credentials}</p>
            {SITE.about.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            <p className="about-philosophy">{SITE.philosophy}</p>
          </div>
        </div>
      </section>

      <section id="testimonials" className="section" aria-labelledby="testimonials-title">
        <div className="wrap">
          <h2 id="testimonials-title" className="section-title">
            Kind words from clients
          </h2>
          <ul className="feature-grid">
            {SITE.testimonials.map((t) => (
              <li key={t.name} className="testimonial-card">
                <figure>
                  <blockquote>
                    <p>{t.quote}</p>
                  </blockquote>
                  <figcaption>
                    <strong>{t.name}</strong>
                    <span>{t.descriptor}</span>
                  </figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="contact" className="section section--alt" aria-labelledby="contact-title">
        <div className="wrap contact-box">
          <h2 id="contact-title" className="section-title">
            Let&rsquo;s have a chat
          </h2>
          <p className="section-intro">
            Your first consultation is free. Tell me a little about yourself and
            what you would like to achieve, and there is no obligation at all.
          </p>
          <div className="hero-actions contact-actions">
            <a
              className="button button--accent button--lg"
              href={`mailto:${SITE.email}?subject=${encodeURIComponent("Free consultation")}`}
            >
              Email {SITE.trainerFirstName}
            </a>
            <a className="button button-secondary button--lg" href={`tel:${SITE.phoneHref}`}>
              Call {SITE.phone}
            </a>
          </div>
          <p className="section-note">
            {SITE.email} &middot; {SITE.phone}
          </p>
        </div>
      </section>
    </>
  );
}
