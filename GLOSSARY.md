# Peak Form Training bookings

A one-to-one personal trainer's booking system: visitors request sessions from the website, and the trainer confirms, cancels or adds them.

## Language

**Booking**:
One session at a set time with one client, whether requested on the website or added by the trainer.
_Avoid_: Appointment, slot (a slot is an open time on the public schedule, not a booking)

**Booking request**:
A website booking the trainer has not yet confirmed or cancelled.
_Avoid_: Pending booking

**Website booking**:
A booking a visitor requested on the public booking page; it always has an email.

**Admin booking**:
A booking the trainer added themself for a client who arranged it by phone or message; it is confirmed from the start, and email is optional.
_Avoid_: Manual booking, phone booking

**Source**:
Where a booking came from: the website or the trainer (admin).
_Avoid_: Origin, channel

**Live booking**:
A booking that has not been cancelled.

**Move**:
Change a booking's time (its start or length). Moving a booking request also confirms it.
_Avoid_: Reschedule

**Edited**:
A booking whose details or time the trainer has changed since it was made; only the time of the last edit is kept.
