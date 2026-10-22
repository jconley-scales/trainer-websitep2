import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AboutPage, { metadata as aboutMeta } from "@/app/(marketing)/about/page";
import ContactPage, { metadata as contactMeta } from "@/app/(marketing)/contact/page";
import HomePage from "@/app/(marketing)/page";
import ServicesPage, { metadata as servicesMeta } from "@/app/(marketing)/services/page";
import TestimonialsPage, { metadata as testimonialsMeta } from "@/app/(marketing)/testimonials/page";
import { buildMailto, composeContactBody } from "@/lib/contact";
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
    ["services", ServicesPage, servicesMeta, "Services and pricing"],
    ["testimonials", TestimonialsPage, testimonialsMeta, "Kind words from clients"],
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

  it("services lists every service with its description", () => {
    const doc = render(<ServicesPage />);
    for (const s of SITE.services) {
      expect(doc.body.textContent).toContain(s.title);
      expect(doc.body.textContent).toContain(s.blurb);
      expect(doc.body.textContent).toContain(s.price);
    }
    expect(doc.querySelector('a[href="/contact"]')).not.toBeNull();
  });

  it("testimonials shows every quote and about shows the whole bio", () => {
    const t = render(<TestimonialsPage />);
    for (const q of SITE.testimonials) expect(t.body.textContent).toContain(q.quote);
    const a = render(<AboutPage />);
    for (const p of SITE.about) expect(a.body.textContent).toContain(p);
    expect(a.body.textContent).toContain(SITE.philosophy);
  });

  it("contact has real mailto and tel links", () => {
    const doc = render(<ContactPage />);
    expect(doc.querySelector(`a[href^="mailto:${SITE.email}"]`)).not.toBeNull();
    expect(doc.querySelector(`a[href="tel:${SITE.phoneHref}"]`)).not.toBeNull();
    expect(doc.querySelector("form")).not.toBeNull();
  });
});

describe("home page", () => {
  it("is a landing page: one h1, previews that link to each dedicated page", () => {
    const doc = render(<HomePage />);
    expect(doc.querySelectorAll("h1")).toHaveLength(1);
    for (const href of ["/services", "/about", "/testimonials", "/contact"]) {
      expect(doc.querySelector(`a[href="${href}"]`), href).not.toBeNull();
    }
    // Previews, not the full content.
    expect(doc.querySelectorAll(".testimonial-card")).toHaveLength(2);
    expect(doc.body.textContent).not.toContain(SITE.philosophy);
    expect(doc.body.textContent).not.toContain(SITE.services[0].blurb);
  });
});

describe("navigation links", () => {
  it("point at real routes, not anchors", () => {
    expect(NAV_LINKS.map((l) => l.href)).toEqual(["/", "/about", "/services", "/testimonials", "/contact"]);
  });
});

describe("mailto helpers", () => {
  it("builds an encoded mailto link", () => {
    const url = buildMailto({ to: "a@b.example", subject: "Free consultation", body: "Hi\r\nthere & you" });
    expect(url).toBe("mailto:a@b.example?subject=Free%20consultation&body=Hi%0D%0Athere%20%26%20you");
  });

  it("omits the body when there is none", () => {
    expect(buildMailto({ to: "a@b.example", subject: "Hello" })).toBe("mailto:a@b.example?subject=Hello");
  });

  it("composes a plain-text body with an optional phone line", () => {
    const body = composeContactBody({
      trainerFirstName: "Sarah",
      name: " Pat ",
      phone: "555 1234",
      message: " Hello there ",
    });
    expect(body).toBe("Hello Sarah,\r\n\r\nHello there\r\n\r\nKind regards,\r\nPat\r\nPhone: 555 1234");
    expect(composeContactBody({ trainerFirstName: "Sarah", name: "Pat", message: "Hi" })).not.toContain("Phone");
  });
});
