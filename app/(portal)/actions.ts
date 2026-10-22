"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cancelBooking } from "@/lib/booking";
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
