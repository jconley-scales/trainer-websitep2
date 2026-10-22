import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionsView } from "@/components/SessionsView";

const SESSION = {
  id: "b1",
  dateLabel: "Tuesday, March 5, 2030",
  timeLabel: "10:00 AM to 11:00 AM",
  startLabel: "10:00 AM",
  trainerName: "Taylor Trainer",
  location: "Main Gym",
};
const BOOKED = "Your session on Tuesday, March 5, 2030 at 10:00 AM has been booked.";

beforeEach(() => {
  vi.useFakeTimers();
  // jsdom does not implement the modal <dialog> methods.
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("SessionsView status region", () => {
  it("is always present, and empty when nothing has happened", () => {
    render(<SessionsView sessions={[SESSION]} cancelAction={async () => {}} />);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("announces a booking by filling the already-present region after mount", () => {
    render(<SessionsView sessions={[SESSION]} cancelAction={async () => {}} bookedMessage={BOOKED} />);
    // Present but empty at first, so the text arrives as a change screen readers announce.
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByRole("status")).toHaveTextContent(BOOKED);
  });

  it("says nothing about booking when no booked message is given", () => {
    render(<SessionsView sessions={[SESSION]} cancelAction={async () => {}} bookedMessage={null} />);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("still confirms a cancel, and the cancel message replaces the booked one", async () => {
    const cancelAction = vi.fn(async () => {});
    const { rerender } = render(
      <SessionsView sessions={[SESSION]} cancelAction={cancelAction} bookedMessage={BOOKED} />,
    );
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByRole("status")).toHaveTextContent("has been booked.");

    fireEvent.click(screen.getByRole("button", { name: /^Cancel this session/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Yes, cancel session" }));
    });
    expect(cancelAction).toHaveBeenCalledWith("b1");

    // The server refresh no longer lists the session (and drops the booked message).
    rerender(<SessionsView sessions={[]} cancelAction={cancelAction} bookedMessage={null} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Your session on Tuesday, March 5, 2030 at 10:00 AM has been cancelled.",
    );
  });
});
