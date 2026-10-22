import Link from "next/link";
import { NAV_LINKS, SITE } from "@/lib/site";
import { NavLink } from "./NavLink";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap site-footer-inner">
        <div>
          <p className="site-footer-brand">{SITE.name}</p>
          <p>{SITE.tagline}</p>
          <p>
            <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
            <br />
            <a href={`tel:${SITE.phoneHref}`}>{SITE.phone}</a>
          </p>
        </div>
        <nav aria-label="Footer">
          <ul className="footer-links">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <NavLink className="nav-link" href={link.href}>
                  {link.label}
                </NavLink>
              </li>
            ))}
            <li>
              <Link className="nav-link" href="/login">
                Client login
              </Link>
            </li>
          </ul>
        </nav>
      </div>
      <div className="wrap">
        <p className="site-footer-legal">
          &copy; {SITE.copyrightYear} {SITE.name}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
