import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AboutPage, { metadata as aboutMeta } from "@/app/(marketing)/about/page";
import BookPage from "@/app/(marketing)/book/page";
import ContactPage, { metadata as contactMeta } from "@/app/(marketing)/contact/page";
import HomePage from "@/app/(marketing)/page";
import PricingPage, { metadata as pricingMeta } from "@/app/(marketing)/pricing/page";
import PrivacyPage, { metadata as privacyMeta } from "@/app/(marketing)/privacy/page";
import TestimonialsPage, { metadata as testimonialsMeta } from "@/app/(marketing)/testimonials/page";
import { SiteFooter } from "@/components/SiteFooter";
import { formatUsd } from "@/lib/format";
import { GALLERY } from "@/lib/photos";
import { NAV_LINKS, SITE } from "@/lib/site";

function render(node: React.ReactNode) {
  return new DOMParser().parseFromString(
    `<body>${renderToStaticMarkup(node)}</body>`,
    "text/html",
  );
}

describe("dedicated public pages", () => {
  const pages = [
    ["about", AboutPage, aboutMeta, `About ${SITE.trainerFirstName}`],
    ["pricing", PricingPage, pricingMeta, "Session prices"],
    ["testimonials", TestimonialsPage, testimonialsMeta, "What clients say"],
    ["contact", ContactPage, contactMeta, "Get in touch"],
    ["privacy", PrivacyPage, privacyMeta, "Your privacy"],
  ] as const;

  it.each(pages)("%s renders exactly one h1 and exports metadata", (_name, Page, meta, h1) => {
    const doc = render(<Page />);
    const headings = doc.querySelectorAll("h1");
    expect(headings).toHaveLength(1);
    expect(headings[0].textContent).toBe(h1);
    expect(meta.title).toBeTruthy();
    expect(meta.description).toBeTruthy();
  });

  it("about shows the whole bio, the philosophy, every certification and a real photo", () => {
    const a = render(<AboutPage />);
    for (const p of SITE.about) expect(a.body.textContent).toContain(p);
    expect(a.body.textContent).toContain(SITE.philosophy);
    const certs = [...a.querySelectorAll(".cert-list li")].map((li) => li.textContent);
    expect(certs).toEqual([...SITE.certifications]);
    expect(certs).toHaveLength(6);
    expect(certs[0]).toBe("ACE Senior Fitness Specialist");
    expect(certs.at(-1)).toBe("Certified INSANITY Instructor");
    expect(a.querySelector("img.about-photo")?.getAttribute("alt")).toBeTruthy();
  });

  it("pricing shows each labelled group with every package, its per-session cost and the assessment note", () => {
    const doc = render(<PricingPage />);
    const text = doc.body.textContent ?? "";
    expect(text).toContain(SITE.assessmentNote);
    const groups = [...doc.querySelectorAll(".price-group")];
    expect(groups).toHaveLength(SITE.pricing.length);
    SITE.pricing.forEach((group, i) => {
      const el = groups[i];
      expect(el.querySelector(".price-group-title")?.textContent).toBe(group.title);
      expect(el.querySelectorAll(".price-card")).toHaveLength(group.prices.length);
      const groupText = el.textContent ?? "";
      for (const { sessions, total } of group.prices) {
        expect(groupText).toContain(formatUsd(total));
        if (sessions > 1) expect(groupText).toContain(`${formatUsd(total / sessions)} per session`);
      }
      if (group.firstSession !== undefined) {
        expect(groupText).toContain(`First session ${formatUsd(group.firstSession)}`);
      }
    });
    expect(text).toContain("1-on-1 training");
    expect(text).toContain("Partner training");
    expect(text).toContain("First session $85");
  });

  it("testimonials shows every quote in full with the client's name", () => {
    const doc = render(<TestimonialsPage />);
    expect(doc.querySelectorAll(".testimonial-card")).toHaveLength(SITE.testimonials.length);
    for (const t of SITE.testimonials) {
      for (const p of t.quote) expect(doc.body.textContent).toContain(p);
      expect(doc.body.textContent).toContain(t.name);
    }
  });

  it("contact publishes no email or phone and has a message form with an email field", () => {
    const doc = render(<ContactPage />);
    expect(doc.querySelector('a[href^="mailto:"], a[href^="tel:"]')).toBeNull();
    expect(doc.querySelector("form")).not.toBeNull();
    expect(doc.querySelector('input[type="email"]')).not.toBeNull();
  });

  it("contact links to the privacy page from inside the form", () => {
    const doc = render(<ContactPage />);
    const link = doc.querySelector('form a[href="/privacy"]');
    expect(link?.textContent).toBe(SITE.privacy.linkLabel);
  });

  it("privacy explains what is collected, who sees it, how long it is kept and how to get it deleted", () => {
    const doc = render(<PrivacyPage />);
    const text = doc.body.textContent!.replace(/\s+/g, " ");
    // What is collected, and why.
    for (const item of ["name", "email", "phone", "note", "message"]) expect(text).toContain(item);
    expect(text).toMatch(/arrange and confirm (your )?sessions/);
    // Who it is shared with, and never sold.
    for (const company of ["Supabase", "Vercel", "Gmail"]) expect(text).toContain(company);
    expect(text).toMatch(/never sell/i);
    // How long it is kept, and how to see or delete it.
    expect(doc.querySelector("h2#privacy-keeping")?.textContent).toBeTruthy();
    // Bookings arranged by phone or message are recorded too, and kept as long.
    expect(doc.querySelector("#privacy-keeping")?.closest(".privacy-section")?.textContent).toMatch(
      /arrange a session by phone or message, I may record it here too, and it is kept for the same two years/,
    );
    expect(text).toMatch(/see or delete/i);
    expect(doc.querySelector('main a[href="/contact"], section a[href="/contact"]')).not.toBeNull();
    // Health details are optional.
    expect(text).toMatch(/health details/i);
    expect(text).toMatch(/optional/i);
  });

  it("booking shows the per-session price range and links to pricing", () => {
    const doc = render(<BookPage />);
    const note = doc.querySelector(".booking-price-note");
    expect(note?.textContent).toContain("1-on-1 training $70 to $85 each");
    expect(note?.textContent).toContain("partner training $75 to $120 each");
    expect(note?.querySelector('a[href="/pricing"]')).not.toBeNull();
  });

  it.each([
    ["booking", BookPage],
    ["contact", ContactPage],
    ["pricing", PricingPage],
  ] as const)("%s asks visitors to check with their doctor first", (_name, Page) => {
    const doc = render(<Page />);
    const notes = doc.querySelectorAll(".health-note");
    expect(notes).toHaveLength(1);
    expect(notes[0].textContent).toBe(SITE.healthNote);
    expect(SITE.healthNote).toMatch(/doctor/);
  });

  it("booking reassures visitors with the trainer's certifying bodies", () => {
    const doc = render(<BookPage />);
    expect(doc.querySelector(".booking-certs")?.textContent).toBe("Certified by ACE & NASM");
  });
});

describe("home page", () => {
  it("is a landing page: one h1, previews that link to each dedicated page", () => {
    const doc = render(<HomePage />);
    expect(doc.querySelectorAll("h1")).toHaveLength(1);
    for (const href of ["/about", "/pricing", "/testimonials", "/contact"]) {
      expect(doc.querySelector(`a[href="${href}"]`), href).not.toBeNull();
    }
    // A short about-me, not the full bio.
    expect(doc.body.textContent).toContain(SITE.about[0]);
    expect(doc.body.textContent).not.toContain(SITE.about[2]);
    expect(doc.body.textContent).not.toContain(SITE.philosophy);
    // Every package price and the assessment note.
    for (const { total } of SITE.pricing.flatMap((g) => g.prices)) {
      expect(doc.body.textContent).toContain(formatUsd(total));
    }
    expect(doc.body.textContent).toContain(SITE.assessmentNote);
    // Every certification, under a subheading below the section's h2.
    const certs = [...doc.querySelectorAll(".cert-list li")].map((li) => li.textContent);
    expect(certs).toEqual([...SITE.certifications]);
    expect(doc.querySelector("h3.about-subtitle")?.textContent).toBe("Certifications");
    // Only the first testimonial.
    expect(doc.querySelectorAll(".testimonial-card")).toHaveLength(1);
  });

  it("shows every photo: hero, portrait and the whole gallery", () => {
    const doc = render(<HomePage />);
    expect(doc.querySelector("img.hero-photo")).not.toBeNull();
    expect(doc.querySelector("img.about-photo")).not.toBeNull();
    expect(doc.querySelectorAll(".gallery-button")).toHaveLength(GALLERY.length);
    for (const button of doc.querySelectorAll(".gallery-button")) {
      expect(button.getAttribute("aria-label")).toMatch(/^View larger: \S/);
    }
  });
});

describe("navigation links", () => {
  it("point at real routes, not anchors", () => {
    expect(NAV_LINKS.map((l) => l.href)).toEqual(["/", "/about", "/pricing", "/testimonials", "/contact"]);
  });
});

describe("footer", () => {
  it("links to the privacy page", () => {
    const doc = render(<SiteFooter />);
    const link = doc.querySelector('nav[aria-label="Footer"] a[href="/privacy"]');
    expect(link?.textContent).toBe("Privacy");
  });
});

describe("prices", () => {
  it("formats whole dollars without cents", () => {
    expect(formatUsd(85)).toBe("$85");
    expect(formatUsd(1050)).toBe("$1,050");
    expect(formatUsd(80)).toBe("$80");
  });

  it("shows both cent digits when there are cents", () => {
    expect(formatUsd(78.5)).toBe("$78.50");
    expect(formatUsd(230 / 3)).toBe("$76.67");
  });
});
