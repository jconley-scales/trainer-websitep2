import type { Metadata } from "next";
import { BookingFlow } from "@/components/marketing/BookingFlow";
import { formatUsd } from "@/lib/format";
import { SITE } from "@/lib/site";

/** Each training group's per-session range, e.g. "1-on-1 training $70 to $85 each". */
const ranges = SITE.pricing.map((group) => {
  const perSession = group.prices.map((p) => p.total / p.sessions);
  const lowest = formatUsd(Math.min(...perSession));
  const highest = formatUsd(Math.max(...perSession));
  return `${group.title.toLowerCase()} ${lowest} to ${highest} each`;
});
const priceNote = ranges.join(", ").replace(/^./, (c) => c.toUpperCase());

export const metadata: Metadata = {
  title: "Book a session",
  description:
    "Choose a day and time for your next training session.",
};

export default function BookPage() {
  return <BookingFlow certifiedBy={SITE.certifiedBy} priceNote={priceNote} />;
}
