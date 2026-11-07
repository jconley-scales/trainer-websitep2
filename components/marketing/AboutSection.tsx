import Image from "next/image";
import Link from "next/link";
import { PORTRAIT } from "@/lib/photos";
import { SITE } from "@/lib/site";
import { sectionClass, titleClass, type SectionProps } from "./types";

/**
 * About the trainer. "preview" is the short home-page "about me": credentials,
 * the first paragraph, every certification and a "Read more" link. "full" has the whole bio,
 * philosophy and every certification.
 */
export function AboutSection({
  headingLevel = "h2",
  variant = "full",
  tone = "default",
  page = false,
}: SectionProps) {
  const Heading = headingLevel;
  const preview = variant === "preview";
  const paragraphs = preview ? SITE.about.slice(0, 1) : SITE.about;
  return (
    <section
      className={sectionClass(tone)}
      aria-labelledby={page ? "page-title" : "about-title"}
    >
      <div className="wrap about-grid">
        <Image
          className="about-photo"
          src={PORTRAIT.src}
          alt={PORTRAIT.alt}
          sizes="(max-width: 40rem) 12rem, 18rem"
        />
        <div>
          {page ? null : (
            <>
              <Heading id="about-title" className={titleClass(headingLevel)}>
                About {SITE.trainerFirstName}
              </Heading>
              <p className="about-credentials">{SITE.credentials}</p>
            </>
          )}
          {paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          {preview ? (
            <>
              <CertList heading="h3" />
              <p className="section-more">
                <Link className="button button-secondary" href="/about">
                  Read more<span className="visually-hidden"> about {SITE.trainerFirstName}</span>
                </Link>
              </p>
            </>
          ) : (
            <>
              <p className="about-philosophy">{SITE.philosophy}</p>
              <CertList heading="h2" />
            </>
          )}
        </div>
      </div>
    </section>
  );
}

/** Every certification, under its own subheading one level below the section. */
function CertList({ heading: Heading }: { heading: "h2" | "h3" }) {
  return (
    <>
      <Heading className="about-subtitle">Certifications</Heading>
      <ul className="cert-list">
        {SITE.certifications.map((cert) => (
          <li key={cert}>{cert}</li>
        ))}
      </ul>
    </>
  );
}
