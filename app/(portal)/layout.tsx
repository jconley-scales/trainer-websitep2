import { BrandHeader } from "@/components/BrandHeader";

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
