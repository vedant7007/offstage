import type { StaticImageData } from "next/image";
import c00 from "./posters/c00.jpg";
import c01 from "./posters/c01.jpg";
import c02 from "./posters/c02.jpg";
import c03 from "./posters/c03.jpg";
import c04 from "./posters/c04.jpg";
import c05 from "./posters/c05.jpg";
import c06 from "./posters/c06.jpg";
import c07 from "./posters/c07.jpg";
import c08 from "./posters/c08.jpg";
import c09 from "./posters/c09.jpg";
import c10 from "./posters/c10.jpg";

/**
 * One still per chapter for poster mode (reduced motion or no WebGL). Rendered from the film
 * by `node scripts/landing/film.mjs posters` and checked in next to this file.
 */
export const POSTERS: StaticImageData[] = [c00, c01, c02, c03, c04, c05, c06, c07, c08, c09, c10];
