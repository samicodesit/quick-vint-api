export const SUPPORTED_SITE_LOCALES = [
  "en",
  "fr",
  "de",
  "nl",
  "pl",
  "es",
  "it",
  "pt",
] as const;

export type SiteLocale = (typeof SUPPORTED_SITE_LOCALES)[number];

export const DEFAULT_SITE_LOCALE: SiteLocale = "en";

type NavCopy = {
  features: string;
  pricing: string;
  blog: string;
  support: string;
  contact: string;
  cta: string;
  switcherLabel: string;
  privacy: string;
  terms: string;
  copyright: string;
  independence: string;
};

type HomeCopy = {
  seoTitle: string;
  seoDescription: string;
  heroTitle: string;
  heroSubtitle: string;
  heroMobileSubtitle: string;
  heroBadgeSafe: string;
  heroBulletSafety: string;
};

type PricingCopy = {
  seoTitle: string;
  seoDescription: string;
  heading: string;
  headingAccent: string;
  subtitle: string;
  subtitleLine2: string;
};

export type SiteCopy = {
  languageName: string;
  nav: NavCopy;
  home: HomeCopy;
  pricing: PricingCopy;
};

export const SITE_COPY: Record<SiteLocale, SiteCopy> = {
  en: {
    languageName: "English",
    nav: {
      features: "Features",
      pricing: "Pricing",
      blog: "Blog",
      support: "Support",
      contact: "Contact",
      cta: "Get Started Free",
      switcherLabel: "Language",
      privacy: "Privacy Policy",
      terms: "Terms of Service",
      copyright: "All rights reserved.",
      independence:
        "AutoLister AI is an independent tool and is not affiliated with, endorsed by, or sponsored by Vinted.",
    },
    home: {
      seoTitle:
        "Vinted AI Listing Assistant & Description Generator | AutoLister AI",
      seoDescription:
        "Create Vinted titles, descriptions, and hashtags from item photos with AutoLister AI. Save seller notes, work directly inside Vinted, and never connect your Vinted account.",
      heroTitle: "AI listing assistant for Vinted titles and descriptions",
      heroSubtitle:
        "Create Vinted titles, descriptions, and hashtags from your item photos. Save your own seller notes and reuse them on future listings. Works directly inside Vinted, with no Vinted account connection needed.",
      heroMobileSubtitle:
        "Create better Vinted listings in seconds, directly inside Vinted.",
      heroBadgeSafe: "AI listing assistant · You stay in control",
      heroBulletSafety: "Prepares listing drafts for you to review and publish",
    },
    pricing: {
      seoTitle: "Pricing - AutoLister AI",
      seoDescription:
        "Discover our simple and transparent pricing plans for AutoLister AI. Choose the perfect plan for your selling journey on Vinted, with options for every seller type. Scale up or down at any time.",
      heading: "Simple, Transparent",
      headingAccent: "Pricing",
      subtitle: "Choose the perfect plan for your selling journey.",
      subtitleLine2: "Scale up or down at any time.",
    },
  },
  fr: {
    languageName: "Français",
    nav: {
      features: "Fonctionnalités",
      pricing: "Tarifs",
      blog: "Blog",
      support: "Support",
      contact: "Contact",
      cta: "Commencer Gratuitement",
      switcherLabel: "Langue",
      privacy: "Politique de confidentialité",
      terms: "Conditions d'utilisation",
      copyright: "Tous droits réservés.",
      independence:
        "AutoLister AI est un outil indépendant, sans affiliation, approbation ni parrainage de Vinted.",
    },
    home: {
      seoTitle:
        "Assistant IA pour annonces Vinted et générateur de descriptions | AutoLister AI",
      seoDescription:
        "Créez des titres, descriptions et hashtags Vinted depuis vos photos avec AutoLister AI. Enregistrez vos notes vendeur, travaillez directement dans Vinted et ne connectez jamais votre compte Vinted.",
      heroTitle: "Assistant IA pour les titres et descriptions Vinted",
      heroSubtitle:
        "Créez des titres, descriptions et hashtags Vinted depuis vos photos d'articles. Enregistrez vos propres notes vendeur et réutilisez-les sur vos prochaines annonces. Fonctionne directement dans Vinted, sans connecter votre compte Vinted.",
      heroMobileSubtitle:
        "Créez de meilleures annonces Vinted en quelques secondes, directement dans Vinted.",
      heroBadgeSafe: "Assistant IA pour vos annonces · Vous gardez le contrôle",
      heroBulletSafety:
        "Prépare des brouillons que vous vérifiez avant de publier",
    },
    pricing: {
      seoTitle: "Tarifs - AutoLister AI",
      seoDescription:
        "Découvrez nos offres simples et transparentes pour AutoLister AI.",
      heading: "Tarifs",
      headingAccent: "Transparents",
      subtitle: "Choisissez l'offre adaptée à votre profil vendeur.",
      subtitleLine2: "Montez ou baissez à tout moment.",
    },
  },
  de: {
    languageName: "Deutsch",
    nav: {
      features: "Funktionen",
      pricing: "Preise",
      blog: "Blog",
      support: "Support",
      contact: "Kontakt",
      cta: "Kostenlos Starten",
      switcherLabel: "Sprache",
      privacy: "Datenschutzrichtlinie",
      terms: "Nutzungsbedingungen",
      copyright: "Alle Rechte vorbehalten.",
      independence:
        "AutoLister AI ist ein unabhängiges Tool und weder mit Vinted verbunden noch von Vinted unterstützt oder gesponsert.",
    },
    home: {
      seoTitle:
        "Vinted-KI-Assistent für Anzeigen & Beschreibungsgenerator | AutoLister AI",
      seoDescription:
        "Erstelle Vinted-Titel, Beschreibungen und Hashtags aus Artikelfotos mit AutoLister AI. Speichere Verkäufernotizen, arbeite direkt in Vinted und verbinde nie dein Vinted-Konto.",
      heroTitle: "KI-Assistent für Vinted-Titel und -Beschreibungen",
      heroSubtitle:
        "Erstelle Vinted-Titel, Beschreibungen und Hashtags aus deinen Artikelfotos. Speichere eigene Verkäufernotizen und nutze sie in zukünftigen Anzeigen wieder. Funktioniert direkt in Vinted, ohne dein Vinted-Konto zu verbinden.",
      heroMobileSubtitle:
        "Erstelle bessere Vinted-Anzeigen in Sekunden, direkt in Vinted.",
      heroBadgeSafe: "KI-Assistent für Anzeigen · Du behältst die Kontrolle",
      heroBulletSafety:
        "Erstellt Entwürfe, die du vor dem Veröffentlichen prüfst",
    },
    pricing: {
      seoTitle: "Preise - AutoLister AI",
      seoDescription: "Einfache und transparente Preisplane fur AutoLister AI.",
      heading: "Einfach, Transparent",
      headingAccent: "Preise",
      subtitle: "Wahle den passenden Plan fur deinen Verkauf.",
      subtitleLine2: "Jederzeit upgraden oder downgraden.",
    },
  },
  nl: {
    languageName: "Nederlands",
    nav: {
      features: "Functies",
      pricing: "Prijzen",
      blog: "Blog",
      support: "Support",
      contact: "Contact",
      cta: "Gratis Starten",
      switcherLabel: "Taal",
      privacy: "Privacybeleid",
      terms: "Gebruiksvoorwaarden",
      copyright: "Alle rechten voorbehouden.",
      independence:
        "AutoLister AI is een onafhankelijke tool en is niet gelieerd aan, goedgekeurd door of gesponsord door Vinted.",
    },
    home: {
      seoTitle:
        "Vinted AI-assistent voor advertenties & beschrijving generator | AutoLister AI",
      seoDescription:
        "Maak Vinted-titels, beschrijvingen en hashtags vanuit itemfoto's met AutoLister AI. Bewaar verkopersnotities, werk direct in Vinted en koppel nooit je Vinted-account.",
      heroTitle: "AI-assistent voor Vinted-titels en beschrijvingen",
      heroSubtitle:
        "Maak Vinted-titels, beschrijvingen en hashtags vanuit je itemfoto's. Bewaar je eigen verkopersnotities en gebruik ze opnieuw bij toekomstige advertenties. Werkt direct in Vinted, zonder je Vinted-account te koppelen.",
      heroMobileSubtitle:
        "Maak betere Vinted-advertenties in seconden, direct in Vinted.",
      heroBadgeSafe: "AI-assistent voor advertenties · Jij houdt de controle",
      heroBulletSafety:
        "Maakt concepten die je controleert voordat je publiceert",
    },
    pricing: {
      seoTitle: "Prijzen - AutoLister AI",
      seoDescription:
        "Ontdek simpele en transparante prijzen voor AutoLister AI.",
      heading: "Eenvoudige, Transparante",
      headingAccent: "Prijzen",
      subtitle: "Kies het plan dat bij je verkoop past.",
      subtitleLine2: "Altijd op- of afschalen.",
    },
  },
  pl: {
    languageName: "Polski",
    nav: {
      features: "Funkcje",
      pricing: "Cennik",
      blog: "Blog",
      support: "Wsparcie",
      contact: "Kontakt",
      cta: "Zacznij za darmo",
      switcherLabel: "Jezyk",
      privacy: "Polityka prywatnosci",
      terms: "Warunki korzystania",
      copyright: "Wszelkie prawa zastrzezone.",
      independence:
        "AutoLister AI jest niezależnym narzędziem i nie jest powiązane, zatwierdzone ani sponsorowane przez Vinted.",
    },
    home: {
      seoTitle:
        "Asystent AI do ogłoszeń Vinted i generator opisów | AutoLister AI",
      seoDescription:
        "Twórz tytuły, opisy i hashtagi Vinted ze zdjęć produktów dzięki AutoLister AI. Zapisuj notatki sprzedawcy, pracuj bezpośrednio w Vinted i nigdy nie łącz konta Vinted.",
      heroTitle: "Asystent AI do tytułów i opisów Vinted",
      heroSubtitle:
        "Twórz tytuły, opisy i hashtagi Vinted ze zdjęć swoich produktów. Zapisuj własne notatki sprzedawcy i używaj ich ponownie w przyszłych ogłoszeniach. Działa bezpośrednio w Vinted, bez łączenia konta Vinted.",
      heroMobileSubtitle:
        "Twórz lepsze ogłoszenia Vinted w kilka sekund, bezpośrednio w Vinted.",
      heroBadgeSafe: "Asystent AI do ogłoszeń · Ty zachowujesz kontrolę",
      heroBulletSafety:
        "Przygotowuje wersje robocze, które sprawdzasz przed publikacją",
    },
    pricing: {
      seoTitle: "Cennik - AutoLister AI",
      seoDescription: "Prosty i przejrzysty cennik AutoLister AI.",
      heading: "Prosty, Przejrzysty",
      headingAccent: "Cennik",
      subtitle: "Wybierz plan dopasowany do swojego stylu sprzedazy.",
      subtitleLine2: "Zmieniaj plan kiedy chcesz.",
    },
  },
  es: {
    languageName: "Español",
    nav: {
      features: "Funciones",
      pricing: "Precios",
      blog: "Blog",
      support: "Soporte",
      contact: "Contacto",
      cta: "Empieza Gratis",
      switcherLabel: "Idioma",
      privacy: "Política de privacidad",
      terms: "Términos de servicio",
      copyright: "Todos los derechos reservados.",
      independence:
        "AutoLister AI es una herramienta independiente y no está afiliada, respaldada ni patrocinada por Vinted.",
    },
    home: {
      seoTitle:
        "Asistente IA para anuncios de Vinted y generador de descripciones | AutoLister AI",
      seoDescription:
        "Crea títulos, descripciones y hashtags para Vinted desde fotos de artículos con AutoLister AI. Guarda notas de vendedor, trabaja directamente dentro de Vinted y nunca conectes tu cuenta de Vinted.",
      heroTitle: "Asistente IA para títulos y descripciones de Vinted",
      heroSubtitle:
        "Crea títulos, descripciones y hashtags para Vinted desde las fotos de tus artículos. Guarda tus propias notas de vendedor y reutilízalas en futuros anuncios. Funciona directamente dentro de Vinted, sin conectar tu cuenta de Vinted.",
      heroMobileSubtitle:
        "Crea mejores anuncios de Vinted en segundos, directamente en Vinted.",
      heroBadgeSafe: "Asistente de anuncios con IA · Tú tienes el control",
      heroBulletSafety:
        "Prepara borradores que revisas antes de publicar",
    },
    pricing: {
      seoTitle: "Precios - AutoLister AI",
      seoDescription:
        "Descubre planes simples y transparentes para AutoLister AI.",
      heading: "Simple, Transparente",
      headingAccent: "Precios",
      subtitle: "Elige el plan perfecto para tu forma de vender.",
      subtitleLine2: "Sube o baja de plan cuando quieras.",
    },
  },
  it: {
    languageName: "Italiano",
    nav: {
      features: "Funzionalita",
      pricing: "Prezzi",
      blog: "Blog",
      support: "Supporto",
      contact: "Contatto",
      cta: "Inizia Gratis",
      switcherLabel: "Lingua",
      privacy: "Informativa sulla privacy",
      terms: "Termini di servizio",
      copyright: "Tutti i diritti riservati.",
      independence:
        "AutoLister AI è uno strumento indipendente e non è affiliato, approvato o sponsorizzato da Vinted.",
    },
    home: {
      seoTitle:
        "Assistente IA per annunci Vinted e generatore di descrizioni | AutoLister AI",
      seoDescription:
        "Crea titoli, descrizioni e hashtag Vinted dalle foto degli articoli con AutoLister AI. Salva note venditore, lavora direttamente dentro Vinted e non collegare mai il tuo account Vinted.",
      heroTitle: "Assistente IA per titoli e descrizioni Vinted",
      heroSubtitle:
        "Crea titoli, descrizioni e hashtag Vinted dalle foto dei tuoi articoli. Salva le tue note venditore e riutilizzale negli annunci futuri. Funziona direttamente dentro Vinted, senza collegare il tuo account Vinted.",
      heroMobileSubtitle:
        "Crea annunci Vinted migliori in pochi secondi, direttamente su Vinted.",
      heroBadgeSafe: "Assistente AI per gli annunci · Decidi tu",
      heroBulletSafety:
        "Prepara bozze che controlli prima di pubblicare",
    },
    pricing: {
      seoTitle: "Prezzi - AutoLister AI",
      seoDescription: "Scopri i piani semplici e trasparenti di AutoLister AI.",
      heading: "Semplice, Trasparente",
      headingAccent: "Prezzi",
      subtitle: "Scegli il piano giusto per il tuo modo di vendere.",
      subtitleLine2: "Passa di livello quando vuoi.",
    },
  },
  pt: {
    languageName: "Português",
    nav: {
      features: "Funcionalidades",
      pricing: "Precos",
      blog: "Blog",
      support: "Suporte",
      contact: "Contacto",
      cta: "Comecar Gratis",
      switcherLabel: "Idioma",
      privacy: "Política de privacidade",
      terms: "Termos de serviço",
      copyright: "Todos os direitos reservados.",
      independence:
        "O AutoLister AI é uma ferramenta independente e não é afiliado, aprovado ou patrocinado pela Vinted.",
    },
    home: {
      seoTitle:
        "Assistente IA para anúncios Vinted e gerador de descrições | AutoLister AI",
      seoDescription:
        "Crie títulos, descrições e hashtags Vinted a partir de fotografias dos artigos com o AutoLister AI. Guarde notas de vendedor, trabalhe diretamente na Vinted e nunca ligue a sua conta Vinted.",
      heroTitle: "Assistente IA para títulos e descrições Vinted",
      heroSubtitle:
        "Crie títulos, descrições e hashtags Vinted a partir das fotografias dos seus artigos. Guarde as suas próprias notas de vendedor e reutilize-as em anúncios futuros. Funciona diretamente na Vinted, sem ligar a sua conta Vinted.",
      heroMobileSubtitle:
        "Crie melhores anúncios Vinted em segundos, diretamente na Vinted.",
      heroBadgeSafe: "Assistente de anúncios com IA · Você mantém o controlo",
      heroBulletSafety:
        "Prepara rascunhos que revê antes de publicar",
    },
    pricing: {
      seoTitle: "Precos - AutoLister AI",
      seoDescription:
        "Descubra planos simples e transparentes para o AutoLister AI.",
      heading: "Simples, Transparente",
      headingAccent: "Precos",
      subtitle: "Escolha o plano ideal para o seu ritmo de vendas.",
      subtitleLine2: "Mude de plano quando quiser.",
    },
  },
};

export function normalizeSiteLocale(input?: string | null): SiteLocale {
  const raw = (input || "").toLowerCase().trim();
  if (!raw) return DEFAULT_SITE_LOCALE;

  const base = raw.split(/[-_]/)[0] as SiteLocale;
  if (SUPPORTED_SITE_LOCALES.includes(base)) {
    return base;
  }

  return DEFAULT_SITE_LOCALE;
}

export type SiteExtraHomeCopy = {
  heroBadgePrimary: string;
  watchDemo: string;
  videoCaption: string;
  publicStatsAriaLabel: string;
  publicStatsGenerationsLabel: string;
  screenshotPreviewLabel: string;
  screenshotPreviewHint: string;
  screenshotPreviewBadge: string;
  screenshotPreviewPrimary: string;
  screenshotPreviewSecondary: string;
  screenshotModalEyebrow: string;
  screenshotModalHint: string;
  screenshotModalClose: string;
  screenshotModalCta: string;
  // Hero bullets
  heroBullet1: string;
  heroBullet2: string;
  heroBullet3: string;
  addToChrome: string;
  addToChromeNote: string;
  testimonialQuote: string;
  testimonialAuthor: string;
  tierProof: {
    ariaLabel: string;
    tierLabel: string;
    chooseTier: string;
    noCardRequired: string;
    priceLabel: string;
    comparisonLabel: string;
    listingsLabel: string;
    speedLabel: string;
    tiers: Record<
      "starter" | "pro" | "business",
      {
        name: string;
        priceValue: string;
        comparisonValue: string;
        listingsValue: string;
        speedValue: string;
      }
    >;
  };
  // Features section
  featuresTitle: string;
  featuresSubtitle: string;
  feature1Title: string;
  feature1Body: string;
  feature2Title: string;
  feature2Body: string;
  feature3Title: string;
  feature3Body: string;
  // How it works
  howItWorksTitle: string;
  howItWorksSubtitle: string;
  step1Title: string;
  step1Body: string;
  step2Title: string;
  step2Body: string;
  step3Title: string;
  step3Body: string;
  // Final CTA
  finalCtaTitle: string;
  finalCtaBody: string;
  getStartedFree: string;
};

type SiteExtraPricingCopy = {
  safetyBannerTitle: string;
  safetyZeroMass: string;
  safetyZeroApi: string;
  safetyZeroBan: string;
  // Plan badges
  accountSafe: string;
  mostPopular: string;
  // Period labels
  perMonth: string;
  perForever: string;
  // Free plan
  freePlanName: string;
  freePlanSubtitle: string;
  freePlanCta: string;
  // Starter plan
  starterPlanName: string;
  starterPlanSubtitle: string;
  starterPlanCta: string;
  // Pro plan
  proPlanName: string;
  proPlanSubtitle: string;
  proPlanCta: string;
  // Business plan
  businessPlanName: string;
  businessPlanSubtitle: string;
  businessPlanCta: string;
  creditPackEyebrow: string;
  creditPackTitle: string;
  creditPackBody: string;
  creditPackCta: string;
  // Shared feature bullets
  aiGeneratedTitles: string;
  savedNote: string;
  phoneUpload: string;
  seeIfYouLikeIt: string;
  everythingInStarter: string;
  changeAiTone: string;
  emojiSupport: string;
  noDailyLimit: string;
  listingsPerDay: string;
  listingsPerMonth: string;
  everythingInPro: string;
  highestDailyLimits: string;
  dedicatedSupport: string;
  priorityProcessing: string;
  // Bottom strip
  noCard: string;
  instantAccess: string;
  helpChoosing: string;
  emailSupport: string;
};

export const SITE_EXTRA_COPY: Record<
  SiteLocale,
  { home: SiteExtraHomeCopy; pricing: SiteExtraPricingCopy }
> = {
  en: {
    home: {
      heroBadgePrimary: "Vinted description generator + listing assistant",
      watchDemo: "Watch Demo",
      videoCaption: "See how it works in 15 seconds",
      publicStatsAriaLabel: "AutoLister public usage stats",
      publicStatsGenerationsLabel: "Vinted listings prepared",
      screenshotPreviewLabel: "New version screenshots",
      screenshotPreviewHint: "Open full size",
      screenshotPreviewBadge: "New",
      screenshotPreviewPrimary: "New main screenshot",
      screenshotPreviewSecondary: "New feature screenshot",
      screenshotModalEyebrow: "New AutoLister screenshots",
      screenshotModalHint: "Close this preview to continue on the page.",
      screenshotModalClose: "Close preview",
      screenshotModalCta: "Add to Chrome free",
      heroBullet1: "Creates titles, descriptions, and hashtags from your photos",
      heroBullet2: "No copy-paste needed. No emailing photos.",
      heroBullet3: "You review every draft before publishing",
      addToChrome: "Add to Chrome",
      addToChromeNote: "It's Free",
      testimonialQuote:
        "So much faster when I upload several items. The first draft is ready in seconds.",
      testimonialAuthor: "— Otília N., Vinted seller",
      tierProof: {
        ariaLabel: "AutoLister plan value",
        tierLabel: "Plan",
        chooseTier: "Try first for free",
        noCardRequired: "No credit card required",
        priceLabel: "per month",
        comparisonLabel: "vs ChatGPT Plus",
        listingsLabel: "included each month",
        speedLabel: "from photos to draft",
        tiers: {
          starter: {
            name: "Starter",
            priceValue: "€3.99",
            comparisonValue: "~80% cheaper",
            listingsValue: "75 listings",
            speedValue: "Average 5 seconds",
          },
          pro: {
            name: "Pro",
            priceValue: "€9.99",
            comparisonValue: "~50% cheaper",
            listingsValue: "250 listings",
            speedValue: "Average 5 seconds",
          },
          business: {
            name: "Business",
            priceValue: "€19.99",
            comparisonValue: "Comparable price",
            listingsValue: "600 listings",
            speedValue: "Average 5 seconds",
          },
        },
      },
      featuresTitle: "An AI Assistant for Listing Drafts",
      featuresSubtitle:
        "Turn item photos into draft titles and descriptions for you to review.",
      feature1Title: "Clear Listing Drafts",
      feature1Body:
        "Create a title and description from the details visible in your photos.",
      feature2Title: "Seamless Workflow",
      feature2Body:
        "Work from your photos to a reviewable draft directly on the listing page.",
      feature3Title: "Smart AI Technology",
      feature3Body:
        "Uses AI to identify visible item details and prepare editable listing text.",
      howItWorksTitle: "How It Works",
      howItWorksSubtitle: "Get professional listings in three simple steps",
      step1Title: "Install Extension",
      step1Body:
        "Add the Vinted generator to your browser in seconds. It's free to get started.",
      step2Title: "Add Photos & Generate",
      step2Body:
        "Upload photos directly to Vinted, or use our mobile feature to snap and sync. Then just click Generate.",
      step3Title: "Review & Publish",
      step3Body: "Review the draft, adjust it if needed, and publish when ready.",
      finalCtaTitle: "Ready to Prepare Your Next Listing?",
      finalCtaBody:
        "Use AutoLister to prepare editable titles and descriptions from your photos.",
      getStartedFree: "Get Started Free",
    },
    pricing: {
      safetyBannerTitle: "An AI listing assistant that keeps you in control.",
      safetyZeroMass: "No need to connect your Vinted account",
      safetyZeroApi: "You publish each draft yourself",
      safetyZeroBan: "Review before publishing",
      accountSafe: "Seller-Controlled",
      mostPopular: "Most Popular",
      perMonth: "/month",
      perForever: "/forever",
      freePlanName: "Free Trial",
      freePlanSubtitle: "Get a taste of AutoLister AI",
      freePlanCta: "Try Free",
      starterPlanName: "Starter",
      starterPlanSubtitle: "Perfect for casual Vinted sellers",
      starterPlanCta: "Get Starter Plan",
      proPlanName: "Pro",
      proPlanSubtitle: "For active sellers",
      proPlanCta: "Get Pro Plan",
      businessPlanName: "Business",
      businessPlanSubtitle: "For resellers and high-volume sellers",
      businessPlanCta: "Get Business Plan",
      creditPackEyebrow: "One-time top-up",
      creditPackTitle: "Need a one-time top-up?",
      creditPackBody:
        "Buy {credits} extra listing credits for {price}. One-time payment. No commitment.",
      creditPackCta: "Buy {credits} credits",
      aiGeneratedTitles: "AI-generated titles & descriptions",
      savedNote: "Reusable seller note",
      phoneUpload: "Phone upload (Soon only available to Pro and Business)",
      seeIfYouLikeIt: "See if you like it first",
      everythingInStarter: "Everything in Starter",
      changeAiTone: "Change AI writing tone",
      emojiSupport: "Emoji Support",
      noDailyLimit: "No Daily Limit",
      listingsPerDay: "/ day",
      listingsPerMonth: "/ month",
      everythingInPro: "Everything in Pro",
      highestDailyLimits: "Highest daily limits",
      dedicatedSupport: "Dedicated support",
      priorityProcessing: "Priority processing",
      noCard: "No credit card required",
      instantAccess: "Instant access to free features.",
      helpChoosing: "Need help choosing?",
      emailSupport: "Email our support team ->",
    },
  },
  fr: {
    home: {
      heroBadgePrimary:
        "Générateur de descriptions Vinted + assistant d'annonces",
      watchDemo: "Voir la démo",
      videoCaption: "Voyez le résultat en 15 secondes",
      publicStatsAriaLabel: "Statistiques publiques d'utilisation d'AutoLister",
      publicStatsGenerationsLabel: "annonces Vinted préparées",
      screenshotPreviewLabel: "Nouvelles captures",
      screenshotPreviewHint: "Ouvrir en grand",
      screenshotPreviewBadge: "Nouveau",
      screenshotPreviewPrimary: "Nouvelle capture principale",
      screenshotPreviewSecondary: "Nouvelle capture fonctionnalité",
      screenshotModalEyebrow: "Nouvelles captures AutoLister",
      screenshotModalHint: "Fermez cet aperçu pour continuer sur la page.",
      screenshotModalClose: "Fermer l'aperçu",
      screenshotModalCta: "Ajouter à Chrome gratuitement",
      heroBullet1: "Crée des titres, descriptions et hashtags depuis vos photos",
      heroBullet2: "Aucun copier-coller. Aucun envoi de photos par e-mail.",
      heroBullet3: "Vous vérifiez chaque brouillon avant de publier",
      addToChrome: "Ajouter à Chrome",
      addToChromeNote: "C'est gratuit",
      testimonialQuote:
        "Tellement plus rapide quand j'ajoute plusieurs articles. Le premier brouillon est prêt en quelques secondes.",
      testimonialAuthor: "— Otília N., vendeuse Vinted",
      tierProof: {
        ariaLabel: "Valeur des offres AutoLister",
        tierLabel: "Offre",
        chooseTier: "Essayez gratuitement",
        noCardRequired: "Aucune carte bancaire requise",
        priceLabel: "par mois",
        comparisonLabel: "vs ChatGPT Plus",
        listingsLabel: "incluses chaque mois",
        speedLabel: "des photos au brouillon",
        tiers: {
          starter: {
            name: "Starter",
            priceValue: "3,99 €",
            comparisonValue: "~80 % moins cher",
            listingsValue: "75 annonces",
            speedValue: "5 secondes en moyenne",
          },
          pro: {
            name: "Pro",
            priceValue: "9,99 €",
            comparisonValue: "~50 % moins cher",
            listingsValue: "250 annonces",
            speedValue: "5 secondes en moyenne",
          },
          business: {
            name: "Business",
            priceValue: "19,99 €",
            comparisonValue: "Prix comparable",
            listingsValue: "600 annonces",
            speedValue: "5 secondes en moyenne",
          },
        },
      },
      featuresTitle: "Un assistant IA pour vos brouillons d’annonces",
      featuresSubtitle:
        "Transformez vos photos en brouillons de titres et descriptions à vérifier.",
      feature1Title: "Des brouillons clairs",
      feature1Body:
        "Créez un titre et une description à partir des détails visibles sur vos photos.",
      feature2Title: "Intégration fluide",
      feature2Body:
        "Passez de vos photos à un brouillon modifiable directement sur la page d’annonce.",
      feature3Title: "Technologie IA intelligente",
      feature3Body:
        "Propulsé par des modèles de langage avancés qui comprennent la mode et les pratiques Vinted.",
      howItWorksTitle: "Comment ça marche",
      howItWorksSubtitle: "Des annonces pro en trois étapes simples",
      step1Title: "Installez l'extension",
      step1Body:
        "Ajoutez le générateur Vinted à votre navigateur en quelques secondes. C'est gratuit.",
      step2Title: "Ajoutez des photos et générez",
      step2Body:
        "Ajoutez vos photos puis cliquez sur Générer pour obtenir une annonce optimisée.",
      step3Title: "Vérifiez et publiez",
      step3Body: "Vérifiez le brouillon, ajustez-le si besoin, puis publiez.",
      finalCtaTitle: "Prêt à préparer votre prochaine annonce ?",
      finalCtaBody:
        "Utilisez AutoLister pour préparer des titres et descriptions modifiables depuis vos photos.",
      getStartedFree: "Commencer gratuitement",
    },
    pricing: {
      safetyBannerTitle: "Un assistant IA qui vous laisse le contrôle.",
      safetyZeroMass: "Pas besoin de connecter votre compte Vinted",
      safetyZeroApi: "Vous publiez vous-même chaque brouillon",
      safetyZeroBan: "À vérifier avant publication",
      accountSafe: "Sous votre contrôle",
      mostPopular: "Le plus populaire",
      perMonth: "/mois",
      perForever: "/à vie",
      freePlanName: "Essai gratuit",
      freePlanSubtitle: "Découvrez AutoLister AI",
      freePlanCta: "Essayer gratuitement",
      starterPlanName: "Starter",
      starterPlanSubtitle: "Parfait pour les vendeurs occasionnels",
      starterPlanCta: "Choisir Starter",
      proPlanName: "Pro",
      proPlanSubtitle: "Pour les vendeurs actifs",
      proPlanCta: "Choisir Pro",
      businessPlanName: "Business",
      businessPlanSubtitle: "Pour les revendeurs et gros volumes",
      businessPlanCta: "Choisir Business",
      creditPackEyebrow: "Top-up ponctuel",
      creditPackTitle: "Besoin d'un top-up ponctuel ?",
      creditPackBody:
        "Achetez {credits} credits d'annonces en plus pour {price}. Paiement unique. Sans engagement.",
      creditPackCta: "Acheter {credits} credits",
      aiGeneratedTitles: "Titres et descriptions générés par IA",
      savedNote: "Note vendeur réutilisable",
      phoneUpload: "Photo depuis mobile (bientôt réservé Pro et Business)",
      seeIfYouLikeIt: "Testez avant de vous engager",
      everythingInStarter: "Tout ce qu'inclut Starter",
      changeAiTone: "Changer le ton de rédaction IA",
      emojiSupport: "Support emoji",
      noDailyLimit: "Sans limite quotidienne",
      listingsPerDay: "/ jour",
      listingsPerMonth: "/ mois",
      everythingInPro: "Tout ce qu'inclut Pro",
      highestDailyLimits: "Limites quotidiennes maximales",
      dedicatedSupport: "Support dédié",
      priorityProcessing: "Traitement prioritaire",
      noCard: "Aucune carte bancaire requise",
      instantAccess: "Accès immédiat aux fonctionnalités gratuites.",
      helpChoosing: "Besoin d'aide pour choisir ?",
      emailSupport: "Contacter le support ->",
    },
  },
  de: {
    home: {
      heroBadgePrimary: "Vinted-Beschreibungsgenerator + Anzeigen-Assistent",
      watchDemo: "Demo ansehen",
      videoCaption: "So funktioniert es in 15 Sekunden",
      publicStatsAriaLabel: "Öffentliche Nutzungsstatistiken von AutoLister",
      publicStatsGenerationsLabel: "vorbereitete Vinted-Anzeigen",
      screenshotPreviewLabel: "Neue Versions-Screenshots",
      screenshotPreviewHint: "Groß öffnen",
      screenshotPreviewBadge: "Neu",
      screenshotPreviewPrimary: "Neuer Haupt-Screenshot",
      screenshotPreviewSecondary: "Neuer Funktions-Screenshot",
      screenshotModalEyebrow: "Neue AutoLister-Screenshots",
      screenshotModalHint:
        "Schließe die Vorschau, um auf der Seite weiterzumachen.",
      screenshotModalClose: "Vorschau schließen",
      screenshotModalCta: "Kostenlos zu Chrome hinzufügen",
      heroBullet1: "Erstellt Titel, Beschreibungen und Hashtags aus deinen Fotos",
      heroBullet2: "Kein Kopieren und Einfugen. Keine Fotos per E-Mail senden.",
      heroBullet3: "Du prüfst jeden Entwurf vor dem Veröffentlichen",
      addToChrome: "Zu Chrome hinzufugen",
      addToChromeNote: "Kostenlos",
      testimonialQuote:
        "So viel schneller, wenn ich mehrere Artikel hochlade. Der erste Entwurf ist in Sekunden fertig.",
      testimonialAuthor: "— Otília N., Vinted-Verkaeuferin",
      tierProof: {
        ariaLabel: "AutoLister Tarifvorteile",
        tierLabel: "Tarif",
        chooseTier: "Kostenlos testen",
        noCardRequired: "Keine Kreditkarte erforderlich",
        priceLabel: "pro Monat",
        comparisonLabel: "vs. ChatGPT Plus",
        listingsLabel: "jeden Monat enthalten",
        speedLabel: "von Fotos zum Entwurf",
        tiers: {
          starter: {
            name: "Starter",
            priceValue: "3,99 €",
            comparisonValue: "~80 % günstiger",
            listingsValue: "75 Anzeigen",
            speedValue: "Im Schnitt 5 Sekunden",
          },
          pro: {
            name: "Pro",
            priceValue: "9,99 €",
            comparisonValue: "~50 % günstiger",
            listingsValue: "250 Anzeigen",
            speedValue: "Im Schnitt 5 Sekunden",
          },
          business: {
            name: "Business",
            priceValue: "19,99 €",
            comparisonValue: "Vergleichbarer Preis",
            listingsValue: "600 Anzeigen",
            speedValue: "Im Schnitt 5 Sekunden",
          },
        },
      },
      featuresTitle: "Ein KI-Assistent für Anzeigenentwürfe",
      featuresSubtitle:
        "Verwandle Artikelfotos in Titel- und Beschreibungsentwürfe zum Prüfen.",
      feature1Title: "Klare Anzeigenentwürfe",
      feature1Body:
        "Erstelle Titel und Beschreibung aus den sichtbaren Details deiner Fotos.",
      feature2Title: "Nahtloser Ablauf",
      feature2Body:
        "Arbeite direkt auf der Anzeigenseite von Fotos zu einem bearbeitbaren Entwurf.",
      feature3Title: "Intelligente KI-Technologie",
      feature3Body:
        "Angetrieben von fortschrittlichen Sprachmodellen, die Modetrends und Vinted-Best-Practices verstehen.",
      howItWorksTitle: "So funktioniert's",
      howItWorksSubtitle: "Professionelle Anzeigen in drei einfachen Schritten",
      step1Title: "Erweiterung installieren",
      step1Body:
        "Fuge den Vinted-Generator in Sekunden deinem Browser hinzu. Kostenloser Start.",
      step2Title: "Fotos hinzufugen und generieren",
      step2Body:
        "Fotos hochladen und auf Generieren klicken. AutoLister erstellt den optimierten Text.",
      step3Title: "Prüfen und veröffentlichen",
      step3Body: "Prüfe den Entwurf, passe ihn bei Bedarf an und veröffentliche ihn.",
      finalCtaTitle: "Bereit für deinen nächsten Anzeigenentwurf?",
      finalCtaBody:
        "Nutze AutoLister für bearbeitbare Titel und Beschreibungen aus deinen Fotos.",
      getStartedFree: "Kostenlos starten",
    },
    pricing: {
      safetyBannerTitle: "Ein KI-Assistent, bei dem du entscheidest.",
      safetyZeroMass: "Kein Vinted-Konto verbinden nötig",
      safetyZeroApi: "Du veröffentlichst jeden Entwurf selbst",
      safetyZeroBan: "Vor Veröffentlichung prüfen",
      accountSafe: "Unter deiner Kontrolle",
      mostPopular: "Beliebteste Wahl",
      perMonth: "/Monat",
      perForever: "/dauerhaft",
      freePlanName: "Kostenloser Test",
      freePlanSubtitle: "AutoLister AI ausprobieren",
      freePlanCta: "Kostenlos testen",
      starterPlanName: "Starter",
      starterPlanSubtitle: "Ideal fur gelegentliche Vinted-Verkaufer",
      starterPlanCta: "Starter wahlen",
      proPlanName: "Pro",
      proPlanSubtitle: "Fur aktive Verkaufer",
      proPlanCta: "Pro wahlen",
      businessPlanName: "Business",
      businessPlanSubtitle: "Fur Wiederverkaufer und Vielverkaufer",
      businessPlanCta: "Business wahlen",
      creditPackEyebrow: "Einmaliger Top-up",
      creditPackTitle: "Brauchst du einen einmaligen Top-up?",
      creditPackBody:
        "Kaufe {credits} extra Inserat-Credits fur {price}. Einmalige Zahlung. Kein Abo.",
      creditPackCta: "{credits} Credits kaufen",
      aiGeneratedTitles: "KI-generierte Titel und Beschreibungen",
      savedNote: "Wiederverwendbare Verkäufernotiz",
      phoneUpload: "Foto-Upload per Handy (bald nur fur Pro und Business)",
      seeIfYouLikeIt: "Testen, bevor du dich entscheidest",
      everythingInStarter: "Alles aus Starter",
      changeAiTone: "KI-Schreibton andern",
      emojiSupport: "Emoji-Unterstutzung",
      noDailyLimit: "Kein Tageslimit",
      listingsPerDay: "/ Tag",
      listingsPerMonth: "/ Monat",
      everythingInPro: "Alles aus Pro",
      highestDailyLimits: "Hochste Tageslimits",
      dedicatedSupport: "Dedizierter Support",
      priorityProcessing: "Vorrangige Verarbeitung",
      noCard: "Keine Kreditkarte erforderlich",
      instantAccess: "Sofortiger Zugriff auf kostenlose Funktionen.",
      helpChoosing: "Hilfe bei der Auswahl?",
      emailSupport: "Support-Team kontaktieren ->",
    },
  },
  nl: {
    home: {
      heroBadgePrimary: "Vinted beschrijving generator + advertentie-assistent",
      watchDemo: "Bekijk demo",
      videoCaption: "Zie hoe het werkt in 15 seconden",
      publicStatsAriaLabel: "Openbare gebruiksstatistieken van AutoLister",
      publicStatsGenerationsLabel: "Vinted-listings voorbereid",
      screenshotPreviewLabel: "Nieuwe versie-screenshots",
      screenshotPreviewHint: "Open groot",
      screenshotPreviewBadge: "Nieuw",
      screenshotPreviewPrimary: "Nieuwe hoofdscreenshot",
      screenshotPreviewSecondary: "Nieuwe functiescreenshot",
      screenshotModalEyebrow: "Nieuwe AutoLister-screenshots",
      screenshotModalHint: "Sluit deze preview om verder te gaan op de pagina.",
      screenshotModalClose: "Preview sluiten",
      screenshotModalCta: "Gratis toevoegen aan Chrome",
      heroBullet1: "Maakt titels, beschrijvingen en hashtags van je foto's",
      heroBullet2: "Geen kopieer-plak. Geen foto's mailen.",
      heroBullet3: "Je controleert elk concept voordat je publiceert",
      addToChrome: "Toevoegen aan Chrome",
      addToChromeNote: "Gratis",
      testimonialQuote:
        "Zoveel sneller als ik meerdere items upload. De eerste versie staat er binnen een paar seconden.",
      testimonialAuthor: "— Otília N., Vinted-verkoper",
      tierProof: {
        ariaLabel: "Waarde van AutoLister-abonnementen",
        tierLabel: "Abonnement",
        chooseTier: "Eerst gratis proberen",
        noCardRequired: "Geen creditcard nodig",
        priceLabel: "per maand",
        comparisonLabel: "vs. ChatGPT Plus",
        listingsLabel: "elke maand inbegrepen",
        speedLabel: "van foto's naar concept",
        tiers: {
          starter: {
            name: "Starter",
            priceValue: "€ 3,99",
            comparisonValue: "~80% goedkoper",
            listingsValue: "75 advertenties",
            speedValue: "Gemiddeld 5 seconden",
          },
          pro: {
            name: "Pro",
            priceValue: "€ 9,99",
            comparisonValue: "~50% goedkoper",
            listingsValue: "250 advertenties",
            speedValue: "Gemiddeld 5 seconden",
          },
          business: {
            name: "Business",
            priceValue: "€ 19,99",
            comparisonValue: "Vergelijkbare prijs",
            listingsValue: "600 advertenties",
            speedValue: "Gemiddeld 5 seconden",
          },
        },
      },
      featuresTitle: "Een AI-assistent voor advertentieconcepten",
      featuresSubtitle:
        "Zet itemfoto's om in concepttitels en -beschrijvingen om te controleren.",
      feature1Title: "Duidelijke concepten",
      feature1Body:
        "Maak een titel en beschrijving van de zichtbare details op je foto's.",
      feature2Title: "Naadloze Workflow",
      feature2Body:
        "Werk direct op de advertentiepagina van foto's naar een bewerkbaar concept.",
      feature3Title: "Slimme AI-technologie",
      feature3Body:
        "Aangedreven door geavanceerde taalmodellen die modetrends en Vinted-best practices begrijpen.",
      howItWorksTitle: "Hoe het werkt",
      howItWorksSubtitle: "Professionele listings in drie eenvoudige stappen",
      step1Title: "Installeer de extensie",
      step1Body:
        "Voeg de Vinted-generator in seconden toe aan je browser. Gratis starten.",
      step2Title: "Voeg foto's toe en genereer",
      step2Body:
        "Upload foto's en klik op Genereren voor direct geoptimaliseerde listingtekst.",
      step3Title: "Controleer en publiceer",
      step3Body: "Controleer het concept, pas het aan en publiceer wanneer je klaar bent.",
      finalCtaTitle: "Klaar voor je volgende advertentieconcept?",
      finalCtaBody:
        "Gebruik AutoLister voor bewerkbare titels en beschrijvingen vanuit je foto's.",
      getStartedFree: "Gratis beginnen",
    },
    pricing: {
      safetyBannerTitle: "Een AI-assistent waarbij jij beslist.",
      safetyZeroMass: "Je hoeft je Vinted-account niet te koppelen",
      safetyZeroApi: "Je publiceert elk concept zelf",
      safetyZeroBan: "Controleren vóór publicatie",
      accountSafe: "Onder jouw controle",
      mostPopular: "Meest populair",
      perMonth: "/maand",
      perForever: "/altijd",
      freePlanName: "Gratis proberen",
      freePlanSubtitle: "Ontdek AutoLister AI",
      freePlanCta: "Gratis proberen",
      starterPlanName: "Starter",
      starterPlanSubtitle: "Perfect voor af-en-toe verkopers",
      starterPlanCta: "Starter kiezen",
      proPlanName: "Pro",
      proPlanSubtitle: "Voor actieve verkopers",
      proPlanCta: "Pro kiezen",
      businessPlanName: "Business",
      businessPlanSubtitle: "Voor doorverkopers en grote volumes",
      businessPlanCta: "Business kiezen",
      creditPackEyebrow: "Eenmalige top-up",
      creditPackTitle: "Een eenmalige top-up nodig?",
      creditPackBody:
        "Koop {credits} extra listingcredits voor {price}. Eenmalige betaling. Geen verplichting.",
      creditPackCta: "{credits} credits kopen",
      aiGeneratedTitles: "AI-gegenereerde titels en beschrijvingen",
      savedNote: "Herbruikbare verkopersnotitie",
      phoneUpload:
        "Foto-upload via telefoon (binnenkort alleen Pro en Business)",
      seeIfYouLikeIt: "Probeer het eerst",
      everythingInStarter: "Alles van Starter",
      changeAiTone: "AI-schrijftoon aanpassen",
      emojiSupport: "Emoji-ondersteuning",
      noDailyLimit: "Geen daglimiet",
      listingsPerDay: "/ dag",
      listingsPerMonth: "/ maand",
      everythingInPro: "Alles van Pro",
      highestDailyLimits: "Hoogste daglimieten",
      dedicatedSupport: "Toegewijde ondersteuning",
      priorityProcessing: "Prioritaire verwerking",
      noCard: "Geen creditcard nodig",
      instantAccess: "Direct toegang tot gratis functies.",
      helpChoosing: "Hulp nodig bij kiezen?",
      emailSupport: "Mail ons supportteam ->",
    },
  },
  pl: {
    home: {
      heroBadgePrimary: "Generator opisów Vinted + asystent ogłoszeń",
      watchDemo: "Obejrzyj demo",
      videoCaption: "Zobacz jak to dziala w 15 sekund",
      publicStatsAriaLabel: "Publiczne statystyki użycia AutoLister",
      publicStatsGenerationsLabel: "przygotowanych ogłoszeń Vinted",
      screenshotPreviewLabel: "Zrzuty nowej wersji",
      screenshotPreviewHint: "Otwórz pełny rozmiar",
      screenshotPreviewBadge: "Nowe",
      screenshotPreviewPrimary: "Nowy główny zrzut",
      screenshotPreviewSecondary: "Nowy zrzut funkcji",
      screenshotModalEyebrow: "Nowe zrzuty AutoLister",
      screenshotModalHint: "Zamknij podgląd, aby kontynuować na stronie.",
      screenshotModalClose: "Zamknij podgląd",
      screenshotModalCta: "Dodaj do Chrome za darmo",
      heroBullet1: "Tworzy tytuły, opisy i hashtagi na podstawie zdjęć",
      heroBullet2: "Bez kopiowania i wklejania. Bez wysylania zdjec mailem.",
      heroBullet3: "Sprawdzasz każdą wersję roboczą przed publikacją",
      addToChrome: "Dodaj do Chrome",
      addToChromeNote: "To jest darmowe",
      testimonialQuote:
        "Duzo szybciej, gdy dodaje kilka rzeczy naraz. Pierwszy szkic jest gotowy w kilka sekund.",
      testimonialAuthor: "— Otília N., sprzedawczyni Vinted",
      tierProof: {
        ariaLabel: "Wartość planów AutoLister",
        tierLabel: "Plan",
        chooseTier: "Wypróbuj najpierw za darmo",
        noCardRequired: "Karta płatnicza nie jest wymagana",
        priceLabel: "miesięcznie",
        comparisonLabel: "vs ChatGPT Plus",
        listingsLabel: "co miesiąc w cenie",
        speedLabel: "od zdjęć do wersji roboczej",
        tiers: {
          starter: {
            name: "Starter",
            priceValue: "3,99 €",
            comparisonValue: "~80% taniej",
            listingsValue: "75 ogłoszeń",
            speedValue: "Średnio 5 sekund",
          },
          pro: {
            name: "Pro",
            priceValue: "9,99 €",
            comparisonValue: "~50% taniej",
            listingsValue: "250 ogłoszeń",
            speedValue: "Średnio 5 sekund",
          },
          business: {
            name: "Business",
            priceValue: "19,99 €",
            comparisonValue: "Porównywalna cena",
            listingsValue: "600 ogłoszeń",
            speedValue: "Średnio 5 sekund",
          },
        },
      },
      featuresTitle: "Asystent AI do wersji roboczych ogłoszeń",
      featuresSubtitle:
        "Zamień zdjęcia przedmiotu w tytuł i opis do sprawdzenia.",
      feature1Title: "Jasne wersje robocze",
      feature1Body:
        "Utwórz tytuł i opis na podstawie szczegółów widocznych na zdjęciach.",
      feature2Title: "Plynna praca",
      feature2Body:
        "Pracuj od zdjęć do edytowalnej wersji roboczej bezpośrednio na stronie ogłoszenia.",
      feature3Title: "Inteligentna technologia AI",
      feature3Body:
        "Zasilany zaawansowanymi modelami jezykowymi rozumiejacymi trendy mody i najlepsze praktyki Vinted.",
      howItWorksTitle: "Jak to dziala",
      howItWorksSubtitle: "Profesjonalne ogloszenia w trzech prostych krokach",
      step1Title: "Zainstaluj rozszerzenie",
      step1Body:
        "Dodaj generator Vinted do przegladarki w kilka sekund. Start jest darmowy.",
      step2Title: "Dodaj zdjecia i generuj",
      step2Body:
        "Wgraj zdjecia i kliknij Generuj, aby od razu otrzymac zoptymalizowany opis.",
      step3Title: "Sprawdź i opublikuj",
      step3Body: "Sprawdź wersję roboczą, popraw ją i opublikuj, gdy będzie gotowa.",
      finalCtaTitle: "Gotowy przygotować kolejne ogłoszenie?",
      finalCtaBody:
        "Użyj AutoLister, aby przygotować edytowalne tytuły i opisy ze zdjęć.",
      getStartedFree: "Zacznij za darmo",
    },
    pricing: {
      safetyBannerTitle: "Asystent AI, nad którym masz kontrolę.",
      safetyZeroMass: "Nie musisz łączyć konta Vinted",
      safetyZeroApi: "Każdą wersję roboczą publikujesz samodzielnie",
      safetyZeroBan: "Sprawdź przed publikacją",
      accountSafe: "Pod Twoją kontrolą",
      mostPopular: "Najpopularniejszy",
      perMonth: "/miesiac",
      perForever: "/zawsze",
      freePlanName: "Bezplatny test",
      freePlanSubtitle: "Sprawdz AutoLister AI",
      freePlanCta: "Wyprobuj za darmo",
      starterPlanName: "Starter",
      starterPlanSubtitle: "Idealny dla okazjonalnych sprzedawcow",
      starterPlanCta: "Wybierz Starter",
      proPlanName: "Pro",
      proPlanSubtitle: "Dla aktywnych sprzedawcow",
      proPlanCta: "Wybierz Pro",
      businessPlanName: "Business",
      businessPlanSubtitle: "Dla odsprzedawcow i hurtownikow",
      businessPlanCta: "Wybierz Business",
      creditPackEyebrow: "Jednorazowe doladowanie",
      creditPackTitle: "Potrzebujesz jednorazowego doladowania?",
      creditPackBody:
        "Kup {credits} dodatkowych kredytow na ogloszenia za {price}. Platnosc jednorazowa. Bez zobowiazan.",
      creditPackCta: "Kup {credits} kredytow",
      aiGeneratedTitles: "Tytuly i opisy generowane przez AI",
      savedNote: "Notatka sprzedawcy wielokrotnego uzytku",
      phoneUpload: "Upload zdjec przez telefon (wkrotce tylko Pro i Business)",
      seeIfYouLikeIt: "Sprawdz zanim sie zdecydujesz",
      everythingInStarter: "Wszystko ze Starter",
      changeAiTone: "Zmiana tonu pisania AI",
      emojiSupport: "Obsluga emoji",
      noDailyLimit: "Brak limitu dziennego",
      listingsPerDay: "/ dzien",
      listingsPerMonth: "/ miesiac",
      everythingInPro: "Wszystko z Pro",
      highestDailyLimits: "Najwyzsze limity dzienne",
      dedicatedSupport: "Dedykowane wsparcie",
      priorityProcessing: "Priorytetowe przetwarzanie",
      noCard: "Karta platnicza nie jest wymagana",
      instantAccess: "Natychmiastowy dostep do darmowych funkcji.",
      helpChoosing: "Potrzebujesz pomocy z wyborem?",
      emailSupport: "Napisz do supportu ->",
    },
  },
  es: {
    home: {
      heroBadgePrimary:
        "Generador de descripciones Vinted + asistente de anuncios",
      watchDemo: "Ver demo",
      videoCaption: "Mira como funciona en 15 segundos",
      publicStatsAriaLabel: "Estadísticas públicas de uso de AutoLister",
      publicStatsGenerationsLabel: "anuncios de Vinted preparados",
      screenshotPreviewLabel: "Capturas de la nueva versión",
      screenshotPreviewHint: "Abrir a tamaño completo",
      screenshotPreviewBadge: "Nuevo",
      screenshotPreviewPrimary: "Nueva captura principal",
      screenshotPreviewSecondary: "Nueva captura de función",
      screenshotModalEyebrow: "Nuevas capturas de AutoLister",
      screenshotModalHint: "Cierra esta vista previa para seguir en la página.",
      screenshotModalClose: "Cerrar vista previa",
      screenshotModalCta: "Añadir a Chrome gratis",
      heroBullet1: "Crea títulos, descripciones y hashtags desde tus fotos",
      heroBullet2: "Sin copiar y pegar. Sin enviar fotos por correo.",
      heroBullet3: "Revisas cada borrador antes de publicarlo",
      addToChrome: "Anadir a Chrome",
      addToChromeNote: "Es gratis",
      testimonialQuote:
        "Mucho mas rapido cuando subo varios articulos. El primer borrador esta listo en segundos.",
      testimonialAuthor: "— Otília N., vendedora de Vinted",
      tierProof: {
        ariaLabel: "Valor de los planes de AutoLister",
        tierLabel: "Plan",
        chooseTier: "Pruébalo gratis primero",
        noCardRequired: "No se requiere tarjeta",
        priceLabel: "al mes",
        comparisonLabel: "vs ChatGPT Plus",
        listingsLabel: "incluidos cada mes",
        speedLabel: "de fotos a borrador",
        tiers: {
          starter: {
            name: "Starter",
            priceValue: "3,99 €",
            comparisonValue: "~80 % más barato",
            listingsValue: "75 anuncios",
            speedValue: "5 segundos de media",
          },
          pro: {
            name: "Pro",
            priceValue: "9,99 €",
            comparisonValue: "~50 % más barato",
            listingsValue: "250 anuncios",
            speedValue: "5 segundos de media",
          },
          business: {
            name: "Business",
            priceValue: "19,99 €",
            comparisonValue: "Precio comparable",
            listingsValue: "600 anuncios",
            speedValue: "5 segundos de media",
          },
        },
      },
      featuresTitle: "Un asistente IA para borradores de anuncios",
      featuresSubtitle:
        "Convierte fotos de artículos en títulos y descripciones para revisar.",
      feature1Title: "Borradores claros",
      feature1Body:
        "Crea un título y una descripción con los detalles visibles en tus fotos.",
      feature2Title: "Flujo de Trabajo Sin Fricciones",
      feature2Body:
        "Trabaja desde tus fotos hasta un borrador editable en la página del anuncio.",
      feature3Title: "Tecnologia IA Inteligente",
      feature3Body:
        "Impulsado por modelos de lenguaje avanzados que entienden tendencias de moda y mejores practicas de Vinted.",
      howItWorksTitle: "Como funciona",
      howItWorksSubtitle: "Anuncios profesionales en tres pasos simples",
      step1Title: "Instala la extension",
      step1Body:
        "Anade el generador de Vinted a tu navegador en segundos. Es gratis para empezar.",
      step2Title: "Sube fotos y genera",
      step2Body:
        "Sube tus fotos y pulsa Generar para obtener texto optimizado al instante.",
      step3Title: "Revisa y publica",
      step3Body: "Revisa el borrador, ajústalo si hace falta y publícalo cuando esté listo.",
      finalCtaTitle: "¿Listo para preparar tu próximo anuncio?",
      finalCtaBody:
        "Usa AutoLister para preparar títulos y descripciones editables desde tus fotos.",
      getStartedFree: "Empieza gratis",
    },
    pricing: {
      safetyBannerTitle: "Un asistente de IA donde tú decides.",
      safetyZeroMass: "No necesitas conectar tu cuenta de Vinted",
      safetyZeroApi: "Tú publicas cada borrador",
      safetyZeroBan: "Revisa antes de publicar",
      accountSafe: "Bajo tu control",
      mostPopular: "Mas popular",
      perMonth: "/mes",
      perForever: "/siempre",
      freePlanName: "Prueba gratuita",
      freePlanSubtitle: "Descubre AutoLister AI",
      freePlanCta: "Probar gratis",
      starterPlanName: "Starter",
      starterPlanSubtitle: "Perfecto para vendedores ocasionales",
      starterPlanCta: "Elegir Starter",
      proPlanName: "Pro",
      proPlanSubtitle: "Para vendedores activos",
      proPlanCta: "Elegir Pro",
      businessPlanName: "Business",
      businessPlanSubtitle: "Para revendedores y grandes volumenes",
      businessPlanCta: "Elegir Business",
      creditPackEyebrow: "Extra puntual",
      creditPackTitle: "Necesitas un extra puntual?",
      creditPackBody:
        "Compra {credits} creditos extra para anuncios por {price}. Pago unico. Sin compromiso.",
      creditPackCta: "Comprar {credits} creditos",
      aiGeneratedTitles: "Titulos y descripciones generados por IA",
      savedNote: "Nota de vendedor reutilizable",
      phoneUpload: "Subida desde movil (pronto solo para Pro y Business)",
      seeIfYouLikeIt: "Pruebalo primero",
      everythingInStarter: "Todo lo de Starter",
      changeAiTone: "Cambiar tono de escritura IA",
      emojiSupport: "Soporte de emojis",
      noDailyLimit: "Sin limite diario",
      listingsPerDay: "/ dia",
      listingsPerMonth: "/ mes",
      everythingInPro: "Todo lo de Pro",
      highestDailyLimits: "Limites diarios maximos",
      dedicatedSupport: "Soporte dedicado",
      priorityProcessing: "Procesamiento prioritario",
      noCard: "No se requiere tarjeta",
      instantAccess: "Acceso instantaneo a funciones gratuitas.",
      helpChoosing: "Necesitas ayuda para elegir?",
      emailSupport: "Escribe a soporte ->",
    },
  },
  it: {
    home: {
      heroBadgePrimary: "Generatore di descrizioni Vinted + assistente annunci",
      watchDemo: "Guarda demo",
      videoCaption: "Scopri come funziona in 15 secondi",
      publicStatsAriaLabel: "Statistiche pubbliche di utilizzo di AutoLister",
      publicStatsGenerationsLabel: "annunci Vinted preparati",
      screenshotPreviewLabel: "Screenshot nuova versione",
      screenshotPreviewHint: "Apri a schermo intero",
      screenshotPreviewBadge: "Nuovo",
      screenshotPreviewPrimary: "Nuovo screenshot principale",
      screenshotPreviewSecondary: "Nuovo screenshot funzione",
      screenshotModalEyebrow: "Nuovi screenshot AutoLister",
      screenshotModalHint:
        "Chiudi questa anteprima per continuare nella pagina.",
      screenshotModalClose: "Chiudi anteprima",
      screenshotModalCta: "Aggiungi a Chrome gratis",
      heroBullet1: "Crea titoli, descrizioni e hashtag dalle tue foto",
      heroBullet2: "Nessun copia-incolla. Nessun invio di foto via email.",
      heroBullet3: "Controlli ogni bozza prima di pubblicarla",
      addToChrome: "Aggiungi a Chrome",
      addToChromeNote: "E gratis",
      testimonialQuote:
        "Molto piu veloce quando carico piu articoli insieme. La prima bozza e pronta in pochi secondi.",
      testimonialAuthor: "— Otília N., venditrice Vinted",
      tierProof: {
        ariaLabel: "Valore dei piani AutoLister",
        tierLabel: "Piano",
        chooseTier: "Prova prima gratuitamente",
        noCardRequired: "Nessuna carta di credito richiesta",
        priceLabel: "al mese",
        comparisonLabel: "vs ChatGPT Plus",
        listingsLabel: "inclusi ogni mese",
        speedLabel: "dalle foto alla bozza",
        tiers: {
          starter: {
            name: "Starter",
            priceValue: "3,99 €",
            comparisonValue: "~80% più economico",
            listingsValue: "75 annunci",
            speedValue: "5 secondi in media",
          },
          pro: {
            name: "Pro",
            priceValue: "9,99 €",
            comparisonValue: "~50% più economico",
            listingsValue: "250 annunci",
            speedValue: "5 secondi in media",
          },
          business: {
            name: "Business",
            priceValue: "19,99 €",
            comparisonValue: "Prezzo comparabile",
            listingsValue: "600 annunci",
            speedValue: "5 secondi in media",
          },
        },
      },
      featuresTitle: "Un assistente IA per le bozze degli annunci",
      featuresSubtitle:
        "Trasforma le foto degli articoli in titoli e descrizioni da controllare.",
      feature1Title: "Bozze chiare",
      feature1Body:
        "Crea un titolo e una descrizione dai dettagli visibili nelle foto.",
      feature2Title: "Flusso di Lavoro Senza Intoppi",
      feature2Body:
        "Passa dalle foto a una bozza modificabile direttamente nella pagina dell'annuncio.",
      feature3Title: "Tecnologia AI Intelligente",
      feature3Body:
        "Alimentato da modelli linguistici avanzati che comprendono tendenze della moda e best practice di Vinted.",
      howItWorksTitle: "Come funziona",
      howItWorksSubtitle: "Annunci professionali in tre passaggi semplici",
      step1Title: "Installa l'estensione",
      step1Body:
        "Aggiungi il generatore Vinted al browser in pochi secondi. Inizio gratuito.",
      step2Title: "Aggiungi foto e genera",
      step2Body:
        "Carica le foto e clicca Genera per ottenere subito testi ottimizzati.",
      step3Title: "Controlla e pubblica",
      step3Body: "Controlla la bozza, modificala se serve e pubblicala quando è pronta.",
      finalCtaTitle: "Pronto a preparare il prossimo annuncio?",
      finalCtaBody:
        "Usa AutoLister per preparare titoli e descrizioni modificabili dalle tue foto.",
      getStartedFree: "Inizia gratis",
    },
    pricing: {
      safetyBannerTitle: "Un assistente AI in cui decidi tu.",
      safetyZeroMass: "Non devi collegare il tuo account Vinted",
      safetyZeroApi: "Pubblichi personalmente ogni bozza",
      safetyZeroBan: "Controlla prima di pubblicare",
      accountSafe: "Sotto il tuo controllo",
      mostPopular: "Piu popolare",
      perMonth: "/mese",
      perForever: "/a vita",
      freePlanName: "Prova gratuita",
      freePlanSubtitle: "Scopri AutoLister AI",
      freePlanCta: "Prova gratis",
      starterPlanName: "Starter",
      starterPlanSubtitle: "Perfetto per i venditori occasionali",
      starterPlanCta: "Scegli Starter",
      proPlanName: "Pro",
      proPlanSubtitle: "Per i venditori attivi",
      proPlanCta: "Scegli Pro",
      businessPlanName: "Business",
      businessPlanSubtitle: "Per rivenditori e alti volumi",
      businessPlanCta: "Scegli Business",
      creditPackEyebrow: "Ricarica una tantum",
      creditPackTitle: "Ti serve una ricarica una tantum?",
      creditPackBody:
        "Compra {credits} crediti extra per annunci a {price}. Pagamento unico. Nessun impegno.",
      creditPackCta: "Compra {credits} crediti",
      aiGeneratedTitles: "Titoli e descrizioni generati dall'AI",
      savedNote: "Nota venditore riutilizzabile",
      phoneUpload: "Upload da telefono (presto solo per Pro e Business)",
      seeIfYouLikeIt: "Provalo prima di decidere",
      everythingInStarter: "Tutto di Starter",
      changeAiTone: "Cambia il tono di scrittura AI",
      emojiSupport: "Supporto emoji",
      noDailyLimit: "Nessun limite giornaliero",
      listingsPerDay: "/ giorno",
      listingsPerMonth: "/ mese",
      everythingInPro: "Tutto di Pro",
      highestDailyLimits: "Limiti giornalieri massimi",
      dedicatedSupport: "Supporto dedicato",
      priorityProcessing: "Elaborazione prioritaria",
      noCard: "Nessuna carta di credito richiesta",
      instantAccess: "Accesso immediato alle funzioni gratuite.",
      helpChoosing: "Hai bisogno di aiuto per scegliere?",
      emailSupport: "Contatta il supporto ->",
    },
  },
  pt: {
    home: {
      heroBadgePrimary: "Gerador de descrições Vinted + assistente de anúncios",
      watchDemo: "Ver demo",
      videoCaption: "Veja como funciona em 15 segundos",
      publicStatsAriaLabel: "Estatísticas públicas de utilização do AutoLister",
      publicStatsGenerationsLabel: "anúncios Vinted preparados",
      screenshotPreviewLabel: "Capturas da nova versão",
      screenshotPreviewHint: "Abrir em tamanho real",
      screenshotPreviewBadge: "Novo",
      screenshotPreviewPrimary: "Nova captura principal",
      screenshotPreviewSecondary: "Nova captura de funcionalidade",
      screenshotModalEyebrow: "Novas capturas AutoLister",
      screenshotModalHint:
        "Feche esta pré-visualização para continuar na página.",
      screenshotModalClose: "Fechar pré-visualização",
      screenshotModalCta: "Adicionar ao Chrome grátis",
      heroBullet1: "Cria títulos, descrições e hashtags a partir das suas fotos",
      heroBullet2: "Sem copiar e colar. Sem enviar fotos por email.",
      heroBullet3: "Revê cada rascunho antes de publicar",
      addToChrome: "Adicionar ao Chrome",
      addToChromeNote: "E gratis",
      testimonialQuote:
        "Muito mais rapido quando carrego varios artigos de uma vez. O primeiro rascunho fica pronto em segundos.",
      testimonialAuthor: "— Otília N., vendedora Vinted",
      tierProof: {
        ariaLabel: "Valor dos planos AutoLister",
        tierLabel: "Plano",
        chooseTier: "Experimente primeiro grátis",
        noCardRequired: "Não é necessário cartão",
        priceLabel: "por mês",
        comparisonLabel: "vs ChatGPT Plus",
        listingsLabel: "incluídos todos os meses",
        speedLabel: "das fotos ao rascunho",
        tiers: {
          starter: {
            name: "Starter",
            priceValue: "3,99 €",
            comparisonValue: "~80% mais barato",
            listingsValue: "75 anúncios",
            speedValue: "5 segundos em média",
          },
          pro: {
            name: "Pro",
            priceValue: "9,99 €",
            comparisonValue: "~50% mais barato",
            listingsValue: "250 anúncios",
            speedValue: "5 segundos em média",
          },
          business: {
            name: "Business",
            priceValue: "19,99 €",
            comparisonValue: "Preço comparável",
            listingsValue: "600 anúncios",
            speedValue: "5 segundos em média",
          },
        },
      },
      featuresTitle: "Um assistente de IA para rascunhos de anúncios",
      featuresSubtitle:
        "Transforme fotos dos artigos em títulos e descrições para rever.",
      feature1Title: "Rascunhos claros",
      feature1Body:
        "Crie um título e uma descrição com os detalhes visíveis nas fotos.",
      feature2Title: "Fluxo de Trabalho Fluido",
      feature2Body:
        "Passe das fotos para um rascunho editável diretamente na página do anúncio.",
      feature3Title: "Tecnologia IA Inteligente",
      feature3Body:
        "Impulsionado por modelos de linguagem avancados que compreendem tendencias de moda e melhores praticas Vinted.",
      howItWorksTitle: "Como funciona",
      howItWorksSubtitle: "Anuncios profissionais em tres passos simples",
      step1Title: "Instale a extensao",
      step1Body:
        "Adicione o gerador Vinted ao navegador em segundos. E gratis para comecar.",
      step2Title: "Adicione fotos e gere",
      step2Body:
        "Carregue as fotos e clique em Gerar para obter texto otimizado de imediato.",
      step3Title: "Reveja e publique",
      step3Body: "Reveja o rascunho, ajuste-o se necessário e publique quando estiver pronto.",
      finalCtaTitle: "Pronto para preparar o próximo anúncio?",
      finalCtaBody:
        "Use o AutoLister para preparar títulos e descrições editáveis a partir das suas fotos.",
      getStartedFree: "Comecar gratis",
    },
    pricing: {
      safetyBannerTitle: "Um assistente de IA em que você decide.",
      safetyZeroMass: "Nao precisa ligar a sua conta Vinted",
      safetyZeroApi: "Publica pessoalmente cada rascunho",
      safetyZeroBan: "Reveja antes de publicar",
      accountSafe: "Sob o seu controlo",
      mostPopular: "Mais popular",
      perMonth: "/mes",
      perForever: "/para sempre",
      freePlanName: "Teste gratuito",
      freePlanSubtitle: "Descubra o AutoLister AI",
      freePlanCta: "Experimentar gratis",
      starterPlanName: "Starter",
      starterPlanSubtitle: "Perfeito para vendedores ocasionais",
      starterPlanCta: "Escolher Starter",
      proPlanName: "Pro",
      proPlanSubtitle: "Para vendedores ativos",
      proPlanCta: "Escolher Pro",
      businessPlanName: "Business",
      businessPlanSubtitle: "Para revendedores e grandes volumes",
      businessPlanCta: "Escolher Business",
      creditPackEyebrow: "Reforco unico",
      creditPackTitle: "Precisa de um reforco unico?",
      creditPackBody:
        "Compre {credits} creditos extra para anuncios por {price}. Pagamento unico. Sem compromisso.",
      creditPackCta: "Comprar {credits} creditos",
      aiGeneratedTitles: "Titulos e descricoes gerados por IA",
      savedNote: "Nota de vendedor reutilizavel",
      phoneUpload: "Upload por telefone (brevemente so para Pro e Business)",
      seeIfYouLikeIt: "Experimente primeiro",
      everythingInStarter: "Tudo do Starter",
      changeAiTone: "Alterar tom de escrita IA",
      emojiSupport: "Suporte emoji",
      noDailyLimit: "Sem limite diario",
      listingsPerDay: "/ dia",
      listingsPerMonth: "/ mes",
      everythingInPro: "Tudo do Pro",
      highestDailyLimits: "Maiores limites diarios",
      dedicatedSupport: "Suporte dedicado",
      priorityProcessing: "Processamento prioritario",
      noCard: "Sem cartao de credito",
      instantAccess: "Acesso imediato a funcionalidades gratuitas.",
      helpChoosing: "Precisa de ajuda para escolher?",
      emailSupport: "Enviar email ao suporte ->",
    },
  },
};
