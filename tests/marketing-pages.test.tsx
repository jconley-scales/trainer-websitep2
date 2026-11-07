import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AboutPage, { metadata as aboutMeta } from "@/app/(marketing)/about/page";
import BookPage from "@/app/(marketing)/book/page";
import ContactPage, { metadata as contactMeta } from "@/app/(marketing)/contact/page";
import HomePage from "@/app/(marketing)/page";
import PricingPage, { metadata as pricingMeta } from "@/app/(marketing)/pricing/page";
import TestimonialsPage, { metadata as testimonialsMeta } from "@/app/(marketing)/testimonials/page";
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

  it("booking shows the per-session price range and links to pricing", () => {
    const doc = render(<BookPage />);
    const note = doc.querySelector(".booking-price-note");
    expect(note?.textContent).toContain("1-on-1 training $70 to $85 each");
    expect(note?.textContent).toContain("partner training $75 to $120 each");
    expect(note?.querySelector('a[href="/pricing"]')).not.toBeNull();
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
