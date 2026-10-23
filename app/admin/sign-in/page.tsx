import type { Metadata } from "next";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Trainer sign in" };

export default function AdminSignInPage() {
  return <SignInForm />;
}
