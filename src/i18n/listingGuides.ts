import en from "./listing-guides/en.json";
import fr from "./listing-guides/fr.json";
import de from "./listing-guides/de.json";
import nl from "./listing-guides/nl.json";
import pl from "./listing-guides/pl.json";
import es from "./listing-guides/es.json";
import it from "./listing-guides/it.json";
import pt from "./listing-guides/pt.json";
import type { SiteLocale } from "./site.js";

export const LISTING_GUIDE_SLUGS = [
  "vinted-description-template",
  "vinted-listing-checklist",
  "vinted-photo-to-listing",
] as const;

export type ListingGuideSlug = (typeof LISTING_GUIDE_SLUGS)[number];

export type ListingGuidePage = {
  title: string;
  description: string;
  heading: string;
  answer: string;
  sections: { heading: string; body: string }[];
  examples: { label: string; text: string }[];
  checks: string[];
  faq: { question: string; answer: string }[];
};

type ListingGuideCopy = {
  ui: typeof en.ui;
  pages: Record<ListingGuideSlug, ListingGuidePage>;
};

export const LISTING_GUIDE_COPY: Record<SiteLocale, ListingGuideCopy> = {
  en,
  fr,
  de,
  nl,
  pl,
  es,
  it,
  pt,
};
