"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookingCalendar } from "@/components/marketing/BookingCalendar";
import { PageHeader } from "@/components/marketing/PageHeader";
import type { AvailableSlot } from "@/lib/booking-availability";
import { formatDate, formatTimeRange } from "@/lib/format";
import { SITE } from "@/lib/site";

/**
 * The whole /book page. Once a request goes through, the booking heading,
 * certifications, prices and calendar all give way to the thank-you, so no
 * one is left wondering whether they actually booked.
 */
export function BookingFlow({ certifiedBy, priceNote }: { certifiedBy: string; priceNote: string }) {
  const [booked, setBooked] = useState<AvailableSlot | null>(null);

  useEffect(() => {
    if (booked) document.title = `Request received | ${SITE.name}`;
  }, [booked]);

  if (booked) {
    return (
      <>
        <PageHeader title="Thank you — your request is in" />
        <section className="section" aria-labelledby="page-title">
          <div className="wrap">
            <div className="booking-success" role="status">
              <p>
                You asked to book <strong>{formatDate(booked.startsAt)}</strong>,{" "}
                <strong>{formatTimeRange(booked.startsAt, booked.endsAt)}</strong>.
              </p>
              <p>
                This is a request, not a confirmed booking yet — we will email or call you to confirm. If you
                need to change anything, just <a href="/contact">get in touch</a>.
              </p>
              <p>
                <Link href="/">Back to the home page</Link>
              </p>
            </div>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Book a session"
        lead="Pick a day and time that suits you. We will sort out the details together once you have booked."
      />
      <section className="section" aria-labelledby="page-title">
        <div className="wrap">
          <p className="booking-certs">{certifiedBy}</p>
          <p className="booking-price-note">
            {priceNote}.{" "}
            <Link href="/pricing">See pricing</Link>
          </p>
          <BookingCalendar onBooked={setBooked} />
        </div>
      </section>
    </>
  );
}
