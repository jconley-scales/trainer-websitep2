/**
 * Public-site content. Everything here is PLACEHOLDER copy: the real trainer
 * replaces these values (and nothing else needs to change).
 */
export const SITE = {
  name: "Peak Form Training",
  trainer: "Sarah Thompson",
  trainerFirstName: "Sarah",
  initials: "ST",
  copyrightYear: 2026,
  tagline: "Friendly, personal training that meets you where you are.",
  description:
    "Personal training for beginners and for adults 50 and over. Gentle, safe, one-to-one coaching with a certified trainer.",
  credentials: "NASM-Certified Personal Trainer · 12 years' experience",
  email: "hello@peakformtraining.example",
  phone: "(555) 010-0123",
  phoneHref: "+15550100123",
  about: [
    "I started Peak Form Training because I believe it is never too late to feel strong. Most of my clients are new to exercise, or coming back to it after a long break, an injury or a busy few decades.",
    "Every session is one-to-one and paced for you. We begin with a relaxed chat about your health, your goals and anything you are worried about, and we build from there, one comfortable step at a time.",
  ],
  contactIntro:
    "Your first consultation is free. Tell me a little about yourself and what you would like to achieve, and there is no obligation at all.",
  philosophy:
    "Small, steady steps beat big, risky leaps. You will always know what we are doing and why, and you are always in charge of how hard we push.",
} as const;

export const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
] as const;
