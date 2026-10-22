import type { Metadata } from "next";
import "./globals.css";

export const PORTAL_NAME = "Training Portal";

export const metadata: Metadata = {
  title: PORTAL_NAME,
  description: "Book and manage your workout sessions.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <header className="site-header">
          <p className="site-title">{PORTAL_NAME}</p>
        </header>
        <main id="main-content" className="site-main">
          {children}
        </main>
      </body>
    </html>
  );
}
