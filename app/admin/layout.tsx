import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@/lib/site";

// The trainer's private area: not for search engines.
export const metadata: Metadata = {
  title: { default: "Bookings", template: `%s | ${SITE.name}` },
  robots: { index: false, follow: false },
};

export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="nav">
        <div className="nav-inner">
          <Link className="nav-brand" href="/">
            {SITE.name}
          </Link>
          <p className="admin-tag">Bookings admin</p>
        </div>
      </header>
      <main id="main-content" className="site-main admin-main">
        {children}
      </main>
    </>
  );
}
