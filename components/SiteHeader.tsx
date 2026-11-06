import Image from "next/image";
import Link from "next/link";
import { LOGO } from "@/lib/photos";
import { NAV_LINKS, SITE } from "@/lib/site";
import { NavLink } from "./NavLink";

/** Public marketing navigation. Plain visible links (no hidden menu); wraps on phones. */
export function SiteHeader() {
  return (
    <header className="nav">
      <div className="nav-inner">
        <Link className="nav-brand" href="/">
          {/* Decorative: the brand name beside it is the link's accessible name. */}
          <Image className="nav-logo" src={LOGO} alt="" width={44} height={44} priority />
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
