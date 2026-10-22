import type { Metadata } from "next";
import { SITE } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: `${SITE.name} | Personal training with ${SITE.trainer}`,
    template: `%s | ${SITE.name}`,
  },
  description: SITE.description,
};

/**
 * Root layout: document shell only. Each route group supplies its own chrome
 * (skip link, header, <main>, footer) so the server renders the right one.
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
