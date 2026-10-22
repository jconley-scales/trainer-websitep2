import type { Metadata } from "next";
import { BrandHeader } from "@/components/BrandHeader";

// The sign-in page and the signed-in portal are not for search engines.
export const metadata: Metadata = { robots: { index: false } };

export default function PortalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <BrandHeader />
      <main id="main-content" className="site-main">
        {children}
      </main>
    </>
  );
}
