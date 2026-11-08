import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.fn();
vi.mock("nodemailer", () => ({
  default: { createTransport: vi.fn(() => ({ sendMail })) },
}));

import {
  notifyTrainerOfBooking,
  sendBookingCancellation,
  sendBookingConfirmation,
  sendContactMessage,
} from "@/lib/notify";

// 2030-10-25 is a Friday; 13:00Z is 9:00 AM Eastern (daylight time).
const BOOKING = {
  name: "Jordan Tester",
  email: "jordan@example.com",
  startsAt: "2030-10-25T13:00:00Z",
  endsAt: "2030-10-25T14:00:00Z",
};

beforeEach(() => {
  sendMail.mockReset();
  sendMail.mockResolvedValue({});
  vi.stubEnv("SMTP_HOST", "smtp.example.com");
  vi.stubEnv("BOOKING_NOTIFY_EMAIL", "trainer@example.com");
  vi.stubEnv("BOOKING_FROM_EMAIL", "Booking <booking@example.com>");
});

afterEach(() => vi.unstubAllEnvs());

describe("sendBookingConfirmation", () => {
  it("emails the client from the booking sender, with replies going to the booking address", async () => {
    await sendBookingConfirmation({ ...BOOKING, note: "" });

    expect(sendMail).toHaveBeenCalledTimes(1);
    const mail = sendMail.mock.calls[0][0];
    expect(mail.to).toBe("jordan@example.com");
    expect(mail.from).toBe("Booking <booking@example.com>");
    expect(mail.replyTo).toBe("Booking <booking@example.com>");
    expect(mail.html).toBeUndefined();
  });

  it("leads with the day and time, in the display time zone with the zone named, and signs off as the trainer", async () => {
    await sendBookingConfirmation({ ...BOOKING, note: "" });

    const mail = sendMail.mock.calls[0][0];
    expect(mail.subject).toBe("Confirmed: Friday, October 25 at 9:00 AM");
    expect(mail.text).toBe(
      [
        "Hi Jordan,",
        "",
        "Your session is confirmed.",
        "",
        "    Friday, October 25",
        "    9:00 AM to 10:00 AM (Eastern time)",
        "",
        "If you need to change or cancel, just reply to this email.",
        "",
        "See you then,",
        "Jervaughn Scales",
      ].join("\n"),
    );
  });

  it("includes the trainer's note under its own line when one is given", async () => {
    await sendBookingConfirmation({
      ...BOOKING,
      note: "  Let's meet at Oakledge Park,\nby the main pavilion.  ",
    });

    const { text } = sendMail.mock.calls[0][0];
    expect(text).toContain(
      [
        "    9:00 AM to 10:00 AM (Eastern time)",
        "",
        "A note from Jervaughn:",
        "Let's meet at Oakledge Park,",
        "by the main pavilion.",
        "",
        "If you need to change or cancel, just reply to this email.",
      ].join("\n"),
    );
  });

  it("throws when email is not configured, so the caller can warn the trainer", async () => {
    vi.stubEnv("SMTP_HOST", "");
    await expect(sendBookingConfirmation({ ...BOOKING, note: "" })).rejects.toThrow();
    expect(sendMail).not.toHaveBeenCalled();
  });
});

describe("sendBookingCancellation", () => {
  it("turns down a new request: sorry, pick another time, signed by the trainer", async () => {
    vi.stubEnv("SITE_URL", "https://myolderfitness.com/");
    await sendBookingCancellation({ ...BOOKING, wasConfirmed: false, reason: "" });

    expect(sendMail).toHaveBeenCalledTimes(1);
    const mail = sendMail.mock.calls[0][0];
    expect(mail.to).toBe("jordan@example.com");
    expect(mail.from).toBe("Booking <booking@example.com>");
    expect(mail.replyTo).toBe("Booking <booking@example.com>");
    expect(mail.html).toBeUndefined();
    expect(mail.subject).toBe("Can't make it: Friday, October 25 at 9:00 AM");
    expect(mail.text).toBe(
      [
        "Hi Jordan,",
        "",
        "I'm sorry, I can't make this time work:",
        "",
        "    Friday, October 25",
        "    9:00 AM to 10:00 AM (Eastern time)",
        "",
        "Please pick another time at https://myolderfitness.com/book, or reply to this email.",
        "",
        "Best wishes,",
        "Jervaughn Scales",
      ].join("\n"),
    );
  });

  it("cancels a confirmed session, offering to book again", async () => {
    vi.stubEnv("SITE_URL", "https://myolderfitness.com");
    await sendBookingCancellation({ ...BOOKING, wasConfirmed: true, reason: "" });

    const mail = sendMail.mock.calls[0][0];
    expect(mail.subject).toBe("Cancelled: Friday, October 25 at 9:00 AM");
    expect(mail.text).toBe(
      [
        "Hi Jordan,",
        "",
        "Your session has been cancelled:",
        "",
        "    Friday, October 25",
        "    9:00 AM to 10:00 AM (Eastern time)",
        "",
        "If you'd like a new time, book again at https://myolderfitness.com/book, or reply to this email.",
        "",
        "Best wishes,",
        "Jervaughn Scales",
      ].join("\n"),
    );
  });

  it("includes the reason when turning down a new request", async () => {
    await sendBookingCancellation({ ...BOOKING, wasConfirmed: false, reason: "I'm away that week." });

    const { text } = sendMail.mock.calls[0][0];
    expect(text).toContain(
      [
        "    9:00 AM to 10:00 AM (Eastern time)",
        "",
        "A note from Jervaughn:",
        "I'm away that week.",
        "",
        "Please pick another time at http://localhost:3000/book, or reply to this email.",
      ].join("\n"),
    );
  });

  it("includes the trainer's reason under its own line when one is given", async () => {
    await sendBookingCancellation({ ...BOOKING, wasConfirmed: true, reason: "  I'm unwell this week.  " });

    const { text } = sendMail.mock.calls[0][0];
    expect(text).toContain(
      [
        "    9:00 AM to 10:00 AM (Eastern time)",
        "",
        "A note from Jervaughn:",
        "I'm unwell this week.",
        "",
        "If you'd like a new time, book again at http://localhost:3000/book, or reply to this email.",
      ].join("\n"),
    );
  });

  it("throws when email is not configured, so the caller can warn the trainer", async () => {
    vi.stubEnv("SMTP_HOST", "");
    await expect(sendBookingCancellation({ ...BOOKING, wasConfirmed: false, reason: "" })).rejects.toThrow();
    expect(sendMail).not.toHaveBeenCalled();
  });
});

describe("emails to the trainer (unchanged by the shared mail setup)", () => {
  it("sends the new-booking alert to the trainer, replying to the visitor", async () => {
    await notifyTrainerOfBooking({ ...BOOKING, phone: null, note: null });
    const mail = sendMail.mock.calls[0][0];
    expect(mail.to).toBe("trainer@example.com");
    expect(mail.from).toBe("Booking <booking@example.com>");
    expect(mail.replyTo).toBe("jordan@example.com");
  });

  it("sends contact messages to the trainer, and refuses when the trainer's address is not set", async () => {
    await sendContactMessage({ name: "Pat", email: "pat@example.com", phone: null, message: "Hello" });
    expect(sendMail.mock.calls[0][0].to).toBe("trainer@example.com");

    vi.stubEnv("BOOKING_NOTIFY_EMAIL", "");
    await expect(
      sendContactMessage({ name: "Pat", email: "pat@example.com", phone: null, message: "Hello" }),
    ).rejects.toThrow();
  });

  it("uses the trainer's address as the sender when no booking sender is set", async () => {
    vi.stubEnv("BOOKING_FROM_EMAIL", undefined);
    await sendBookingConfirmation({ ...BOOKING, note: "" });
    expect(sendMail.mock.calls[0][0].from).toBe("trainer@example.com");
  });
});
