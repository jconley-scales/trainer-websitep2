import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import BookPage from "@/app/(marketing)/book/page";
import { SITE } from "@/lib/site";

vi.mock("@/app/(marketing)/book/actions", () => ({
  getTakenTimes: vi.fn(async () => []),
  submitBooking: vi.fn(async () => ({ ok: true })),
}));

afterEach(cleanup);

/** Picks the first open day and its time number `timeIndex`; returns that time's label. */
async function pickTime(timeIndex = 0): Promise<string> {
  fireEvent.click((await screen.findAllByRole("button", { name: /available$/ }))[0]);
  const time = document.querySelectorAll<HTMLButtonElement>(".slot-row")[timeIndex];
  const label = time.textContent!;
  fireEvent.click(time);
  return label;
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
    fireEvent.click((await screen.findAllByRole("button", { name: /available$/ }))[0]);
    fireEvent.click(document.querySelector<HTMLButtonElement>(".slot-row")!);
    const form = screen.getByRole("button", { name: "Request this session" }).closest("form")!;
    const link = within(form).getByRole("link", { name: "How we use your details" });
    expect(link).toHaveAttribute("href", "/privacy");
  });

  it("tells screen reader users to share only the health details they're comfortable emailing", async () => {
    render(<BookPage />);
    fireEvent.click((await screen.findAllByRole("button", { name: /available$/ }))[0]);
    fireEvent.click(document.querySelector<HTMLButtonElement>(".slot-row")!);
    const note = screen.getByLabelText("Anything you would like me to know (optional)");
    expect(note).toHaveAccessibleDescription(SITE.bookingNoteHint);
    expect(SITE.bookingNoteHint).toMatch(/health details/);
  });

  it("replaces the whole booking page with the thank-you once the request is in", async () => {
    render(<BookPage />);

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
    await screen.findAllByRole("button", { name: /available$/ });
    expect(document.body).toHaveFocus();
  });
});
