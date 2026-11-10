import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import BookPage from "@/app/(marketing)/book/page";
import { submitBooking } from "@/app/(marketing)/book/actions";
import { SITE } from "@/lib/site";

vi.mock("@/app/(marketing)/book/actions", () => ({
  getTakenTimes: vi.fn(async () => []),
  submitBooking: vi.fn(async () => ({ ok: true })),
}));

afterEach(() => {
  cleanup();
  vi.mocked(submitBooking).mockClear();
});

const ONE_ON_ONE = /^1-on-1 training/;
const PARTNER = /^Partner training/;
const VIRTUAL_ONE_ON_ONE = /^Virtual 1-on-1 training/;
const VIRTUAL_PARTNER = /^Virtual partner training/;

/** Chooses a session type (1-on-1 training unless told otherwise). */
async function chooseType(name: RegExp = ONE_ON_ONE) {
  fireEvent.click(await screen.findByRole("radio", { name }));
}

/** Picks the first open day and its time number `timeIndex`; returns that time's label. */
async function pickTimeOnly(timeIndex = 0): Promise<string> {
  fireEvent.click((await screen.findAllByRole("button", { name: /available$/ }))[0]);
  const time = document.querySelectorAll<HTMLButtonElement>(".slot-row")[timeIndex];
  const label = time.textContent!;
  fireEvent.click(time);
  return label;
}

/** Chooses 1-on-1 training, then picks a time as `pickTimeOnly` does. */
async function pickTime(timeIndex = 0): Promise<string> {
  await chooseType();
  return pickTimeOnly(timeIndex);
}

/** Sends the open details form and waits for the thank-you. */
async function sendRequest() {
  fireEvent.submit(screen.getByRole("button", { name: "Request this session" }).closest("form")!);
  await screen.findByRole("heading", { level: 1, name: /^Thank you/ });
}

/** Fills in the contact details and books one time. */
async function bookFirstVisit(timeIndex = 0): Promise<string> {
  const label = await pickTime(timeIndex);
  fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Pat Example" } });
  fireEvent.change(screen.getByLabelText("Your email address"), { target: { value: "pat@example.com" } });
  fireEvent.change(screen.getByLabelText("Your phone number (optional)"), { target: { value: "555 0100" } });
  fireEvent.change(screen.getByLabelText("Anything you would like me to know (optional)"), {
    target: { value: "Sore knee" },
  });
  await sendRequest();
  return label;
}

describe("booking a session", () => {
  it("links to the privacy page from the details form", async () => {
    render(<BookPage />);
    await pickTime();
    const form =screen.getByRole("button", { name: "Request this session" }).closest("form")!;
    const link = within(form).getByRole("link", { name: "How we use your details" });
    expect(link).toHaveAttribute("href", "/privacy");
  });

  it("tells screen reader users to share only the health details they're comfortable emailing", async () => {
    render(<BookPage />);
    await pickTime();
    const note =screen.getByLabelText("Anything you would like me to know (optional)");
    expect(note).toHaveAccessibleDescription(SITE.bookingNoteHint);
    expect(SITE.bookingNoteHint).toMatch(/health details/);
  });

  it("replaces the whole booking page with the thank-you once the request is in", async () => {
    render(<BookPage />);

    await chooseType();
    const openDay = (await screen.findAllByRole("button", { name: /available$/ }))[0];
    fireEvent.click(openDay);
    const firstTime = document.querySelector<HTMLButtonElement>(".slot-row")!;
    const chosenTime = firstTime.textContent!;
    fireEvent.click(firstTime);
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Pat Example" } });
    fireEvent.change(screen.getByLabelText("Your email address"), { target: { value: "pat@example.com" } });
    fireEvent.submit(screen.getByRole("button", { name: "Request this session" }).closest("form")!);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Thank you — your request is in" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent(chosenTime);
    expect(screen.getByRole("status")).toHaveTextContent("not a confirmed booking yet");
    expect(screen.getByRole("link", { name: "Back to the home page" })).toHaveAttribute("href", "/");

    // Nothing from the booking page is left to confuse anyone.
    expect(screen.queryByText("Book a session")).toBeNull();
    expect(screen.queryByText(SITE.certifiedBy)).toBeNull();
    expect(screen.queryByRole("link", { name: "See pricing" })).toBeNull();
    expect(document.querySelector(".booking-calendar, .booking-form")).toBeNull();
    await waitFor(() => expect(document.title).toBe(`Request received | ${SITE.name}`));
  });
});

describe("choosing a session type", () => {
  it("asks first, with no type chosen yet and the calendar still closed", async () => {
    render(<BookPage />);
    const group = await screen.findByRole("group", { name: /kind of session/i });
    const radios = within(group).getAllByRole("radio");
    const oneOnOne = within(group).getByRole("radio", { name: ONE_ON_ONE });

    expect(radios).toHaveLength(4);
    expect(radios[0]).toHaveAccessibleName("1-on-1 training Just you and your trainer, in person.");
    expect(radios[1]).toHaveAccessibleName("Partner training Train with a partner, in person. Prices cover both of you.");
    expect(radios[2]).toHaveAccessibleName("Virtual 1-on-1 training Just you and your trainer, live over video.");
    expect(radios[3]).toHaveAccessibleName(
      "Virtual partner training Train with a partner, live over video. Prices cover both of you.",
    );
    for (const radio of radios) expect(radio).not.toBeChecked();
    expect(within(group).getByRole("link", { name: "See pricing" })).toHaveAttribute("href", "/pricing");
    expect(group).not.toHaveTextContent("$");

    // No calendar, times or details form until a type is chosen; a hint says why.
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("button", { name: /available$/ })).toBeNull();
    expect(document.querySelector(".booking-calendar, .booking-times, .booking-form")).toBeNull();
    expect(oneOnOne).toHaveAccessibleDescription("Choose one and the calendar will open below.");
  });

  it.each([[ONE_ON_ONE], [PARTNER], [VIRTUAL_ONE_ON_ONE], [VIRTUAL_PARTNER]])(
    "opens the calendar below once a type is chosen (%s)",
    async (name) => {
    render(<BookPage />);
    await chooseType(name);
    const group = screen.getByRole("group", { name: /kind of session/i });
    const calendar = screen.getByRole("table");
    expect(group.compareDocumentPosition(calendar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /available$/ }).length).toBeGreaterThan(0);
    expect(screen.queryByText("Choose one and the calendar will open below.")).toBeNull();
    },
  );

  it("keeps the picked time and details when the type is changed afterwards", async () => {
    render(<BookPage />);
    const time = await pickTime();
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Pat Example" } });
    fireEvent.change(screen.getByLabelText("Your email address"), { target: { value: "pat@example.com" } });
    await chooseType(PARTNER);

    expect(screen.getByLabelText("Your name")).toHaveValue("Pat Example");
    expect(document.querySelector(".booking-chosen")).toHaveTextContent(time);
    await sendRequest();
    expect(submitBooking).toHaveBeenCalledWith(expect.objectContaining({ sessionType: "partner" }));
  });

  it("offers virtual sessions only at weekends, at 11:00, 12:45 and 2:30", async () => {
    render(<BookPage />);
    await chooseType(VIRTUAL_ONE_ON_ONE);
    const days = screen.getAllByRole("button", { name: /available$/ });
    for (const day of days) expect(day).toHaveAccessibleName(/^(Saturday|Sunday), /);
    fireEvent.click(days[0]);
    const times = [...document.querySelectorAll(".slot-row")].map((row) => row.textContent);
    expect(times.length).toBeGreaterThan(0);
    for (const time of times) expect(time).toMatch(/^(11:00 AM|12:45 PM|2:30 PM) to /);
  });

  it("says which kind of session is being booked", async () => {
    render(<BookPage />);
    await chooseType(VIRTUAL_PARTNER);
    const time = await pickTimeOnly();
    expect(document.querySelector(".booking-chosen")).toHaveTextContent("Booking virtual partner training on");
    expect(document.querySelector(".booking-chosen")).toHaveTextContent(time);
  });

  it("drops a picked in-person time when switching to virtual, which never offers it", async () => {
    render(<BookPage />);
    // In-person times (8:00, 9:45, 11:30, 1:15, 3:00) are never virtual times.
    await pickTime();
    expect(document.querySelector(".booking-form")).not.toBeNull();

    await chooseType(VIRTUAL_ONE_ON_ONE);
    expect(document.querySelector(".booking-form")).toBeNull();
    expect(screen.getAllByRole("button", { name: /available$/ }).length).toBeGreaterThan(0);
  });

  it.each([
    [ONE_ON_ONE, "one-on-one"],
    [PARTNER, "partner"],
    [VIRTUAL_ONE_ON_ONE, "virtual-one-on-one"],
    [VIRTUAL_PARTNER, "virtual-partner"],
  ] as const)("sends the chosen type with the request (%s)", async (name, id) => {
    render(<BookPage />);
    await chooseType(name);
    await pickTimeOnly();
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Pat Example" } });
    fireEvent.change(screen.getByLabelText("Your email address"), { target: { value: "pat@example.com" } });
    await sendRequest();

    expect(submitBooking).toHaveBeenCalledWith(expect.objectContaining({ sessionType: id }));
  });

});

describe("booking another session in the same visit", () => {
  it("brings the calendar back with name, email and phone already filled in", async () => {
    render(<BookPage />);
    await bookFirstVisit();

    fireEvent.click(screen.getByRole("button", { name: "Book another session" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Book a session" })).toBeInTheDocument();
    await pickTime(0);

    expect(screen.getByLabelText("Your name")).toHaveValue("Pat Example");
    expect(screen.getByLabelText("Your email address")).toHaveValue("pat@example.com");
    expect(screen.getByLabelText("Your phone number (optional)")).toHaveValue("555 0100");
    // The note is about one session, so it starts empty each time.
    expect(screen.getByLabelText("Anything you would like me to know (optional)")).toHaveValue("");
  });

  it("no longer offers a time booked this visit, and lists every time booked on the thank-you", async () => {
    render(<BookPage />);
    const first = await bookFirstVisit(0);

    fireEvent.click(screen.getByRole("button", { name: "Book another session" }));
    await chooseType();
    fireEvent.click((await screen.findAllByRole("button", { name: /available$/ }))[0]);
    const offered = [...document.querySelectorAll(".slot-row")].map((b) => b.textContent);
    expect(offered).not.toContain(first);

    const second = await pickTime(0);
    await sendRequest();

    expect(screen.getByRole("heading", { level: 1, name: "Thank you — your requests are in" })).toBeInTheDocument();
    const items = within(screen.getByRole("status")).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent(first);
    expect(items[1]).toHaveTextContent(second);
  });

  it("after three requests this visit, says they are waiting instead of offering another", async () => {
    render(<BookPage />);
    await bookFirstVisit();
    for (let i = 0; i < 2; i++) {
      fireEvent.click(screen.getByRole("button", { name: "Book another session" }));
      await pickTime(0);
      await sendRequest();
    }

    expect(within(screen.getByRole("status")).getAllByRole("listitem")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "Book another session" })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(
      "You have 3 requests waiting — we'll be in touch to confirm.",
    );
  });

  it("keeps the details in memory only, so a fresh visit starts empty", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const { unmount } = render(<BookPage />);
    await bookFirstVisit();
    fireEvent.click(screen.getByRole("button", { name: "Book another session" }));
    await pickTime(0);
    expect(setItem).not.toHaveBeenCalled();
    expect(localStorage.length + sessionStorage.length).toBe(0);
    setItem.mockRestore();

    unmount(); // what a reload does
    render(<BookPage />);
    await pickTime(0);
    expect(screen.getByLabelText("Your name")).toHaveValue("");
    expect(screen.getByLabelText("Your email address")).toHaveValue("");
  });

  it("moves focus to the heading of the thank-you, then back to the calendar's", async () => {
    render(<BookPage />);
    await bookFirstVisit();
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1, name: /^Thank you/ })).toHaveFocus(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Book another session" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1, name: "Book a session" })).toHaveFocus(),
    );
  });

  it("does not move focus when the page first opens", async () => {
    render(<BookPage />);
    await screen.findByRole("group", { name: /kind of session/i });
    expect(document.body).toHaveFocus();
  });
});
