"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { bookSlot, cancelBooking } from "@/lib/booking";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Cancel one of the signed-in client's upcoming sessions.
 *
 * Server Actions are reachable by direct POST, so this re-checks who is calling
 * instead of trusting the page. It uses the AUTHENTICATED client (never the admin
 * client), so row level security also limits the update to the caller's own
 * bookings. A booking that cannot be cancelled (already cancelled, already
 * started, not theirs) is a no-op; either way the list is refreshed so the screen
 * shows the truth.
 */
export async function cancelBookingAction(bookingId: string): Promise<void> {
  const db = await createClient();
  // getUser() verifies the token with Supabase Auth (getSession() would trust the cookie).
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");

  if (typeof bookingId === "string" && UUID.test(bookingId)) {
    await cancelBooking(db, user.id, bookingId, new Date());
  }

  revalidatePath("/sessions");
}

/**
 * Book an open slot for the signed-in client.
 *
 * Like the cancel action it re-checks who is calling and uses the AUTHENTICATED
 * client, so row level security limits what the insert can touch. The outcome is
 * carried to the next screen in the URL (a Server Action's redirect is a normal
 * client-side navigation):
 *  - booked  -> /sessions?booked=<slot id>; the sessions screen announces it only
 *               once the session really shows in the list.
 *  - refused -> /book?error=<reason> (taken, past, already-booked, not-found); the
 *               book screen maps the reason to a plain-language message.
 * Unexpected failures (e.g. the database is down) throw, so the confirm dialog
 * can tell the client it did not work instead of claiming anything.
 */
export async function bookSlotAction(slotId: string): Promise<void> {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");

  const result =
    typeof slotId === "string" && UUID.test(slotId)
      ? await bookSlot(db, user.id, slotId, new Date())
      : ({ ok: false, reason: "not-found" } as const);

  revalidatePath("/sessions");
  revalidatePath("/book");
  if (result.ok) redirect(`/sessions?booked=${encodeURIComponent(slotId)}`);
  redirect(`/book?error=${result.reason}`);
}
