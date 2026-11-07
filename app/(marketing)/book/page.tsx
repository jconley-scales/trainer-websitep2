import type { Metadata } from "next";
import { BookingCalendar } from "@/components/marketing/BookingCalendar";
import Link from "next/link";
import { PageHeader } from "@/components/marketing/PageHeader";
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
  return (
    <>
      <PageHeader
        title="Book a session"
        lead="Pick a day and time that suits you. We will sort out the details together once you have booked."
      />
      <section className="section" aria-labelledby="page-title">
        <div className="wrap">
          <p className="booking-price-note">
            {priceNote}.{" "}
            <Link href="/pricing">See pricing</Link>
          </p>
          <BookingCalendar />
        </div>
      </section>
    </>
  );
}
