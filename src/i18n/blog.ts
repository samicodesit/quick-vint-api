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
  categorySeoDescriptionSuffix: string;
  categories: Record<BlogCategory, string>;
};

export const BLOG_COPY: Record<BlogLocale, BlogCopy> = {
  en: {
    seoTitle: "Online Selling Blog - AutoLister AI",
    seoDescription:
      "Practical guides for creating clearer listings, reviewing AI-generated drafts, and selling with more confidence across marketplaces.",
    eyebrow: "Online selling guides",
    title: "The Online Selling Guide",
    subtitle:
      "Practical guides for sellers and resellers who want faster listing workflows, stronger buyer trust, and more control over every draft.",
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
      "Guides for clearer listings, better workflows, and reviewing AI-generated drafts.",
    viewAll: "View all guides",
    categorySeoDescriptionSuffix:
      "guides for online sellers and resellers from AutoLister AI.",
    categories: {
      "selling-tips": "Selling Tips",
      "marketplace-guide": "Marketplace Guide",
      "tool-comparison": "Tool Comparison",
      "pricing-strategy": "Pricing Strategy",
      "success-stories": "Success Stories",
    },
  },
  fr: {
    seoTitle: "Blog vente en ligne - AutoLister AI",
    seoDescription:
      "Conseils pratiques pour créer des annonces plus claires, vérifier les brouillons générés par IA et vendre avec plus de confiance sur les marketplaces.",
    eyebrow: "Guides de vente en ligne",
    title: "Le guide de la vente en ligne",
    subtitle:
      "Des guides concrets pour les vendeurs et revendeurs qui veulent publier plus vite, inspirer confiance et garder le contrôle de chaque brouillon.",
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
      "Guides pour créer des annonces plus claires, améliorer vos méthodes et vérifier les brouillons générés par IA.",
    viewAll: "Voir tous les guides",
    categorySeoDescriptionSuffix:
      "pour vendeurs et revendeurs en ligne par AutoLister AI.",
    categories: {
      "selling-tips": "Conseils de vente",
      "marketplace-guide": "Guide marketplace",
      "tool-comparison": "Comparatifs d'outils",
      "pricing-strategy": "Stratégie de prix",
      "success-stories": "Success stories",
    },
  },
  de: {
    seoTitle: "Online-Verkaufsblog - AutoLister AI",
    seoDescription:
      "Praktische Guides für klarere Listings, das Prüfen von KI-Entwürfen und mehr Sicherheit beim Verkaufen auf Marktplätzen.",
    eyebrow: "Guides für Online-Verkauf",
    title: "Der Guide für Online-Verkauf",
    subtitle:
      "Konkrete Guides für Verkäufer und Reseller, die schneller listen, mehr Vertrauen schaffen und jeden Entwurf kontrollieren möchten.",
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
      "Guides für klarere Listings, bessere Abläufe und das Prüfen von KI-Entwürfen.",
    viewAll: "Alle Guides ansehen",
    categorySeoDescriptionSuffix:
      "für Online-Verkäufer und Reseller von AutoLister AI.",
    categories: {
      "selling-tips": "Verkaufstipps",
      "marketplace-guide": "Marketplace Guide",
      "tool-comparison": "Tool-Vergleich",
      "pricing-strategy": "Preisstrategie",
      "success-stories": "Erfolgsgeschichten",
    },
  },
  nl: {
    seoTitle: "Online verkoopblog - AutoLister AI",
    seoDescription:
      "Praktische gidsen voor duidelijkere advertenties, het controleren van AI-concepten en met meer vertrouwen verkopen op marketplaces.",
    eyebrow: "Gidsen voor online verkoop",
    title: "De gids voor online verkoop",
    subtitle:
      "Concrete gidsen voor verkopers en resellers die sneller willen plaatsen, meer vertrouwen willen wekken en elk concept willen controleren.",
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
      "Gidsen voor duidelijkere advertenties, betere workflows en het controleren van AI-concepten.",
    viewAll: "Bekijk alle gidsen",
    categorySeoDescriptionSuffix:
      "voor online verkopers en resellers van AutoLister AI.",
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
