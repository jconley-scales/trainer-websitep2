"use client";

import { useEffect, useRef } from "react";

/**
 * A plain-language problem on the book screen (for example "that time was just
 * taken"). It is an alert, so screen readers announce it, and it takes focus when
 * it appears so a sighted keyboard user who was scrolled down the list is brought
 * to it too.
 */
export function BookNotice({ message }: { message: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <p ref={ref} role="alert" tabIndex={-1} className="error-message">
      {message}
    </p>
  );
}
