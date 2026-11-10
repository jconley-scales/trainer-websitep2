import type { Metadata } from "next";
import { BookingFlow } from "@/components/marketing/BookingFlow";
import { formatUsd } from "@/lib/format";
import { SITE } from "@/lib/site";

/**
 * The lowest per-session price across every kind of training, e.g. "Sessions
 * from $58.33 each". One figure, since four ranges made too long a sentence;
 * the pricing page has the details.
 */
const lowest = Math.min(...SITE.pricing.flatMap((group) => group.prices.map((p) => p.total / p.sessions)));
const priceNote = `Sessions from ${formatUsd(Math.round(lowest * 100) / 100)} each, in person or virtual`;

export const metadata: Metadata = {
  title: "Book a session",
  description:
    "Choose a day and time for your next training session.",
};

export default function BookPage() {
  return <BookingFlow certifiedBy={SITE.certifiedBy} priceNote={priceNote} />;
}
