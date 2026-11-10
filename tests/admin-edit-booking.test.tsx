import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { editBooking } from "@/app/admin/actions";
import { EditableBooking, EditingProvider, type EditableBookingData } from "@/app/admin/edit-booking";

vi.mock("@/app/admin/actions", () => ({ editBooking: vi.fn() }));

const JORDAN_ID = "2b9f6c1e-1d2a-4c3b-9e8f-0a1b2c3d4e5f";
const SAM_ID = "7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f";

/** Jordan's confirmed website booking: Friday, October 25, 2030, 9:00 to 10:00 AM Eastern. */
const JORDAN: EditableBookingData = {
  id: JORDAN_ID,
  name: "Jordan Tester",
  email: "jordan@example.com",
  phone: null,
  note: null,
  starts_at: "2030-10-25T13:00:00+00:00",
  ends_at: "2030-10-25T14:00:00+00:00",
  status: "confirmed",
  source: "website",
  session_type: "one-on-one",
};
const SAM: EditableBookingData = {
  ...JORDAN,
  id: SAM_ID,
  name: "Sam Lee",
  email: null,
  source: "admin",
  starts_at: "2030-10-26T13:00:00+00:00",
  ends_at: "2030-10-26T13:45:00+00:00",
};

/** The form as filled in from Jordan's booking, unchanged. */
const JORDAN_FIELDS = {
  id: JORDAN_ID,
  name: "Jordan Tester",
  email: "jordan@example.com",
  phone: "",
  note: "",
  date: "2030-10-25",
  time: "09:00",
  minutes: 60,
  sessionType: "one-on-one",
};

function renderCards(bookings: EditableBookingData[] = [JORDAN, SAM]) {
  render(
    <EditingProvider>
      <ul>
        {bookings.map((b) => (
          <li key={b.id} data-testid={b.name}>
            <EditableBooking
              booking={b}
              details={<p>Details for {b.name}</p>}
              actions={<button type="button">Cancel the booking</button>}
            />
          </li>
        ))}
      </ul>
    </EditingProvider>,
  );
}

const card = (name: string) => within(screen.getByTestId(name));

function openEdit(name = "Jordan Tester") {
  const edit = card(name).getByRole("button", { name: /^Edit/ });
  fireEvent.click(edit);
  return { edit, form: card(name).getByRole("form", { name: `Edit ${name.split(" ")[0]}'s booking` }) };
}

beforeEach(() =>
  vi.mocked(editBooking).mockResolvedValue({ ok: true, moved: false, confirmed: false, emailed: null }),
);
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("editing a booking from /admin", () => {
  it("turns the card into the booking form, filled in, with focus on it", () => {
    renderCards();
    const { form } = openEdit();
    const f = within(form);

    expect(f.getByRole("heading", { name: "Edit Jordan's booking" })).toHaveFocus();
    expect(f.getByLabelText("Client's name")).toHaveValue("Jordan Tester");
    expect(f.getByLabelText("Date")).toHaveValue("2030-10-25");
    expect(f.getByLabelText("Start time")).toHaveValue("09:00");
    expect(f.getByLabelText("Length")).toHaveValue("60");
    expect(f.getByLabelText("Email")).toHaveValue("jordan@example.com");
    expect(f.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
    expect(f.getByRole("button", { name: "Never mind" })).toBeInTheDocument();
    // The card's details and its Confirm/Cancel buttons give way to the form.
    expect(card("Jordan Tester").queryByText("Details for Jordan Tester")).toBeNull();
    expect(card("Jordan Tester").queryByRole("button", { name: "Cancel the booking" })).toBeNull();
  });

  it("shows the booking's session type, required", () => {
    renderCards();
    const { form } = openEdit();
    const group = within(form).getByRole("group", { name: "Session type" });

    expect(within(group).getByRole("radio", { name: "1-on-1 training" })).toBeChecked();
    for (const option of within(group).getAllByRole("radio")) expect(option).toBeRequired();
  });

  it("saves a change of session type alone as a details edit, saying nothing about email", async () => {
    renderCards();
    const { form } = openEdit();
    fireEvent.click(within(form).getByRole("radio", { name: "Virtual partner training" }));

    expect(within(form).queryByLabelText("Don't email the client")).toBeNull();
    fireEvent.click(within(form).getByRole("button", { name: "Save changes" }));

    expect(await card("Jordan Tester").findByRole("status")).toHaveTextContent("Saved your changes to Jordan's booking.");
    expect(editBooking).toHaveBeenCalledWith({ ...JORDAN_FIELDS, sessionType: "virtual-partner", skipEmail: false });
  });

  it("on a booking made before session types, chooses none, makes it optional and explains why", async () => {
    renderCards([{ ...JORDAN, session_type: null }]);
    const { form } = openEdit();
    const group = within(form).getByRole("group", { name: "Session type" });

    for (const option of within(group).getAllByRole("radio")) {
      expect(option).not.toBeChecked();
      expect(option).not.toBeRequired();
    }
    expect(group).toHaveAccessibleDescription("Not recorded for this booking. Choose one if you know it.");

    // Once one is chosen the hint no longer applies.
    fireEvent.click(within(group).getByRole("radio", { name: "Partner training" }));
    expect(group).not.toHaveAccessibleDescription();
    expect(within(form).queryByText(/Not recorded for this booking/)).toBeNull();
  });

  it("saves a booking made before session types without choosing one", async () => {
    renderCards([{ ...JORDAN, session_type: null }]);
    const { form } = openEdit();

    fireEvent.change(within(form).getByLabelText("Note (optional)"), { target: { value: "Bad left knee." } });
    fireEvent.click(within(form).getByRole("button", { name: "Save changes" }));

    await card("Jordan Tester").findByRole("status");
    expect(editBooking).toHaveBeenCalledWith({
      ...JORDAN_FIELDS,
      note: "Bad left knee.",
      sessionType: null,
      skipEmail: false,
    });
  });

  it("marks email optional only on a booking the trainer added", () => {
    renderCards();
    const { form } = openEdit("Sam Lee");
    expect(within(form).getByLabelText("Email (optional)")).toHaveValue("");
  });

  it("keeps only one card in edit mode at a time", () => {
    renderCards();
    openEdit("Jordan Tester");
    openEdit("Sam Lee");

    expect(screen.getAllByRole("form")).toHaveLength(1);
    expect(card("Jordan Tester").getByText("Details for Jordan Tester")).toBeInTheDocument();
  });

  it("does not offer Edit when the card is not editable", () => {
    render(
      <EditingProvider>
        <EditableBooking booking={JORDAN} canEdit={false} details={<p>Details</p>} actions={null} />
      </EditingProvider>,
    );
    expect(screen.queryByRole("button", { name: /^Edit/ })).toBeNull();
  });

  it("says nothing about email while only the details change", () => {
    renderCards();
    const { form } = openEdit();
    fireEvent.change(within(form).getByLabelText("Phone (optional)"), { target: { value: "555 0100" } });

    expect(within(form).queryByLabelText("Don't email the client")).toBeNull();
    expect(form).not.toHaveTextContent(/email(s|ed)? Jordan/);
  });

  it("saves details-only changes, then shows the card again and says it was saved", async () => {
    renderCards();
    const { form } = openEdit();
    fireEvent.change(within(form).getByLabelText("Note (optional)"), { target: { value: "Bad left knee." } });
    fireEvent.click(within(form).getByRole("button", { name: "Save changes" }));

    const status = await card("Jordan Tester").findByRole("status");
    expect(status).toHaveTextContent("Saved your changes to Jordan's booking.");
    expect(editBooking).toHaveBeenCalledWith({ ...JORDAN_FIELDS, note: "Bad left knee.", skipEmail: false });
    expect(card("Jordan Tester").queryByRole("form")).toBeNull();
    expect(card("Jordan Tester").getByText("Details for Jordan Tester")).toBeInTheDocument();
    await waitFor(() => expect(status).toHaveFocus());
  });

  it("when the time changes, says the client will be emailed and offers not to", async () => {
    vi.mocked(editBooking).mockResolvedValue({ ok: true, moved: true, confirmed: false, emailed: true });
    renderCards();
    const { form } = openEdit();
    fireEvent.change(within(form).getByLabelText("Start time"), { target: { value: "11:00" } });

    expect(form).toHaveTextContent("Saving emails Jordan the old and new times.");
    const dontEmail = within(form).getByLabelText("Don't email the client");
    expect(dontEmail).not.toBeChecked();

    fireEvent.click(within(form).getByRole("button", { name: "Save changes" }));
    expect(await card("Jordan Tester").findByRole("status")).toHaveTextContent(
      "Moved Jordan's session to Friday, October 25 at 11:00 AM. Jordan has been emailed the new time.",
    );
    expect(editBooking).toHaveBeenCalledWith({ ...JORDAN_FIELDS, time: "11:00", skipEmail: false });
  });

  it("passes Don't email the client through, and says the client was not emailed", async () => {
    vi.mocked(editBooking).mockResolvedValue({ ok: true, moved: true, confirmed: false, emailed: null });
    renderCards();
    const { form } = openEdit();
    fireEvent.change(within(form).getByLabelText("Length"), { target: { value: "90" } });
    fireEvent.click(within(form).getByLabelText("Don't email the client"));
    fireEvent.click(within(form).getByRole("button", { name: "Save changes" }));

    expect(await card("Jordan Tester").findByRole("status")).toHaveTextContent(
      "Moved Jordan's session to Friday, October 25 at 9:00 AM. Jordan has not been emailed.",
    );
    expect(editBooking).toHaveBeenCalledWith({ ...JORDAN_FIELDS, minutes: 90, skipEmail: true });
  });

  it("explains that moving a new request confirms it", async () => {
    vi.mocked(editBooking).mockResolvedValue({ ok: true, moved: true, confirmed: true, emailed: true });
    renderCards([{ ...JORDAN, status: "new" }]);
    const { form } = openEdit();
    fireEvent.change(within(form).getByLabelText("Date"), { target: { value: "2030-10-27" } });

    expect(form).toHaveTextContent(
      "Moving this request also confirms it. Saving sends Jordan the confirmation email with the new time.",
    );
    fireEvent.click(within(form).getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Moved and confirmed Jordan's session for Sunday, October 27 at 9:00 AM. Jordan has been emailed a confirmation.",
    );
  });

  it("with no email on file, says to let the client know instead of offering the checkbox", async () => {
    vi.mocked(editBooking).mockResolvedValue({ ok: true, moved: true, confirmed: false, emailed: null });
    renderCards();
    const { form } = openEdit("Sam Lee");
    fireEvent.change(within(form).getByLabelText("Start time"), { target: { value: "10:00" } });

    expect(form).toHaveTextContent("No email on file — let them know yourself.");
    expect(within(form).queryByLabelText("Don't email the client")).toBeNull();
    fireEvent.click(within(form).getByRole("button", { name: "Save changes" }));
    expect(await card("Sam Lee").findByRole("status")).toHaveTextContent(
      "Moved Sam's session to Saturday, October 26 at 10:00 AM. No email on file — let them know yourself.",
    );
  });

  it("warns the trainer to contact the client when the email did not send", async () => {
    vi.mocked(editBooking).mockResolvedValue({ ok: true, moved: true, confirmed: false, emailed: false });
    renderCards();
    const { form } = openEdit();
    fireEvent.change(within(form).getByLabelText("Start time"), { target: { value: "11:00" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save changes" }));

    expect(await card("Jordan Tester").findByRole("alert")).toHaveTextContent(
      "Moved Jordan's session to Friday, October 25 at 11:00 AM, but the email to Jordan didn't send. Please call or email them yourself.",
    );
  });

  it("warns about an overlap, and can save anyway", async () => {
    vi.mocked(editBooking).mockResolvedValueOnce({ ok: false, overlap: true, error: "This overlaps Sam's 9:30 AM session." });
    renderCards();
    const { form } = openEdit();
    fireEvent.change(within(form).getByLabelText("Start time"), { target: { value: "09:15" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save changes" }));

    expect(await within(form).findByRole("alert")).toHaveTextContent(
      "This overlaps Sam's 9:30 AM session. You can choose another time, or save it anyway.",
    );
    vi.mocked(editBooking).mockResolvedValue({ ok: true, moved: true, confirmed: false, emailed: true });
    fireEvent.click(within(form).getByRole("button", { name: "Save anyway" }));

    await card("Jordan Tester").findByRole("status");
    expect(editBooking).toHaveBeenLastCalledWith({ ...JORDAN_FIELDS, time: "09:15", skipEmail: false, allowOverlap: true });
  });

  it("keeps what was typed and says what to do when saving fails", async () => {
    vi.mocked(editBooking).mockResolvedValue({ ok: false, error: "Please enter the client's name." });
    renderCards();
    const { form } = openEdit();
    fireEvent.change(within(form).getByLabelText("Client's name"), { target: { value: "" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save changes" }));

    expect(await within(form).findByRole("alert")).toHaveTextContent("Please enter the client's name.");
    expect(within(form).getByLabelText("Client's name")).toHaveValue("");
  });

  it("Never mind closes without saving, putting focus back on Edit", () => {
    renderCards();
    const { edit, form } = openEdit();
    fireEvent.change(within(form).getByLabelText("Client's name"), { target: { value: "Changed" } });
    fireEvent.click(within(form).getByRole("button", { name: "Never mind" }));

    expect(card("Jordan Tester").queryByRole("form")).toBeNull();
    expect(card("Jordan Tester").getByRole("button", { name: /^Edit/ })).toHaveFocus();
    expect(edit).toBeDefined();
    expect(editBooking).not.toHaveBeenCalled();

    // Reopening starts again from the booking, not from the discarded change.
    const { form: again } = openEdit();
    expect(within(again).getByLabelText("Client's name")).toHaveValue("Jordan Tester");
  });
});
