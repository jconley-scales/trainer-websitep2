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
const QUESTION = "Resend Jordan's confirmation for Friday, October 25 at 9:00 AM?";
const NOTE = "Note for Jordan (optional)";

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
  return screen.getByRole("button", { name: RESEND });
}

beforeEach(() => vi.mocked(resendConfirmation).mockResolvedValue({ ok: true, sentTo: "jordan@example.com" }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("resending a confirmation", () => {
  it("asks first, in a panel that offers a new note, since the first one wasn't saved", () => {
    fireEvent.click(renderBooking());

    const panel = screen.getByRole("form", { name: QUESTION });
    expect(panel).toHaveTextContent(
      "They'll get the confirmation email again. Any note you sent before wasn't saved, so add anything they still need, like a video link.",
    );
    expect(screen.getByLabelText(NOTE)).toHaveAttribute("maxlength", "500");
    // It is only an email, so there is nothing to do without one.
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByText(QUESTION)).toHaveFocus();
    expect(resendConfirmation).not.toHaveBeenCalled();
  });

  it("sends with the note and tells the trainer the address it went to", async () => {
    fireEvent.click(renderBooking());
    fireEvent.change(screen.getByLabelText(NOTE), { target: { value: "Video link: https://meet.example.com/jordan" } });
    fireEvent.click(screen.getByRole("button", { name: "Yes, resend to Jordan" }));

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Confirmation sent again to jordan@example.com.");
    // Focus moves to it, as after confirming, so a screen reader reads it out.
    await waitFor(() => expect(status).toHaveFocus());
    expect(resendConfirmation).toHaveBeenCalledWith(ID, "Video link: https://meet.example.com/jordan");
    expect(screen.queryByRole("form", { name: QUESTION })).toBeNull();
  });

  it('"Not now" closes the panel, sends nothing, and puts focus back on Resend', () => {
    const resend = renderBooking();
    fireEvent.click(resend);
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));

    expect(screen.queryByRole("form", { name: QUESTION })).toBeNull();
    expect(resend).toHaveFocus();
    expect(resendConfirmation).not.toHaveBeenCalled();
  });

  it("opening it closes an open Cancel panel", () => {
    renderBooking();
    fireEvent.click(screen.getByRole("button", { name: /^Cancel/ }));
    fireEvent.click(screen.getByRole("button", { name: RESEND }));

    expect(screen.getAllByRole("form")).toHaveLength(1);
    expect(screen.getByRole("form", { name: QUESTION })).toBeInTheDocument();
  });

  it("is offered only when the booking can be resent: not without an email, nor once it has started", () => {
    render(
      <BookingStatusButtons id={ID} status="confirmed" who="Jordan" clientFirstName="Jordan" when="Friday" canResend={false} />,
    );
    expect(screen.queryByRole("button", { name: RESEND })).toBeNull();
  });

  it("is never offered on a new or cancelled booking", () => {
    for (const status of ["new", "cancelled"] as const) {
      render(<BookingStatusButtons id={ID} status={status} who="Jordan" clientFirstName="Jordan" when="Friday" canResend />);
      expect(screen.queryByRole("button", { name: RESEND })).toBeNull();
      cleanup();
    }
  });

  it("says plainly when the email did not send, keeping the panel and the note to try again", async () => {
    const error = "The email to Jordan didn't send. Please try again in a few minutes, or call or email them yourself.";
    vi.mocked(resendConfirmation).mockResolvedValue({ ok: false, error });
    fireEvent.click(renderBooking());
    fireEvent.change(screen.getByLabelText(NOTE), { target: { value: "See you there" } });
    fireEvent.click(screen.getByRole("button", { name: "Yes, resend to Jordan" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(error);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByLabelText(NOTE)).toHaveValue("See you there");
    await waitFor(() => expect(screen.getByRole("button", { name: "Yes, resend to Jordan" })).toBeEnabled());
  });
});
