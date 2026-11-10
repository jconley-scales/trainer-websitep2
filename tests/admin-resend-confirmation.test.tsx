import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BookingStatusButtons } from "@/app/admin/booking-status-buttons";
import { resendConfirmation } from "@/app/admin/actions";

vi.mock("@/app/admin/actions", () => ({
  cancelBooking: vi.fn(),
  confirmBooking: vi.fn(),
  resendConfirmation: vi.fn(),
  setBookingStatus: vi.fn(),
}));

const ID = "2b9f6c1e-1d2a-4c3b-9e8f-0a1b2c3d4e5f";
const RESEND = /^Resend confirmation/;

function renderBooking(props: Partial<Parameters<typeof BookingStatusButtons>[0]> = {}) {
  render(
    <BookingStatusButtons
      id={ID}
      status="confirmed"
      who="Jordan Tester on Friday, October 25, 2030"
      clientFirstName="Jordan"
      when="Friday, October 25 at 9:00 AM"
      canResend
      {...props}
    />,
  );
}

beforeEach(() => vi.mocked(resendConfirmation).mockResolvedValue({ ok: true, sentTo: "jordan@example.com" }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("resending a confirmation", () => {
  it("sends the Confirmed email again and tells the trainer the address it went to", async () => {
    renderBooking();
    fireEvent.click(screen.getByRole("button", { name: RESEND }));

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Confirmation sent again to jordan@example.com.");
    // Focus moves to it, as after confirming, so a screen reader reads it out.
    await waitFor(() => expect(status).toHaveFocus());
    expect(resendConfirmation).toHaveBeenCalledWith(ID);
  });

  it("closes an open Cancel panel when resending instead", async () => {
    renderBooking();
    fireEvent.click(screen.getByRole("button", { name: /^Cancel/ }));
    fireEvent.click(screen.getByRole("button", { name: RESEND }));

    expect(await screen.findByRole("status")).toHaveTextContent("Confirmation sent again");
    expect(screen.queryByRole("form")).toBeNull();
  });

  it("is offered only when the booking can be resent: not without an email, nor once it has started", () => {
    renderBooking({ canResend: false });
    expect(screen.queryByRole("button", { name: RESEND })).toBeNull();
  });

  it("is never offered on a new or cancelled booking", () => {
    renderBooking({ status: "new" });
    expect(screen.queryByRole("button", { name: RESEND })).toBeNull();
    cleanup();
    renderBooking({ status: "cancelled" });
    expect(screen.queryByRole("button", { name: RESEND })).toBeNull();
  });

  it("says plainly when the email did not send, and keeps the button to try again", async () => {
    const error = "The email to Jordan didn't send. Please try again in a few minutes, or call or email them yourself.";
    vi.mocked(resendConfirmation).mockResolvedValue({ ok: false, error });
    renderBooking();
    fireEvent.click(screen.getByRole("button", { name: RESEND }));

    expect(await screen.findByRole("alert")).toHaveTextContent(error);
    expect(screen.queryByRole("status")).toBeNull();
    await waitFor(() => expect(screen.getByRole("button", { name: RESEND })).toBeEnabled());
  });
});
