import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

/** Public 404. The root layout has no chrome, so this supplies the marketing one. */
export default function NotFound() {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <SiteHeader />
      <main id="main-content">
        <section className="section" aria-labelledby="not-found-title">
          <div className="wrap not-found">
            <h1 id="not-found-title" className="hero-title">
              Sorry, we can&rsquo;t find that page
            </h1>
            <p className="hero-lead">
              The page you are looking for may have moved, or the address may
              have a typo. Nothing is wrong on your side.
            </p>
            <Link className="button button--accent button--lg" href="/">
              Back to the home page
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
