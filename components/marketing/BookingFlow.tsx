"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BookingCalendar, type ContactDetails } from "@/components/marketing/BookingCalendar";
import { HealthNote } from "@/components/marketing/HealthNote";
import { PageHeader } from "@/components/marketing/PageHeader";
import type { AvailableSlot } from "@/lib/booking-availability";
import { formatDate, formatTimeRange } from "@/lib/format";
import { SITE } from "@/lib/site";

/** Matches the database's limit on live requests per email (migration 0006). */
const MAX_WAITING_REQUESTS = 3;

/**
 * The whole /book page. Once a request goes through, the booking heading,
 * certifications, prices and calendar all give way to the thank-you, so no
 * one is left wondering whether they actually booked.
 *
 * "Book another session" brings the calendar back with the visitor's contact
 * details already filled in and this visit's times no longer offered. Those
 * details live in this component's state only, never in browser storage
 * (shared and family computers), so a reload starts fresh. After
 * MAX_WAITING_REQUESTS in one visit the button gives way to a note that they
 * are all waiting; the database still enforces the limit across visits.
 */
export function BookingFlow({ certifiedBy, priceNote }: { certifiedBy: string; priceNote: string }) {
  /** Every time requested this visit, in the order booked. */
  const [booked, setBooked] = useState<AvailableSlot[]>([]);
  const [details, setDetails] = useState<ContactDetails | undefined>(undefined);
  const [showThanks, setShowThanks] = useState(false);
  // Set when the visitor swaps between the calendar and the thank-you (not on
  // first load), so focus follows them to the top of the new content.
  const hasSwappedView = useRef(false);

  useEffect(() => {
    document.title = showThanks ? `Request received | ${SITE.name}` : `Book a session | ${SITE.name}`;
    if (hasSwappedView.current) document.getElementById("page-title")?.focus();
  }, [showThanks]);

  function showThankYou() {
    hasSwappedView.current = true;
    setShowThanks(true);
  }

  function showCalendar() {
    hasSwappedView.current = true;
    setShowThanks(false);
  }

  if (showThanks) {
    return (
      <>
        <PageHeader
          title={booked.length > 1 ? "Thank you — your requests are in" : "Thank you — your request is in"}
          focusable
        />
        <section className="section" aria-labelledby="page-title">
          <div className="wrap">
            <div className="booking-success" role="status">
              <p>You asked to book:</p>
              <ul className="booking-success-list">
                {booked.map((slot) => (
                  <li key={slot.id}>
                    <strong>{formatDate(slot.startsAt)}</strong>,{" "}
                    <strong>{formatTimeRange(slot.startsAt, slot.endsAt)}</strong>
                  </li>
                ))}
              </ul>
              <p>
                This is a request, not a confirmed booking yet — we will email or call you to confirm. If you
                need to change anything, just <a href="/contact">get in touch</a>.
              </p>
              {booked.length >= MAX_WAITING_REQUESTS ? (
                <p>{`You have ${MAX_WAITING_REQUESTS} requests waiting — we'll be in touch to confirm.`}</p>
              ) : (
                <p>
                  <button type="button" className="button button--accent" onClick={showCalendar}>
                    Book another session
                  </button>
                </p>
              )}
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
        focusable
        lead="Pick a day and time that suits you. We will sort out the details together once you have booked."
      />
      <section className="section" aria-labelledby="page-title">
        <div className="wrap">
          <p className="booking-certs">{certifiedBy}</p>
          <p className="booking-price-note">
            {priceNote}.{" "}
            <Link href="/pricing">See pricing</Link>
          </p>
          <HealthNote />
          <BookingCalendar
            initialDetails={details}
            alsoTaken={booked}
            onBooked={(slot, used) => {
              setBooked((earlier) => [...earlier, slot]);
              setDetails(used);
              showThankYou();
            }}
          />
        </div>
      </section>
    </>
  );
}
