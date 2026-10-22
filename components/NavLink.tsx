"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * A nav link that marks the current page with aria-current="page". This is the
 * only part of the header that reads the URL; it renders on the server too, so
 * the nav is complete (and the right link is marked) before any JavaScript runs.
 */
export function NavLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const current =
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link className={className} href={href} aria-current={current ? "page" : undefined}>
      {children}
    </Link>
  );
}
