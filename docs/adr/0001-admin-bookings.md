# Admin bookings skip the slot schedule and the per-email cap, and may have no email

The trainer arranges some sessions directly with clients by phone or text, often for clients who don't use email, and at times the public schedule doesn't offer (a closed day, 10:15, 45 minutes). So an **admin booking** can be any future quarter-hour time and length, is saved as confirmed, may leave email out, and is not counted against the 3-live-requests-per-email cap. Those rules exist to protect the public form from bots and floods, and an admin booking can only be added by a signed-in admin, so row level security, not the schedule or the cap, is the guard. Email stays required for **website** bookings, enforced by the database, because it is how a visitor is reached.

## Consequences

- Each row records its **source** (`website` / `admin`), and the database rules (email required, the cap, who may insert) key off it.
- With no slot grid to line up against, two admin bookings can overlap. An exact start-time clash is still blocked by the one-live-booking-per-time index; an overlap only warns, and the trainer may save anyway.
- A booking with no email gets no confirmation or cancellation email: the trainer tells the client themself.
- The public calendar hides a slot only when a live booking starts at exactly that time, so an admin booking at an off-schedule time (e.g. 9:45) does not hide the overlapping public slot (9:30).
