import { SITE } from "@/lib/site";

/** The "check with your doctor first" note on the booking, contact and pricing pages. */
export function HealthNote() {
  return <p className="health-note">{SITE.healthNote}</p>;
}
