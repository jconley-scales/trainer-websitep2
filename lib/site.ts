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
  philosophy:
    "Small, steady steps beat big, risky leaps. You will always know what we are doing and why, and you are always in charge of how hard we push.",
  services: [
    {
      title: "One-to-one training",
      blurb:
        "A private hour with me, planned around your body, your goals and your pace. Strength, balance and mobility, all with clear, patient coaching.",
      price: "From $70 per session",
    },
    {
      title: "Starter programme",
      blurb:
        "New to exercise? Six sessions to learn the basics safely, build confidence and leave you with a simple routine you can keep up.",
      price: "From $390 for six sessions",
    },
    {
      title: "Small-group sessions",
      blurb:
        "Train with two or three friendly faces at a similar level. Good company, shared encouragement and a lower price per person.",
      price: "From $35 per person",
    },
  ],
  testimonials: [
    {
      quote:
        "I hadn't exercised in twenty years and was nervous. Sarah made it feel easy and safe. I can now carry my shopping and climb stairs without puffing.",
      name: "Margaret R.",
      descriptor: "Client, age 67",
    },
    {
      quote:
        "Patient, kind and really knowledgeable. She adjusted everything around my sore knee, and my balance is so much better.",
      name: "David L.",
      descriptor: "Client, age 61",
    },
    {
      quote:
        "I never thought I would look forward to a workout. The booking is simple and every session leaves me feeling stronger.",
      name: "Priya S.",
      descriptor: "Client, age 54",
    },
  ],
} as const;

export const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "#about", label: "About" },
  { href: "#services", label: "Services" },
  { href: "#testimonials", label: "Testimonials" },
  { href: "#contact", label: "Contact" },
] as const;
