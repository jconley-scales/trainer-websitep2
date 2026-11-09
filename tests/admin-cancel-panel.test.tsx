import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BookingStatusButtons } from "@/app/admin/booking-status-buttons";
import { cancelBooking, confirmBooking, setBookingStatus } from "@/app/admin/actions";

vi.mock("@/app/admin/actions", () => ({
  cancelBooking: vi.fn(),
  confirmBooking: vi.fn(),
  setBookingStatus: vi.fn(async () => ({ ok: true })),
}));

const ID = "2b9f6c1e-1d2a-4c3b-9e8f-0a1b2c3d4e5f";
const QUESTION = "Cancel Jordan's booking on Friday, October 25 at 9:00 AM?";
const REASON = "Reason (optional, included in the email)";

function renderBooking(status: "new" | "confirmed" | "cancelled") {
  render(
    <BookingStatusButtons
      id={ID}
      status={status}
      who="Jordan Tester on Friday, October 25, 2030"
      clientFirstName="Jordan"
      when="Friday, October 25 at 9:00 AM"
    />,
  );
}

const cancelButton = () => screen.getByRole("button", { name: /^Cancel\s*the booking/ });

beforeEach(() => vi.mocked(cancelBooking).mockResolvedValue({ ok: true, emailed: true }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("cancelling a booking", () => {
  it.each(["new", "confirmed"] as const)(
    "asks first (%s booking): Cancel opens a panel naming the client, day and time, with no browser pop-up",
    (status) => {
      const popUp = vi.spyOn(window, "confirm");
      renderBooking(status);
      fireEvent.click(cancelButton());

      const panel = screen.getByRole("form", { name: QUESTION });
      expect(panel).toHaveTextContent("They'll get an email letting them know.");
      expect(screen.getByLabelText(REASON)).toHaveAttribute("maxlength", "500");
      expect(screen.getByRole("button", { name: "Yes, cancel and email Jordan" })).toBeInTheDocument();
      expect(screen.getByText(QUESTION)).toHaveFocus();
      expect(popUp).not.toHaveBeenCalled();
      expect(cancelBooking).not.toHaveBeenCalled();
      expect(setBookingStatus).not.toHaveBeenCalled();
    },
  );

  it('"Keep booking" closes the panel, changes nothing, and puts focus back on Cancel', () => {
    renderBooking("confirmed");
    fireEvent.click(cancelButton());
    fireEvent.click(screen.getByRole("button", { name: "Keep booking" }));

    expect(screen.queryByRole("form", { name: QUESTION })).toBeNull();
    expect(cancelButton()).toHaveFocus();
    expect(cancelBooking).not.toHaveBeenCalled();
  });

  it("with Don't email the client ticked, asks for no reason and cancels without emailing", async () => {
    vi.mocked(cancelBooking).mockResolvedValue({ ok: true, emailed: null });
    renderBooking("confirmed");
    fireEvent.click(cancelButton());
    const dontEmail = screen.getByRole("checkbox", { name: "Don't email the client" });
    expect(dontEmail).not.toBeChecked();
    fireEvent.click(dontEmail);

    expect(screen.getByRole("form", { name: QUESTION })).toHaveTextContent("Jordan won't be emailed.");
    expect(screen.queryByLabelText(REASON)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Yes, cancel" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Cancelled. Jordan has not been emailed.");
    expect(cancelBooking).toHaveBeenCalledWith(ID, "", true);
  });

  it("unticking Don't email the client brings the reason back, as typed", () => {
    renderBooking("new");
    fireEvent.click(cancelButton());
    fireEvent.change(screen.getByLabelText(REASON), { target: { value: "I'm away that week." } });
    const dontEmail = screen.getByRole("checkbox", { name: "Don't email the client" });
    fireEvent.click(dontEmail);
    fireEvent.click(dontEmail);

    expect(screen.getByLabelText(REASON)).toHaveValue("I'm away that week.");
    expect(screen.getByRole("button", { name: "Yes, cancel and email Jordan" })).toBeInTheDocument();
  });

  it("only one panel is open at a time: Cancel closes the confirm panel", () => {
    renderBooking("new");
    fireEvent.click(screen.getByRole("button", { name: /^Confirm/ }));
    fireEvent.click(cancelButton());

    expect(screen.queryByRole("form", { name: /^Confirm/ })).toBeNull();
    expect(screen.getByRole("form", { name: QUESTION })).toBeInTheDocument();
  });

  it("cancels with the reason and says the client has been emailed", async () => {
    renderBooking("confirmed");
    fireEvent.click(cancelButton());
    fireEvent.change(screen.getByLabelText(REASON), { target: { value: "I'm unwell this week." } });
    fireEvent.click(screen.getByRole("button", { name: "Yes, cancel and email Jordan" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Cancelled. Jordan has been emailed.");
    expect(cancelBooking).toHaveBeenCalledWith(ID, "I'm unwell this week.", false);
    expect(confirmBooking).not.toHaveBeenCalled();
    expect(screen.queryByRole("form", { name: QUESTION })).toBeNull();
  });

  it("warns the trainer to contact the client when the email did not send", async () => {
    vi.mocked(cancelBooking).mockResolvedValue({ ok: true, emailed: false });
    renderBooking("new");
    fireEvent.click(cancelButton());
    fireEvent.click(screen.getByRole("button", { name: "Yes, cancel and email Jordan" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Cancelled, but the email to Jordan didn't send. Please call or email them yourself.",
    );
    await waitFor(() => expect(alert).toHaveFocus());
  });

  it("keeps the panel open with the reason when cancelling fails", async () => {
    vi.mocked(cancelBooking).mockResolvedValue({
      ok: false,
      error: "Please shorten the reason to 500 characters or fewer.",
    });
    renderBooking("confirmed");
    fireEvent.click(cancelButton());
    fireEvent.change(screen.getByLabelText(REASON), { target: { value: "Hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Yes, cancel and email Jordan" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Please shorten the reason to 500 characters or fewer.",
    );
    expect(screen.getByLabelText(REASON)).toHaveValue("Hi");
  });

  it("reopening still acts straight away, with no panel and no email", async () => {
    renderBooking("cancelled");
    fireEvent.click(screen.getByRole("button", { name: /^Reopen/ }));

    await waitFor(() => expect(setBookingStatus).toHaveBeenCalledWith(ID, "new"));
    expect(screen.queryByRole("form")).toBeNull();
    expect(cancelBooking).not.toHaveBeenCalled();
  });
});

describe("cancelling a booking that has no email (added by the trainer)", () => {
  function renderNoEmailBooking() {
    render(
      <BookingStatusButtons
        id={ID}
        status="confirmed"
        who="Jordan Tester on Friday, October 25, 2030"
        clientFirstName="Jordan"
        when="Friday, October 25 at 9:00 AM"
        hasEmail={false}
      />,
    );
    fireEvent.click(cancelButton());
  }

  it("says nobody will be emailed, and asks for no reason to email", () => {
    renderNoEmailBooking();

    const panel = screen.getByRole("form", { name: QUESTION });
    expect(panel).toHaveTextContent("No email on file — let them know yourself.");
    expect(screen.queryByLabelText(REASON)).toBeNull();
    expect(screen.getByRole("button", { name: "Yes, cancel" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("cancels and reminds the trainer to tell the client", async () => {
    vi.mocked(cancelBooking).mockResolvedValue({ ok: true, emailed: null });
    renderNoEmailBooking();
    fireEvent.click(screen.getByRole("button", { name: "Yes, cancel" }));

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Cancelled. No email on file — let them know yourself.");
    expect(cancelBooking).toHaveBeenCalledWith(ID, "", false);
    await waitFor(() => expect(status).toHaveFocus());
  });
});
