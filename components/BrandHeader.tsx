import Link from "next/link";
import { SITE } from "@/lib/site";

/**
 * Header for the sign-in and portal pages. It matches the public site's bar
 * (same brand link, same spacing) but has no navigation: the brand links back
 * to the public site.
 */
export function BrandHeader() {
  return (
    <header className="nav">
      <div className="nav-inner">
        <Link className="nav-brand" href="/">
          {SITE.name}
        </Link>
      </div>
    </header>
  );
}
