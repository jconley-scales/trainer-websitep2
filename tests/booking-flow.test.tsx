import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import BookPage from "@/app/(marketing)/book/page";
import { SITE } from "@/lib/site";

vi.mock("@/app/(marketing)/book/actions", () => ({
  getTakenTimes: vi.fn(async () => []),
  submitBooking: vi.fn(async () => ({ ok: true })),
}));

afterEach(cleanup);

describe("booking a session", () => {
  it("links to the privacy page from the details form", async () => {
    render(<BookPage />);
    fireEvent.click((await screen.findAllByRole("button", { name: /available$/ }))[0]);
    fireEvent.click(document.querySelector<HTMLButtonElement>(".slot-row")!);
    const form = screen.getByRole("button", { name: "Request this session" }).closest("form")!;
    const link = within(form).getByRole("link", { name: "How we use your details" });
    expect(link).toHaveAttribute("href", "/privacy");
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
