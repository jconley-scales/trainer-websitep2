"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import type { Photo } from "@/lib/photos";
import { sectionClass, type SectionProps } from "./types";

/**
 * Home-page photo grid. Each photo is a button that opens it larger in a modal
 * <dialog>: the browser handles focus, Escape and the inert page behind it.
 * Without JavaScript the grid still shows every photo.
 */
export function PhotoGallery({
  photos,
  tone = "default",
}: {
  photos: readonly Photo[];
  tone?: SectionProps["tone"];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState<Photo | null>(null);

  function show(photo: Photo) {
    setOpen(photo);
    dialogRef.current?.showModal();
  }

  function close() {
    dialogRef.current?.close();
  }

  return (
    <section className={sectionClass(tone)} aria-labelledby="gallery-title">
      <div className="wrap">
        <h2 id="gallery-title" className="section-title">
          Training in action
        </h2>
        <p className="section-intro">
          At the gym or at home. Tap a photo to see it larger.
        </p>
        <ul className="gallery-grid">
          {photos.map((photo) => (
            <li key={photo.src.src}>
              <button
                type="button"
                className="gallery-button"
                onClick={() => show(photo)}
                aria-label={`View larger: ${photo.alt}`}
              >
                <Image
                  className="gallery-photo"
                  src={photo.src}
                  alt=""
                  sizes="(max-width: 40rem) 50vw, (max-width: 70rem) 33vw, 22rem"
                />
              </button>
            </li>
          ))}
        </ul>
      </div>
      <dialog
        ref={dialogRef}
        className="lightbox"
        aria-label={open?.alt ?? "Photo"}
        onClose={() => setOpen(null)}
        // A click on the backdrop lands on the dialog itself, not its contents.
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        {open ? (
          <div className="lightbox-inner">
            <Image
              className="lightbox-photo"
              src={open.src}
              alt={open.alt}
              sizes="(max-width: 60rem) 100vw, 60rem"
            />
            <button type="button" className="button--accent lightbox-close" onClick={close} autoFocus>
              Close photo
            </button>
          </div>
        ) : null}
      </dialog>
    </section>
  );
}
