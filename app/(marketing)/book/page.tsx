import type { Metadata } from "next";
import { BookingCalendar } from "@/components/marketing/BookingCalendar";
import { PageHeader } from "@/components/marketing/PageHeader";

export const metadata: Metadata = {
  title: "Book a session",
  description:
    "Choose a day and time for your one-to-one personal training session. Your first consultation is free.",
};

export default function BookPage() {
  return (
    <>
      <PageHeader
        title="Book a session"
        lead="Pick a day and time that suits you. Your first consultation is free, with no obligation."
      />
      <section className="section" aria-labelledby="page-title">
        <div className="wrap">
          <BookingCalendar />
        </div>
      </section>
    </>
  );
}
