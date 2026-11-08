import Link from "next/link";
import { SITE } from "@/lib/site";

/** The "How we use your details" link shown inside the booking and contact forms. */
export function PrivacyNote() {
  return (
    <p className="privacy-note">
      <Link href="/privacy">{SITE.privacy.linkLabel}</Link>
    </p>
  );
}
