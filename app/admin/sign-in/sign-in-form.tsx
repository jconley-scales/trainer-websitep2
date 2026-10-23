"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { useHydrated } from "@/lib/use-hydrated";
import { sendAdminCode, verifyAdminCode } from "../actions";

type Step = "email" | "code";

/**
 * Two steps, no password: email address, then the code we email you.
 * Both forms are `method="post"` with submit disabled until hydration, so a
 * click before the page is interactive never puts the email or code in the URL.
 */
export function SignInForm() {
  const router = useRouter();
  const hydrated = useHydrated();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const codeRef = useRef<HTMLInputElement>(null);

  // Move keyboard / screen reader focus to the code field when it appears.
  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  function handleSendCode(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await sendAdminCode(email);
      if (result.ok) {
        setCode("");
        setStep("code");
      } else {
        setError(result.error);
      }
    });
  }

  function handleResend() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await sendAdminCode(email);
      if (result.ok) {
        setCode("");
        setNotice("We sent a new code. Please use the newest email.");
        codeRef.current?.focus();
      } else {
        setError(result.error);
      }
    });
  }

  function handleVerify(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await verifyAdminCode(email, code);
      if (result.ok) {
        router.replace("/admin");
        router.refresh();
      } else {
        setError(result.error);
        codeRef.current?.focus();
      }
    });
  }

  return (
    <div className="login">
      <h1>{step === "email" ? "Trainer sign in" : "Check your email"}</h1>

      {step === "email" ? (
        <form method="post" action="#" onSubmit={handleSendCode} className="stack" noValidate>
          <p>Enter your trainer email address and we will email you a short code.</p>
          <div className="field">
            <label htmlFor="email">Your email address</label>
            <input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "signin-error" : undefined}
            />
          </div>
          {error && (
            <p id="signin-error" role="alert" className="error-message">
              {error}
            </p>
          )}
          <button type="submit" disabled={pending || !hydrated}>
            {pending ? "Sending..." : "Email me a code"}
          </button>
        </form>
      ) : (
        <form method="post" action="#" onSubmit={handleVerify} className="stack" noValidate>
          <p>
            If <strong>{email.trim()}</strong> is a trainer account, a code is on its way. It can
            take a minute to arrive; please also check your spam folder.
          </p>
          <div className="field">
            <label htmlFor="code">Code from your email</label>
            <input
              ref={codeRef}
              id="code"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]*"
              maxLength={12}
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "signin-error" : undefined}
            />
          </div>
          {error && (
            <p id="signin-error" role="alert" className="error-message">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="notice-message">
              {notice}
            </p>
          )}
          <button type="submit" disabled={pending || !hydrated}>
            {pending ? "Checking..." : "Sign in"}
          </button>
          <div className="button-row">
            <button type="button" className="button-secondary" onClick={handleResend} disabled={pending}>
              Resend code
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={() => {
                setError(null);
                setNotice(null);
                setCode("");
                setStep("email");
              }}
              disabled={pending}
            >
              Use a different email
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
