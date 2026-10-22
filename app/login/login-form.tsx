"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { sendCode, verifyCode } from "./actions";

type Step = "email" | "code";

export function LoginForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  // Move keyboard/screen reader focus to the new step when it appears.
  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
    else if (headingRef.current && email) headingRef.current.focus();
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSendCode(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await sendCode(email);
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
      const result = await sendCode(email);
      if (result.ok) {
        setCode("");
        setNotice("We sent you a new code. Please use the newest email.");
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
      const result = await verifyCode(email, code);
      if (result.ok) {
        router.replace("/sessions");
        router.refresh();
      } else {
        setError(result.error);
        codeRef.current?.focus();
      }
    });
  }

  function useDifferentEmail() {
    setError(null);
    setNotice(null);
    setCode("");
    setStep("email");
  }

  return (
    <div className="login">
      <h1 ref={headingRef} tabIndex={-1}>
        {step === "email" ? "Sign in" : "Check your email"}
      </h1>

      {step === "email" ? (
        <form onSubmit={handleSendCode} className="stack" noValidate>
          <p>
            Enter your email address and we will email you a short code. There
            is no password to remember.
          </p>
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
              aria-describedby={error ? "login-error" : undefined}
            />
          </div>
          {error && (
            <p id="login-error" role="alert" className="error-message">
              {error}
            </p>
          )}
          <button type="submit" disabled={pending}>
            {pending ? "Sending..." : "Email me a code"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerify} className="stack" noValidate>
          <p>
            We sent a code to <strong>{email.trim()}</strong>. It can take a
            minute to arrive. Please also check your spam folder.
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
              aria-describedby={error ? "login-error" : undefined}
            />
          </div>
          {error && (
            <p id="login-error" role="alert" className="error-message">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="notice-message">
              {notice}
            </p>
          )}
          <button type="submit" disabled={pending}>
            {pending ? "Checking..." : "Sign in"}
          </button>
          <div className="button-row">
            <button
              type="button"
              className="button-secondary"
              onClick={handleResend}
              disabled={pending}
            >
              Resend code
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={useDifferentEmail}
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
