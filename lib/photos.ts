import type { StaticImageData } from "next/image";
import dsc0085 from "@/public/images/dsc-0085.jpg";
import dsc0091 from "@/public/images/dsc-0091.jpg";
import dsc0105 from "@/public/images/dsc-0105.jpg";
import dsc0116 from "@/public/images/dsc-0116.jpg";
import dsc0651 from "@/public/images/dsc-0651.jpg";
import dsc0668 from "@/public/images/dsc-0668.jpg";
import dsc0684 from "@/public/images/dsc-0684.jpg";
import logo from "@/public/images/logo.png";

export type Photo = { src: StaticImageData; alt: string };

/** Site logo: a white line drawing of a flexed arm and a weight plate. */
export const LOGO = logo;

/** Home-page hero. */
export const HERO_PHOTO: Photo = {
  src: dsc0684,
  alt: "Jervaughn coaching a client through a resistance-band exercise in her home",
};

/** The trainer's portrait, used with the About sections. */
export const PORTRAIT: Photo = {
  src: dsc0085,
  alt: "Jervaughn Scales standing beside a client on a leg-press machine at the gym",
};

/** Everything else, shown in the home-page photo grid. */
export const GALLERY: readonly Photo[] = [
  {
    src: dsc0105,
    alt: "A client balancing on one leg with a training pole while Jervaughn watches closely",
  },
  {
    src: dsc0116,
    alt: "Jervaughn guiding a client through a leg exercise on a stability ball",
  },
  {
    src: dsc0651,
    alt: "Jervaughn supporting a client holding a plank on an exercise mat at home",
  },
  {
    src: dsc0668,
    alt: "A client lying on a mat pulling a resistance band that Jervaughn holds steady",
  },
  {
    src: dsc0091,
    alt: "Jervaughn helping a seated client with a hand-strength exercise in her kitchen",
  },
];
