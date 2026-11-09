import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addBooking } from "@/app/admin/actions";
import { AddBookingForm } from "@/app/admin/add-booking-form";

vi.mock("@/app/admin/actions", () => ({ addBooking: vi.fn() }));

function openForm() {
  render(<AddBookingForm />);
  const toggle = screen.getByRole("button", { name: "Add a booking" });
  fireEvent.click(toggle);
  return { toggle, form: screen.getByRole("form", { name: "Add a booking" }) };
}

/** Fills the form for Jane on Tuesday, October 22, 2030 at 10:15 AM for 45 minutes. */
function fillPhoneBooking(form: HTMLElement) {
  const f = within(form);
  fireEvent.change(f.getByLabelText("Client's name"), { target: { value: "Jane Doe" } });
  fireEvent.change(f.getByLabelText("Date"), { target: { value: "2030-10-22" } });
  fireEvent.change(f.getByLabelText("Start time"), { target: { value: "10:15" } });
  fireEvent.change(f.getByLabelText("Length"), { target: { value: "45" } });
}

const PHONE_BOOKING = {
  name: "Jane Doe",
  email: "",
  phone: "",
  note: "",
  date: "2030-10-22",
  time: "10:15",
  minutes: 45,
};

beforeEach(() => vi.mocked(addBooking).mockResolvedValue({ ok: true, emailed: null }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("adding a booking from /admin", () => {
  it("opens the form inline, moving focus into it, with only the name required", () => {
    const { toggle, form } = openForm();

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(within(form).getByRole("heading", { name: "Add a booking" })).toHaveFocus();
    for (const label of ["Client's name", "Date", "Start time", "Length"]) {
      expect(within(form).getByLabelText(label)).toBeInTheDocument();
    }
    for (const label of ["Email (optional)", "Phone (optional)", "Note (optional)"]) {
      expect(within(form).getByLabelText(label)).toBeInTheDocument();
    }
  });

  it("offers every quarter hour of the day, and lengths in quarter hours defaulting to 1 hour", () => {
    const { form } = openForm();
    const times = within(within(form).getByLabelText("Start time")).getAllByRole("option");
    const values = times.map((o) => (o as HTMLOptionElement).value).filter(Boolean);
    expect(values).toHaveLength(96);
    expect(values.slice(0, 3)).toEqual(["00:00", "00:15", "00:30"]);
    expect(within(form).getByRole("option", { name: "10:15 AM" })).toBeInTheDocument();
    expect(within(form).getByLabelText("Length")).toHaveValue("60");
    expect(within(form).getByRole("option", { name: "45 minutes" })).toBeInTheDocument();
    expect(within(form).getByRole("option", { name: "1 hour 30 minutes" })).toBeInTheDocument();
  });

  it("does not let a past date be picked", () => {
    const { form } = openForm();
    expect(within(form).getByLabelText("Date").getAttribute("min")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("saves the booking, closes the form and says it was added", async () => {
    const { toggle, form } = openForm();
    fillPhoneBooking(form);
    fireEvent.click(within(form).getByRole("button", { name: "Save booking" }));

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Added Jane's session on Tuesday, October 22 at 10:15 AM.");
    expect(addBooking).toHaveBeenCalledWith(PHONE_BOOKING);
    expect(screen.queryByRole("form", { name: "Add a booking" })).toBeNull();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => expect(status).toHaveFocus());
  });

  it("says the client was emailed when they were", async () => {
    vi.mocked(addBooking).mockResolvedValue({ ok: true, emailed: true });
    const { form } = openForm();
    fillPhoneBooking(form);
    fireEvent.change(within(form).getByLabelText("Email (optional)"), { target: { value: "jane@example.com" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save booking" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Added Jane's session on Tuesday, October 22 at 10:15 AM. Jane has been emailed a confirmation.",
    );
  });

  it("warns the trainer to contact the client when the email did not send", async () => {
    vi.mocked(addBooking).mockResolvedValue({ ok: true, emailed: false });
    const { form } = openForm();
    fillPhoneBooking(form);
    fireEvent.click(within(form).getByRole("button", { name: "Save booking" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Added Jane's session on Tuesday, October 22 at 10:15 AM, but the confirmation email to Jane didn't send. Please call or email them yourself.",
    );
  });

  it("warns about an overlap, and can save anyway", async () => {
    vi.mocked(addBooking).mockResolvedValueOnce({
      ok: false,
      overlap: true,
      error: "This overlaps Sam's 9:30 AM session.",
    });
    const { form } = openForm();
    fillPhoneBooking(form);
    fireEvent.click(within(form).getByRole("button", { name: "Save booking" }));

    const warning = await within(form).findByRole("alert");
    expect(warning).toHaveTextContent("This overlaps Sam's 9:30 AM session.");
    fireEvent.click(within(form).getByRole("button", { name: "Save anyway" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Added Jane's session");
    expect(addBooking).toHaveBeenLastCalledWith({ ...PHONE_BOOKING, allowOverlap: true });
  });

  it("drops the overlap warning when the booking is changed", async () => {
    vi.mocked(addBooking).mockResolvedValueOnce({ ok: false, overlap: true, error: "This overlaps Sam's 9:30 AM session." });
    const { form } = openForm();
    fillPhoneBooking(form);
    fireEvent.click(within(form).getByRole("button", { name: "Save booking" }));
    await within(form).findByRole("alert");

    fireEvent.change(within(form).getByLabelText("Start time"), { target: { value: "11:00" } });

    expect(within(form).queryByRole("button", { name: "Save anyway" })).toBeNull();
    expect(within(form).queryByRole("alert")).toBeNull();
  });

  it("keeps what was typed and says what to do when saving fails", async () => {
    vi.mocked(addBooking).mockResolvedValue({ ok: false, error: "Please enter the client's name." });
    const { form } = openForm();
    fireEvent.click(within(form).getByRole("button", { name: "Save booking" }));

    expect(await within(form).findByRole("alert")).toHaveTextContent("Please enter the client's name.");
    expect(within(form).queryByRole("button", { name: "Save anyway" })).toBeNull();
    expect(screen.getByRole("form", { name: "Add a booking" })).toBeInTheDocument();
  });

  it("closes without saving, putting focus back on Add a booking", () => {
    const { toggle, form } = openForm();
    fireEvent.click(within(form).getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("form", { name: "Add a booking" })).toBeNull();
    expect(toggle).toHaveFocus();
    expect(addBooking).not.toHaveBeenCalled();
  });
});
