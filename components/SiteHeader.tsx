import Link from "next/link";
import { NAV_LINKS, SITE } from "@/lib/site";
import { NavLink } from "./NavLink";

/** Public marketing navigation. Plain visible links (no hidden menu); wraps on phones. */
export function SiteHeader() {
  return (
    <header className="nav">
      <div className="nav-inner">
        <Link className="nav-brand" href="/">
          {SITE.name}
        </Link>
        <nav className="nav-links" aria-label="Main">
          {NAV_LINKS.map((link) => (
            <NavLink key={link.href} className="nav-link" href={link.href}>
              {link.label}
            </NavLink>
          ))}
          <Link className="nav-cta" href="/book">
            Book a session
          </Link>
        </nav>
      </div>
    </header>
  );
}
