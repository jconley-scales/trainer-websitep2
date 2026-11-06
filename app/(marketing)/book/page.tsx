import type { Metadata } from "next";
import { BookingCalendar } from "@/components/marketing/BookingCalendar";
import Link from "next/link";
import { PageHeader } from "@/components/marketing/PageHeader";
import { formatUsd } from "@/lib/format";
import { SITE } from "@/lib/site";

const perSession = SITE.prices.map((p) => p.total / p.sessions);
const lowest = Math.min(...perSession);
const highest = Math.max(...perSession);

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
            Sessions from {formatUsd(lowest)} to {formatUsd(highest)} each.{" "}
            <Link href="/pricing">See pricing</Link>
          </p>
          <BookingCalendar />
        </div>
      </section>
    </>
  );
}
