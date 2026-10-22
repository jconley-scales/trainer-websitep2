import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Booking domain logic: the book / cancel rules.
 *
 * `db` is a Supabase client. Callers must pass the AUTHENTICATED server client
 * (not the service-role client) so row level security applies: a client can
 * only read/insert/update their own bookings. The partial unique index
 * `uniq_active_booking_per_slot` is the authoritative double-booking guard;
 * the pre-checks here only exist to return friendlier reasons.
 *
 * `now` is injected so every rule is deterministic. "Future" is strictly
 * `starts_at > now`: a slot starting exactly at `now` has started.
 */

export type Slot = {
  id: string;
  starts_at: string;
  ends_at: string;
  trainer_id: string;
  location: string | null;
  created_at: string;
};

export type Booking = {
  id: string;
  slot_id: string;
  client_id: string;
  status: "booked" | "cancelled";
  created_at: string;
  cancelled_at: string | null;
};

/** A client's upcoming booked session: the booking id plus its slot's details. */
export type Session = {
  /** Booking id (what you pass to `cancelBooking`). */
  id: string;
  slot_id: string;
  starts_at: string;
  ends_at: string;
  trainer_id: string;
  location: string | null;
};

export type BookResult =
  | { ok: true; booking: Booking }
  | { ok: false; reason: "past" | "taken" | "already-booked" | "not-found" };

export type CancelResult =
  | { ok: true }
  | { ok: false; reason: "started" | "not-found" | "already-cancelled" };

const UNIQUE_VIOLATION = "23505";

type SlotEmbed = Pick<
  Slot,
  "id" | "starts_at" | "ends_at" | "trainer_id" | "location"
>;

export async function listUpcomingSessions(
  db: SupabaseClient,
  clientId: string,
  now: Date,
): Promise<Session[]> {
  const { data, error } = await db
    .from("bookings")
    .select("id, slot:slots!inner(id, starts_at, ends_at, trainer_id, location)")
    .eq("client_id", clientId)
    .eq("status", "booked")
    .gt("slot.starts_at", now.toISOString())
    .overrideTypes<{ id: string; slot: SlotEmbed }[], { merge: false }>();
  if (error) throw error;

  return data
    .map(({ id, slot }) => ({
      id,
      slot_id: slot.id,
      starts_at: slot.starts_at,
      ends_at: slot.ends_at,
      trainer_id: slot.trainer_id,
      location: slot.location,
    }))
    .sort((x, y) => Date.parse(x.starts_at) - Date.parse(y.starts_at));
}

/**
 * Future slots nobody holds. Goes through the `available_slots` SECURITY
 * DEFINER function because RLS hides other clients' bookings from the caller.
 */
export async function listAvailableSlots(
  db: SupabaseClient,
  now: Date,
): Promise<Slot[]> {
  const { data, error } = await db.rpc("available_slots", {
    p_now: now.toISOString(),
  });
  if (error) throw error;
  return [...((data ?? []) as Slot[])].sort(
    (x, y) => Date.parse(x.starts_at) - Date.parse(y.starts_at),
  );
}

export async function bookSlot(
  db: SupabaseClient,
  clientId: string,
  slotId: string,
  now: Date,
): Promise<BookResult> {
  const { data: slot, error: slotError } = await db
    .from("slots")
    .select("id, starts_at")
    .eq("id", slotId)
    .maybeSingle();
  if (slotError) throw slotError;
  if (!slot) return { ok: false, reason: "not-found" };
  if (!(Date.parse(slot.starts_at) > now.getTime())) {
    return { ok: false, reason: "past" };
  }

  const { data: held, error: heldError } = await db
    .from("bookings")
    .select("id")
    .eq("slot_id", slotId)
    .eq("client_id", clientId)
    .eq("status", "booked")
    .limit(1);
  if (heldError) throw heldError;
  if (held.length > 0) return { ok: false, reason: "already-booked" };

  const { data: booking, error } = await db
    .from("bookings")
    .insert({ slot_id: slotId, client_id: clientId })
    .select("id, slot_id, client_id, status, created_at, cancelled_at")
    .single<Booking>();
  if (error) {
    // Someone else holds the slot (or won a concurrent race for it).
    if (error.code === UNIQUE_VIOLATION) return { ok: false, reason: "taken" };
    throw error;
  }
  return { ok: true, booking };
}

export async function cancelBooking(
  db: SupabaseClient,
  clientId: string,
  bookingId: string,
  now: Date,
): Promise<CancelResult> {
  const { data: booking, error } = await db
    .from("bookings")
    .select("id, status, slot:slots!inner(starts_at)")
    .eq("id", bookingId)
    .eq("client_id", clientId)
    .maybeSingle<{ id: string; status: string; slot: { starts_at: string } }>();
  if (error) throw error;
  if (!booking) return { ok: false, reason: "not-found" };
  if (booking.status === "cancelled") {
    return { ok: false, reason: "already-cancelled" };
  }
  if (!(Date.parse(booking.slot.starts_at) > now.getTime())) {
    return { ok: false, reason: "started" };
  }

  // Guarded on status so a concurrent cancel cannot be reported as success twice.
  const { data: updated, error: updateError } = await db
    .from("bookings")
    .update({ status: "cancelled", cancelled_at: now.toISOString() })
    .eq("id", bookingId)
    .eq("client_id", clientId)
    .eq("status", "booked")
    .select("id");
  if (updateError) throw updateError;
  if (updated.length === 0) return { ok: false, reason: "already-cancelled" };
  return { ok: true };
}
