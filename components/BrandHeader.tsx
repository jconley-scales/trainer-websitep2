import Link from "next/link";
import { SITE } from "@/lib/site";

/** Simple header for the sign-in and portal pages: the brand links back to the public site. */
export function BrandHeader() {
  return (
    <header className="site-header">
      <Link className="site-title nav-brand" href="/">
        {SITE.name}
      </Link>
    </header>
  );
}
