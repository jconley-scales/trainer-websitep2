import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/marketing/PageHeader";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy",
  description: `How ${SITE.name} uses the details you send when you book a session or send a message, who handles them, and how to ask to see or delete them.`,
};

export default function PrivacyPage() {
  const { updated, lead, sections } = SITE.privacy;
  return (
    <>
      <PageHeader title="Your privacy" lead={lead} />
      <section className="section" aria-labelledby="page-title">
        <div className="wrap">
          <div className="privacy">
            <p className="privacy-updated">Last updated {updated}</p>
            {sections.map((section) => (
              <div key={section.id} className="privacy-section">
                <h2 id={section.id} className="privacy-heading">
                  {section.heading}
                </h2>
                {section.paragraphs.map((p) => (
                  <p key={p}>{p}</p>
                ))}
                {section.items ? (
                  <ul>
                    {section.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
                {section.afterList?.map((p) => (
                  <p key={p}>{p}</p>
                ))}
                {section.cta ? (
                  <p>
                    <Link className="button button-secondary" href={section.cta.href}>
                      {section.cta.label}
                    </Link>
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
