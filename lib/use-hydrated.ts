"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False while the server renders and during hydration, true once the page is
 * interactive. Forms use it to keep their submit button disabled until React
 * handles the submit: before that the browser would submit natively, and a GET
 * would put what was typed (an email address, a message) in the URL and history.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
