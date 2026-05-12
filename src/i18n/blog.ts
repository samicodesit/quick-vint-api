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
      "Actionable Vinted selling tips for faster listings, better descriptions, stronger search visibility, and safer growth with AutoLister AI.",
    eyebrow: "Vinted seller growth",
    title: "The Vinted Seller Playbook",
    subtitle:
      "Practical guides for Vinted sellers and resellers who want faster listings, better buyer trust, and more sales without risky automation bots.",
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
      "Guides for writing better Vinted listings, selling faster, and growing safely.",
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
      "Conseils pratiques pour vendre plus vite sur Vinted, améliorer vos descriptions, votre visibilité et votre organisation avec AutoLister AI.",
    eyebrow: "Croissance vendeurs Vinted",
    title: "Le guide des vendeurs Vinted",
    subtitle:
      "Des guides concrets pour créer de meilleures annonces, gagner la confiance des acheteurs et vendre plus vite sans bots risqués.",
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
      "Guides pour améliorer vos annonces Vinted, vendre plus vite et rester en sécurité.",
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
      "Praktische Tipps für Vinted-Verkäufer: bessere Beschreibungen, mehr Sichtbarkeit, schnellere Listings und sicheres Wachstum.",
    eyebrow: "Vinted Verkäufer-Wachstum",
    title: "Das Vinted Verkäufer-Handbuch",
    subtitle:
      "Konkrete Guides für bessere Vinted-Listings, mehr Vertrauen bei Käufern und schnelleres Verkaufen ohne riskante Bots.",
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
      "Guides für bessere Vinted-Listings, schnelleres Verkaufen und sicheres Wachstum.",
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
      "Praktische tips voor Vinted-verkopers: betere beschrijvingen, meer zichtbaarheid, snellere listings en veilig groeien.",
    eyebrow: "Vinted verkopersgroei",
    title: "Het Vinted verkoophandboek",
    subtitle:
      "Concrete gidsen voor betere Vinted-advertenties, meer vertrouwen van kopers en sneller verkopen zonder riskante bots.",
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
      "Gidsen voor betere Vinted-advertenties, sneller verkopen en veilig groeien.",
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
  return locale === "en" ? `/blog${normalizedPath}` : `/${locale}/blog${normalizedPath}`;
}
