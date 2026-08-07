export const BLOG_LOCALES = ["en", "fr", "de", "nl"] as const;
export const LOCALIZED_BLOG_LOCALES = ["fr", "de", "nl"] as const;
export const BLOG_CATEGORIES = [
  "selling-tips",
  "marketplace-guide",
  "tool-comparison",
  "pricing-strategy",
  "success-stories",
] as const;

export type BlogLocale = (typeof BLOG_LOCALES)[number];
export type BlogCategory = (typeof BLOG_CATEGORIES)[number];

export type BlogCopy = {
  seoTitle: string;
  seoDescription: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  allPosts: string;
  readMore: string;
  minutesRead: string;
  published: string;
  updated: string;
  tableOfContents: string;
  relatedPosts: string;
  backToBlog: string;
  share: string;
  copyLink: string;
  copied: string;
  latestTitle: string;
  latestSubtitle: string;
  viewAll: string;
  categories: Record<BlogCategory, string>;
};

export const BLOG_COPY: Record<BlogLocale, BlogCopy> = {
  en: {
    seoTitle: "Vinted Seller Blog - AutoLister AI",
    seoDescription:
      "Practical guides for writing clearer Vinted listings and reviewing AI-generated drafts.",
    eyebrow: "Vinted listing guides",
    title: "The Vinted Listing Guide",
    subtitle:
      "Practical guides for Vinted sellers and resellers who want faster listings, better buyer trust, and more control over every draft.",
    allPosts: "All posts",
    readMore: "Read guide",
    minutesRead: "min read",
    published: "Published",
    updated: "Updated",
    tableOfContents: "In this guide",
    relatedPosts: "Related guides",
    backToBlog: "Back to blog",
    share: "Share this guide",
    copyLink: "Copy link",
    copied: "Copied",
    latestTitle: "From the Blog",
    latestSubtitle:
      "Guides for writing clearer Vinted listings and reviewing AI-generated drafts.",
    viewAll: "View all guides",
    categories: {
      "selling-tips": "Selling Tips",
      "marketplace-guide": "Marketplace Guide",
      "tool-comparison": "Tool Comparison",
      "pricing-strategy": "Pricing Strategy",
      "success-stories": "Success Stories",
    },
  },
  fr: {
    seoTitle: "Blog vendeurs Vinted - AutoLister AI",
    seoDescription:
      "Conseils pratiques pour rédiger des annonces Vinted plus claires et vérifier les brouillons générés par IA.",
    eyebrow: "Guides d’annonces Vinted",
    title: "Le guide des annonces Vinted",
    subtitle:
      "Des guides concrets pour créer de meilleures annonces, gagner la confiance des acheteurs et garder le contrôle de chaque brouillon.",
    allPosts: "Tous les articles",
    readMore: "Lire le guide",
    minutesRead: "min de lecture",
    published: "Publié",
    updated: "Mis à jour",
    tableOfContents: "Dans ce guide",
    relatedPosts: "Guides associés",
    backToBlog: "Retour au blog",
    share: "Partager ce guide",
    copyLink: "Copier le lien",
    copied: "Copié",
    latestTitle: "Depuis le blog",
    latestSubtitle:
      "Guides pour rédiger des annonces Vinted plus claires et vérifier les brouillons générés par IA.",
    viewAll: "Voir tous les guides",
    categories: {
      "selling-tips": "Conseils de vente",
      "marketplace-guide": "Guide marketplace",
      "tool-comparison": "Comparatifs d'outils",
      "pricing-strategy": "Stratégie de prix",
      "success-stories": "Success stories",
    },
  },
  de: {
    seoTitle: "Vinted Verkäufer-Blog - AutoLister AI",
    seoDescription:
      "Praktische Guides für klarere Vinted-Listings und das Prüfen von KI-Entwürfen.",
    eyebrow: "Vinted-Listing-Guides",
    title: "Der Vinted-Listing-Guide",
    subtitle:
      "Konkrete Guides für bessere Vinted-Listings, mehr Vertrauen bei Käufern und volle Kontrolle über jeden Entwurf.",
    allPosts: "Alle Beiträge",
    readMore: "Guide lesen",
    minutesRead: "Min. Lesezeit",
    published: "Veröffentlicht",
    updated: "Aktualisiert",
    tableOfContents: "In diesem Guide",
    relatedPosts: "Ähnliche Guides",
    backToBlog: "Zurück zum Blog",
    share: "Guide teilen",
    copyLink: "Link kopieren",
    copied: "Kopiert",
    latestTitle: "Aus dem Blog",
    latestSubtitle:
      "Guides für klarere Vinted-Listings und das Prüfen von KI-Entwürfen.",
    viewAll: "Alle Guides ansehen",
    categories: {
      "selling-tips": "Verkaufstipps",
      "marketplace-guide": "Marketplace Guide",
      "tool-comparison": "Tool-Vergleich",
      "pricing-strategy": "Preisstrategie",
      "success-stories": "Erfolgsgeschichten",
    },
  },
  nl: {
    seoTitle: "Vinted verkopersblog - AutoLister AI",
    seoDescription:
      "Praktische gidsen voor duidelijkere Vinted-advertenties en het controleren van AI-concepten.",
    eyebrow: "Vinted-advertentiegidsen",
    title: "De Vinted-advertentiegids",
    subtitle:
      "Concrete gidsen voor betere Vinted-advertenties, meer vertrouwen van kopers en controle over elk concept.",
    allPosts: "Alle artikelen",
    readMore: "Lees gids",
    minutesRead: "min leestijd",
    published: "Gepubliceerd",
    updated: "Bijgewerkt",
    tableOfContents: "In deze gids",
    relatedPosts: "Gerelateerde gidsen",
    backToBlog: "Terug naar blog",
    share: "Deel deze gids",
    copyLink: "Link kopiëren",
    copied: "Gekopieerd",
    latestTitle: "Uit de blog",
    latestSubtitle:
      "Gidsen voor duidelijkere Vinted-advertenties en het controleren van AI-concepten.",
    viewAll: "Bekijk alle gidsen",
    categories: {
      "selling-tips": "Verkooptips",
      "marketplace-guide": "Marketplace gids",
      "tool-comparison": "Toolvergelijking",
      "pricing-strategy": "Prijsstrategie",
      "success-stories": "Succesverhalen",
    },
  },
};

export function normalizeBlogLocale(locale?: string | null): BlogLocale {
  const base = (locale || "en").toLowerCase().split(/[-_]/)[0] as BlogLocale;
  return BLOG_LOCALES.includes(base) ? base : "en";
}

export function blogPath(locale: BlogLocale, path = ""): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const normalizedPath = cleanPath === "/" ? "" : cleanPath.replace(/\/$/, "");
  return locale === "en"
    ? `/blog${normalizedPath}`
    : `/${locale}/blog${normalizedPath}`;
}
