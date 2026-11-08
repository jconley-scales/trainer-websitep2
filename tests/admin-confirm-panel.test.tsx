import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BookingStatusButtons } from "@/app/admin/booking-status-buttons";
import { confirmBooking, setBookingStatus } from "@/app/admin/actions";

vi.mock("@/app/admin/actions", () => ({
  cancelBooking: vi.fn(),
  confirmBooking: vi.fn(),
  setBookingStatus: vi.fn(async () => ({ ok: true })),
}));

const ID = "2b9f6c1e-1d2a-4c3b-9e8f-0a1b2c3d4e5f";
const QUESTION = "Confirm Jordan's booking on Friday, October 25 at 9:00 AM?";

function renderNewBooking() {
  render(
    <BookingStatusButtons
      id={ID}
      status="new"
      who="Jordan Tester on Friday, October 25, 2030"
      clientFirstName="Jordan"
      when="Friday, October 25 at 9:00 AM"
    />,
  );
  return screen.getByRole("button", { name: /^Confirm/ });
}

beforeEach(() => vi.mocked(confirmBooking).mockResolvedValue({ ok: true, emailed: true }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("confirming a booking", () => {
  it("asks first: Confirm opens a panel naming the client, day and time, without changing anything", () => {
    fireEvent.click(renderNewBooking());

    const panel = screen.getByRole("form", { name: QUESTION });
    expect(panel).toHaveTextContent("They'll get a confirmation email.");
    expect(screen.getByLabelText("Note for Jordan (optional)")).toHaveAttribute("maxlength", "500");
    expect(screen.getByRole("button", { name: "Yes, confirm and email Jordan" })).toBeInTheDocument();
    expect(screen.getByText(QUESTION)).toHaveFocus();
    expect(confirmBooking).not.toHaveBeenCalled();
    expect(setBookingStatus).not.toHaveBeenCalled();
  });

  it('"Not yet" closes the panel, changes nothing, and puts focus back on Confirm', () => {
    const confirm = renderNewBooking();
    fireEvent.click(confirm);
    fireEvent.click(screen.getByRole("button", { name: "Not yet" }));

    expect(screen.queryByRole("form", { name: QUESTION })).toBeNull();
    expect(confirm).toHaveFocus();
    expect(confirmBooking).not.toHaveBeenCalled();
  });

  it("confirms with the note and says the client has been emailed", async () => {
    fireEvent.click(renderNewBooking());
    fireEvent.change(screen.getByLabelText("Note for Jordan (optional)"), {
      target: { value: "Meet at Oakledge Park." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Yes, confirm and email Jordan" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Confirmed. Jordan has been emailed.");
    expect(confirmBooking).toHaveBeenCalledWith(ID, "Meet at Oakledge Park.");
    expect(screen.queryByRole("form", { name: QUESTION })).toBeNull();
  });

  it("warns the trainer to contact the client when the email did not send", async () => {
    vi.mocked(confirmBooking).mockResolvedValue({ ok: true, emailed: false });
    fireEvent.click(renderNewBooking());
    fireEvent.click(screen.getByRole("button", { name: "Yes, confirm and email Jordan" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Confirmed, but the email to Jordan didn't send. Please call or email them yourself.",
    );
    await waitFor(() => expect(alert).toHaveFocus());
  });

  it("keeps the panel open with the note when confirming fails", async () => {
    vi.mocked(confirmBooking).mockResolvedValue({ ok: false, error: "Sorry, that did not save. Please try again." });
    fireEvent.click(renderNewBooking());
    fireEvent.change(screen.getByLabelText("Note for Jordan (optional)"), { target: { value: "Hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Yes, confirm and email Jordan" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Sorry, that did not save. Please try again.");
    expect(screen.getByLabelText("Note for Jordan (optional)")).toHaveValue("Hi");
  });
});
