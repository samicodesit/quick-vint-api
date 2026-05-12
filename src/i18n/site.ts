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
};

type HomeCopy = {
  seoTitle: string;
  seoDescription: string;
  heroTitle: string;
  heroSubtitle: string;
  heroBadgeSafe: string;
  heroBulletSafety: string;
  comparisonTitle: string;
  comparisonSubtitle: string;
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
    },
    home: {
      seoTitle: "AutoLister AI - The #1 Vinted Description Generator & Lister",
      seoDescription:
        "The best AI Vinted lister that generates descriptions from photos. Stop typing and start selling with our automatic Vinted description generator. 100% account-safe, ban-free alternative to Vinted bots.",
      heroTitle: "The Only AI Vinted Lister You Need.",
      heroSubtitle:
        "Save time on thinking and typing. AutoLister is the Vinted description generator that turns photos into fully optimized listings in seconds.",
      heroBadgeSafe: "100% Account-Safe · Vinted ToS Compliant",
      heroBulletSafety:
        "Zero ban risk - never hooks into Vinted's servers like automation bots do",
      comparisonTitle: "AutoLister vs. DotB & Vintex",
      comparisonSubtitle:
        "DotB and Vintex sell automation bots - 500 daily mass-actions that hook into Vinted's private API. That's a fundamentally different product, with fundamentally different consequences for your account.",
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
    },
    home: {
      seoTitle: "AutoLister AI - Le meilleur générateur de descriptions Vinted",
      seoDescription:
        "Le meilleur outil IA pour Vinted qui génère des descriptions depuis des photos, rapidement et en toute sécurité.",
      heroTitle: "Le seul assistant IA Vinted dont vous avez besoin.",
      heroSubtitle:
        "Gagnez du temps. AutoLister transforme vos photos en annonces Vinted optimisées en quelques secondes.",
      heroBadgeSafe: "100% Sécurisé · Conforme aux règles Vinted",
      heroBulletSafety:
        "Risque de ban nul - aucune connexion aux serveurs Vinted comme les bots",
      comparisonTitle: "AutoLister vs DotB et Vintex",
      comparisonSubtitle:
        "DotB et Vintex vendent des bots d'automatisation. AutoLister reste un assistant de contenu sûr.",
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
    },
    home: {
      seoTitle: "AutoLister AI - Der beste Vinted-Beschreibungsgenerator",
      seoDescription:
        "Der beste KI-Textgenerator fur Vinted. Erstelle bessere Inserate aus Fotos in Sekunden.",
      heroTitle: "Der einzige KI-Vinted-Assistent, den du brauchst.",
      heroSubtitle:
        "Spare Zeit beim Schreiben. AutoLister verwandelt Fotos in optimierte Vinted-Inserate in Sekunden.",
      heroBadgeSafe: "100% Sicher · Vinted-Regelkonform",
      heroBulletSafety:
        "Kein Bannrisiko - keine Verbindung zu Vinted-Servern wie bei Bots",
      comparisonTitle: "AutoLister vs. DotB & Vintex",
      comparisonSubtitle:
        "DotB und Vintex sind Automatisierungsbots. AutoLister ist ein sicherer Content-Assistent.",
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
    },
    home: {
      seoTitle: "AutoLister AI - De beste Vinted beschrijving generator",
      seoDescription:
        "Maak Vinted-beschrijvingen met AI vanuit foto's, snel en veilig.",
      heroTitle: "De enige AI Vinted-assistent die je nodig hebt.",
      heroSubtitle:
        "Bespaar tijd met typen. AutoLister zet foto's om naar geoptimaliseerde Vinted-teksten in seconden.",
      heroBadgeSafe: "100% Veilig · Vinted-conform",
      heroBulletSafety:
        "Geen ban-risico - geen koppeling met Vinted-servers zoals bots",
      comparisonTitle: "AutoLister vs. DotB & Vintex",
      comparisonSubtitle:
        "DotB en Vintex zijn automatiseringsbots. AutoLister is een veilige contenttool.",
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
    },
    home: {
      seoTitle: "AutoLister AI - Najlepszy generator opisow Vinted",
      seoDescription:
        "Tworz opisy Vinted z AI na podstawie zdjec szybko i bezpiecznie.",
      heroTitle: "Jeden asystent AI do Vinted, ktorego potrzebujesz.",
      heroSubtitle:
        "Oszczedzaj czas na pisaniu. AutoLister zamienia zdjecia w zoptymalizowane oferty Vinted w kilka sekund.",
      heroBadgeSafe: "100% Bezpieczne · Zgodne z zasadami Vinted",
      heroBulletSafety:
        "Brak ryzyka bana - brak polaczen z serwerami Vinted jak w botach",
      comparisonTitle: "AutoLister vs. DotB i Vintex",
      comparisonSubtitle:
        "DotB i Vintex to boty automatyzujace. AutoLister to bezpieczny generator tresci.",
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
    },
    home: {
      seoTitle:
        "AutoLister AI - El mejor generador de descripciones para Vinted",
      seoDescription:
        "Genera descripciones para Vinted desde fotos con IA, rapido y seguro.",
      heroTitle: "El unico asistente IA para Vinted que necesitas.",
      heroSubtitle:
        "Ahorra tiempo al escribir. AutoLister convierte fotos en anuncios optimizados para Vinted en segundos.",
      heroBadgeSafe: "100% Seguro · Cumple normas de Vinted",
      heroBulletSafety:
        "Riesgo de baneo cero - sin conexion a servidores de Vinted como los bots",
      comparisonTitle: "AutoLister vs. DotB y Vintex",
      comparisonSubtitle:
        "DotB y Vintex son bots de automatizacion. AutoLister es un asistente de contenido seguro.",
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
    },
    home: {
      seoTitle: "AutoLister AI - Il miglior generatore di descrizioni Vinted",
      seoDescription:
        "Genera descrizioni Vinted da foto con IA, in modo rapido e sicuro.",
      heroTitle: "L'unico assistente IA per Vinted di cui hai bisogno.",
      heroSubtitle:
        "Risparmia tempo. AutoLister trasforma le foto in annunci Vinted ottimizzati in pochi secondi.",
      heroBadgeSafe: "100% Sicuro · Conforme alle regole Vinted",
      heroBulletSafety:
        "Rischio ban zero - nessun collegamento ai server Vinted come i bot",
      comparisonTitle: "AutoLister vs. DotB e Vintex",
      comparisonSubtitle:
        "DotB e Vintex sono bot di automazione. AutoLister e un assistente di contenuti sicuro.",
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
    },
    home: {
      seoTitle: "AutoLister AI - O melhor gerador de descricoes para Vinted",
      seoDescription:
        "Crie descricoes para Vinted a partir de fotos com IA, de forma rapida e segura.",
      heroTitle: "O unico assistente IA para Vinted de que precisa.",
      heroSubtitle:
        "Poupe tempo a escrever. O AutoLister transforma fotos em anuncios Vinted otimizados em segundos.",
      heroBadgeSafe: "100% Seguro · Em conformidade com a Vinted",
      heroBulletSafety:
        "Risco de banimento zero - sem ligacoes aos servidores da Vinted como bots",
      comparisonTitle: "AutoLister vs. DotB e Vintex",
      comparisonSubtitle:
        "DotB e Vintex sao bots de automacao. O AutoLister e um assistente de conteudo seguro.",
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
  watchDemo: string;
  videoCaption: string;
  // Hero bullets
  heroBullet1: string;
  heroBullet2: string;
  heroBullet3: string;
  addToChrome: string;
  addToChromeNote: string;
  // Safety section
  safetyHeading: string;
  safetyBody: string;
  safetyNativeBadge: string;
  safetyCoreBadge: string;
  safetyCoreTitle: string;
  safetyCoreSubtitle: string;
  safetyCoreBody: string;
  safetyStatBotRiskLabel: string;
  safetyStatBotRiskNote: string;
  safetyStatAlRiskLabel: string;
  safetyStatAlRiskNote: string;
  safetyFeature1Title: string;
  safetyFeature1Body: string;
  safetyFeature2Title: string;
  safetyFeature2Body: string;
  safetyFeature3Title: string;
  safetyFeature3Body: string;
  // Comparison section
  comparisonBadge: string;
  comparisonBotSubtitle: string;
  comparisonAlSubtitle: string;
  comparisonSafeChoice: string;
  comparisonBotBullet1Title: string;
  comparisonBotBullet1Body: string;
  comparisonBotBullet2Title: string;
  comparisonBotBullet2Body: string;
  comparisonBotBullet3Title: string;
  comparisonBotBullet3Body: string;
  comparisonBotBullet4Title: string;
  comparisonBotBullet4Body: string;
  comparisonAlBullet1Title: string;
  comparisonAlBullet1Body: string;
  comparisonAlBullet2Title: string;
  comparisonAlBullet2Body: string;
  comparisonAlBullet3Title: string;
  comparisonAlBullet3Body: string;
  comparisonAlBullet4Title: string;
  comparisonAlBullet4Body: string;
  comparisonFootnote: string;
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
  // Shared feature bullets
  aiGeneratedTitles: string;
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
      watchDemo: "Watch Demo",
      videoCaption: "See how it works in 15 seconds",
      heroBullet1:
        "Generates SEO-ready titles, descriptions, and hashtags automatically",
      heroBullet2: "No copy-paste needed. No emailing photos.",
      heroBullet3: "Compliant with Vinted terms of service",
      addToChrome: "Add to Chrome",
      addToChromeNote: "It's Free",
      safetyHeading: "Zero Risk. 100% Control.",
      safetyBody:
        "Unlike DotB and Vintex — which hook into Vinted's private API to mass auto-follow and auto-like — AutoLister operates strictly as a browser productivity tool. It writes text for you. Nothing more.",
      safetyNativeBadge: "100% Native Browser Extension",
      safetyCoreBadge: "The Core Difference",
      safetyCoreTitle: "The risk is not AI.",
      safetyCoreSubtitle: "The risk is automating actions on Vinted.",
      safetyCoreBody:
        "AutoLister acts exactly like a human typing very fast. We never touch private APIs or automate likes/follows. Zero mass actions.",
      safetyStatBotRiskLabel: "Bot ban risk",
      safetyStatBotRiskNote: "Reported by sellers within weeks",
      safetyStatAlRiskLabel: "AutoLister risk",
      safetyStatAlRiskNote: "0 mass actions. 0 API access.",
      safetyFeature1Title: "No API Access",
      safetyFeature1Body:
        "We never touch Vinted's internal code or private endpoints — zero Cloudflare triggers.",
      safetyFeature2Title: "Human-Paced",
      safetyFeature2Body:
        "We fill in text fields for you — like a very fast typist. No mass actions, no spam loops.",
      safetyFeature3Title: "Your Wallet Stays Safe",
      safetyFeature3Body:
        "You review every listing before it goes live. Your Vinted wallet and account are never at risk.",
      comparisonBadge: "Honest Comparison",
      comparisonBotSubtitle: "Vinted automation bots",
      comparisonAlSubtitle: "AI content generator",
      comparisonSafeChoice: "Safe Choice",
      comparisonBotBullet1Title: "High account ban risk",
      comparisonBotBullet1Body:
        "Hook into Vinted's private API — community reports bans within weeks of use",
      comparisonBotBullet2Title: "Cloudflare bot detection triggers",
      comparisonBotBullet2Body:
        "500 daily auto-likes & auto-follows flag your account as automated traffic",
      comparisonBotBullet3Title: "Violates Vinted's Terms of Service",
      comparisonBotBullet3Body:
        "Automating Vinted actions via private API is explicitly prohibited in their ToS",
      comparisonBotBullet4Title: "Your Vinted wallet at risk",
      comparisonBotBullet4Body:
        "Account ban = wallet frozen. Any money on the platform could be locked instantly",
      comparisonAlBullet1Title: "Zero ban risk",
      comparisonAlBullet1Body:
        "Reads your photo, writes your listing text — identical behaviour to a human seller",
      comparisonAlBullet2Title: "Zero Cloudflare triggers",
      comparisonAlBullet2Body:
        "No private API calls. No mass actions. Completely invisible to bot detection.",
      comparisonAlBullet3Title: "100% Vinted ToS compliant",
      comparisonAlBullet3Body:
        "A writing assistant, not a bot. Helps you create better listings, fully within the rules.",
      comparisonAlBullet4Title: "Your wallet stays protected",
      comparisonAlBullet4Body:
        "No account risk, no frozen funds. List more, worry less.",
      comparisonFootnote:
        "Comparison based on publicly advertised features of DotB and Vintex as of 2025. AutoLister AI is not affiliated with or endorsed by Vinted.",
      featuresTitle: "A Faster Way to Sell on Vinted",
      featuresSubtitle:
        "Snap. Scan. Sell. From your camera roll to Vinted listing in just a few seconds.",
      feature1Title: "Conversion-Optimized",
      feature1Body:
        "Every title and description is crafted to maximize appeal and drive sales using proven copywriting principles.",
      feature2Title: "Seamless Workflow",
      feature2Body:
        "No more excuses for not selling those clothes lying around. Experience the seamless flow from photo to published listing.",
      feature3Title: "Smart AI Technology",
      feature3Body:
        "Powered by advanced language models that understand fashion trends, buyer psychology, and Vinted best practices.",
      howItWorksTitle: "How It Works",
      howItWorksSubtitle: "Get professional listings in three simple steps",
      step1Title: "Install Extension",
      step1Body:
        "Add the Vinted generator to your browser in seconds. It's free to get started.",
      step2Title: "Add Photos & Generate",
      step2Body:
        "Upload photos directly to Vinted, or use our mobile feature to snap and sync. Then just click Generate.",
      step3Title: "Publish & Sell",
      step3Body:
        "Review, customize if needed, and publish your optimized listing. Watch your sales improve!",
      finalCtaTitle: "Ready to Transform Your Vinted Sales?",
      finalCtaBody:
        "Join thousands of successful sellers who use AutoLister to create professional listings that sell faster. Turn your closet into a boutique today.",
      getStartedFree: "Get Started Free",
    },
    pricing: {
      safetyBannerTitle:
        "The only Vinted tool your account is genuinely safe with.",
      safetyZeroMass: "0 mass actions",
      safetyZeroApi: "0 API hooks",
      safetyZeroBan: "0 ban risk",
      accountSafe: "Account-Safe",
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
      aiGeneratedTitles: "AI-generated titles & descriptions",
      phoneUpload: "Phone upload (Soon only available to Pro and Business)",
      seeIfYouLikeIt: "See if you like it first",
      everythingInStarter: "Everything in Starter",
      changeAiTone: "Change AI writing tone",
      emojiSupport: "Emoji Support",
      noDailyLimit: "No Daily Limit",
      listingsPerDay: "listings per day",
      listingsPerMonth: "listings per month",
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
      watchDemo: "Voir la démo",
      videoCaption: "Voyez le résultat en 15 secondes",
      heroBullet1:
        "Génère des titres, descriptions et hashtags SEO automatiquement",
      heroBullet2: "Aucun copier-coller. Aucun envoi de photos par e-mail.",
      heroBullet3: "Conforme aux conditions générales de Vinted",
      addToChrome: "Ajouter à Chrome",
      addToChromeNote: "C'est gratuit",
      safetyHeading: "Zéro risque. 100% de contrôle.",
      safetyBody:
        "Contrairement à DotB et Vintex — qui se connectent à l'API privée de Vinted — AutoLister est un simple outil de rédaction. Il écrit du texte pour vous. Rien de plus.",
      safetyNativeBadge: "Extension navigateur 100% native",
      safetyCoreBadge: "La différence clé",
      safetyCoreTitle: "Le risque n'est pas l'IA.",
      safetyCoreSubtitle:
        "Le risque, c'est l'automatisation des actions sur Vinted.",
      safetyCoreBody:
        "AutoLister agit comme un humain qui tape très vite. Nous n'utilisons jamais d'API privée et n'automatisons ni likes ni follows. Zéro action de masse.",
      safetyStatBotRiskLabel: "Risque de ban",
      safetyStatBotRiskNote: "Signalé par des vendeurs en quelques semaines",
      safetyStatAlRiskLabel: "Risque AutoLister",
      safetyStatAlRiskNote: "0 action de masse. 0 accès API.",
      safetyFeature1Title: "Pas d'accès API",
      safetyFeature1Body:
        "Nous ne touchons jamais au code interne de Vinted — zéro déclenchement Cloudflare.",
      safetyFeature2Title: "Rythme humain",
      safetyFeature2Body:
        "Nous remplissons les champs à votre place — comme un dactylo très rapide. Aucune action de masse.",
      safetyFeature3Title: "Votre portefeuille reste en sécurité",
      safetyFeature3Body:
        "Vous relisez chaque annonce avant publication. Votre compte et portefeuille Vinted ne sont jamais en danger.",
      comparisonBadge: "Comparaison honnête",
      comparisonBotSubtitle: "Bots d'automatisation Vinted",
      comparisonAlSubtitle: "Générateur de contenu IA",
      comparisonSafeChoice: "Choix sûr",
      comparisonBotBullet1Title: "Risque élevé de bannissement",
      comparisonBotBullet1Body:
        "Se connectent à l'API privée de Vinted — des bans signalés en quelques semaines",
      comparisonBotBullet2Title: "Déclenchement détection Cloudflare",
      comparisonBotBullet2Body:
        "500 auto-likes et auto-follows par jour marquent votre compte comme automatisé",
      comparisonBotBullet3Title: "Violation des CGU de Vinted",
      comparisonBotBullet3Body:
        "L'automatisation via API privée est explicitement interdite par les CGU Vinted",
      comparisonBotBullet4Title: "Votre portefeuille Vinted en danger",
      comparisonBotBullet4Body:
        "Bannissement = portefeuille gelé. Tout l'argent sur la plateforme peut être bloqué instantanément",
      comparisonAlBullet1Title: "Zéro risque de ban",
      comparisonAlBullet1Body:
        "Lit votre photo, rédige votre annonce — comportement identique à un vendeur humain",
      comparisonAlBullet2Title: "Zéro déclenchement Cloudflare",
      comparisonAlBullet2Body:
        "Aucun appel API privé. Aucune action de masse. Totalement invisible pour la détection de bots.",
      comparisonAlBullet3Title: "100% conforme aux CGU Vinted",
      comparisonAlBullet3Body:
        "Un assistant de rédaction, pas un bot. Aide à créer de meilleures annonces dans le respect des règles.",
      comparisonAlBullet4Title: "Votre portefeuille reste protégé",
      comparisonAlBullet4Body:
        "Aucun risque de compte, aucun fonds gelé. Listez plus, stressez moins.",
      comparisonFootnote:
        "Comparaison basée sur les fonctionnalités publiquement annoncées de DotB et Vintex en 2025. AutoLister AI n'est pas affilié à Vinted.",
      featuresTitle: "Une façon plus rapide de vendre sur Vinted",
      featuresSubtitle:
        "Photo. Analyse. Vente. Passez de votre galerie à une annonce Vinted en quelques secondes.",
      feature1Title: "Optimisé pour la conversion",
      feature1Body:
        "Chaque titre et description est rédigé pour maximiser l'attrait et stimuler les ventes.",
      feature2Title: "Intégration fluide",
      feature2Body:
        "Fini les excuses. De la photo à l'annonce publiée, le flux est entièrement fluide.",
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
      step3Title: "Publiez et vendez",
      step3Body:
        "Révisez, ajustez si besoin, puis publiez votre annonce optimisée.",
      finalCtaTitle: "Prêt à booster vos ventes Vinted ?",
      finalCtaBody:
        "Rejoignez des milliers de vendeurs qui utilisent AutoLister pour vendre plus vite.",
      getStartedFree: "Commencer gratuitement",
    },
    pricing: {
      safetyBannerTitle: "Le seul outil Vinted vraiment sûr pour votre compte.",
      safetyZeroMass: "0 action de masse",
      safetyZeroApi: "0 accès API",
      safetyZeroBan: "0 risque de ban",
      accountSafe: "Sécurisé",
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
      aiGeneratedTitles: "Titres et descriptions générés par IA",
      phoneUpload: "Photo depuis mobile (bientôt réservé Pro et Business)",
      seeIfYouLikeIt: "Testez avant de vous engager",
      everythingInStarter: "Tout ce qu'inclut Starter",
      changeAiTone: "Changer le ton de rédaction IA",
      emojiSupport: "Support emoji",
      noDailyLimit: "Sans limite quotidienne",
      listingsPerDay: "annonces par jour",
      listingsPerMonth: "annonces par mois",
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
      watchDemo: "Demo ansehen",
      videoCaption: "So funktioniert es in 15 Sekunden",
      heroBullet1:
        "Erstellt SEO-optimierte Titel, Beschreibungen und Hashtags automatisch",
      heroBullet2: "Kein Kopieren und Einfugen. Keine Fotos per E-Mail senden.",
      heroBullet3: "Konform mit den Vinted-Nutzungsbedingungen",
      addToChrome: "Zu Chrome hinzufugen",
      addToChromeNote: "Kostenlos",
      safetyHeading: "Null Risiko. 100% Kontrolle.",
      safetyBody:
        "Anders als DotB und Vintex — die sich in Vinteds private API einklinken — arbeitet AutoLister rein als Browser-Produktivitatswerkzeug. Es schreibt Text fur dich. Nichts weiter.",
      safetyNativeBadge: "100% native Browser-Erweiterung",
      safetyCoreBadge: "Der Kernunterschied",
      safetyCoreTitle: "Das Risiko ist nicht KI.",
      safetyCoreSubtitle:
        "Das Risiko ist die Automatisierung von Aktionen auf Vinted.",
      safetyCoreBody:
        "AutoLister verhallt sich wie ein Mensch, der sehr schnell tippt. Wir nutzen keine privaten APIs und automatisieren keine Likes oder Follows. Null Massenaktionen.",
      safetyStatBotRiskLabel: "Bot-Bannrisiko",
      safetyStatBotRiskNote: "Von Verkaufern innerhalb von Wochen gemeldet",
      safetyStatAlRiskLabel: "AutoLister-Risiko",
      safetyStatAlRiskNote: "0 Massenaktionen. 0 API-Zugriff.",
      safetyFeature1Title: "Kein API-Zugriff",
      safetyFeature1Body:
        "Wir beruhren niemals Vinteds internen Code oder private Endpunkte — null Cloudflare-Trigger.",
      safetyFeature2Title: "Menschliches Tempo",
      safetyFeature2Body:
        "Wir fullen Textfelder fur dich — wie ein sehr schneller Tippist. Keine Massenaktionen, keine Spam-Schleifen.",
      safetyFeature3Title: "Dein Guthaben bleibt sicher",
      safetyFeature3Body:
        "Du prufst jede Anzeige bevor sie live geht. Dein Vinted-Guthaben und Konto sind niemals in Gefahr.",
      comparisonBadge: "Ehrlicher Vergleich",
      comparisonBotSubtitle: "Vinted-Automatisierungsbots",
      comparisonAlSubtitle: "KI-Inhaltsgenerator",
      comparisonSafeChoice: "Sichere Wahl",
      comparisonBotBullet1Title: "Hohes Konto-Bannrisiko",
      comparisonBotBullet1Body:
        "Klinken sich in Vinteds private API ein — Community berichtet von Bans innerhalb von Wochen",
      comparisonBotBullet2Title: "Cloudflare-Bot-Erkennung ausgelost",
      comparisonBotBullet2Body:
        "500 tagliche Auto-Likes und Auto-Follows markieren dein Konto als automatisierten Traffic",
      comparisonBotBullet3Title: "Verstost gegen Vinteds Nutzungsbedingungen",
      comparisonBotBullet3Body:
        "Die Automatisierung uber private API ist explizit in Vinteds AGB verboten",
      comparisonBotBullet4Title: "Dein Vinted-Guthaben in Gefahr",
      comparisonBotBullet4Body:
        "Konto-Ban = Guthaben eingefroren. Jedes Geld auf der Plattform konnte sofort gesperrt werden",
      comparisonAlBullet1Title: "Null Bannrisiko",
      comparisonAlBullet1Body:
        "Liest dein Foto, schreibt deinen Anzeigentext — identisches Verhalten wie ein menschlicher Verkaufer",
      comparisonAlBullet2Title: "Null Cloudflare-Trigger",
      comparisonAlBullet2Body:
        "Keine privaten API-Aufrufe. Keine Massenaktionen. Vollig unsichtbar fur Bot-Erkennung.",
      comparisonAlBullet3Title: "100% Vinted-AGB-konform",
      comparisonAlBullet3Body:
        "Ein Schreibassistent, kein Bot. Hilft dir bessere Anzeigen zu erstellen, vollstandig nach Regeln.",
      comparisonAlBullet4Title: "Dein Guthaben bleibt geschutzt",
      comparisonAlBullet4Body:
        "Kein Kontorisiko, keine gesperrten Mittel. Mehr inserieren, weniger sorgen.",
      comparisonFootnote:
        "Vergleich basiert auf offentlich beworbenen Funktionen von DotB und Vintex Stand 2025. AutoLister AI ist nicht mit Vinted verbunden.",
      featuresTitle: "Schneller auf Vinted verkaufen",
      featuresSubtitle:
        "Foto. Analyse. Verkauf. Von der Galerie zur fertigen Vinted-Anzeige in Sekunden.",
      feature1Title: "Conversion-Optimiert",
      feature1Body:
        "Jeder Titel und jede Beschreibung ist darauf ausgelegt, Kaufinteresse zu maximieren und Verkaufe zu steigern.",
      feature2Title: "Nahtloser Ablauf",
      feature2Body:
        "Keine Ausreden mehr. Von der Foto bis zur Veroffentlichung lauft alles nahtlos.",
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
      step3Title: "Veroffentlichen und verkaufen",
      step3Body:
        "Prufen, anpassen und veroffentlichen. So verkaufst du schneller.",
      finalCtaTitle: "Bereit, deine Vinted-Verkaufe zu steigern?",
      finalCtaBody:
        "Tausende Seller nutzen AutoLister fur professionelle Anzeigen, die schneller verkaufen.",
      getStartedFree: "Kostenlos starten",
    },
    pricing: {
      safetyBannerTitle:
        "Das einzige Vinted-Tool, das dein Konto wirklich schutzt.",
      safetyZeroMass: "0 Massenaktionen",
      safetyZeroApi: "0 API-Zugriffe",
      safetyZeroBan: "0 Bannrisiko",
      accountSafe: "Kontosicher",
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
      aiGeneratedTitles: "KI-generierte Titel und Beschreibungen",
      phoneUpload: "Foto-Upload per Handy (bald nur fur Pro und Business)",
      seeIfYouLikeIt: "Testen, bevor du dich entscheidest",
      everythingInStarter: "Alles aus Starter",
      changeAiTone: "KI-Schreibton andern",
      emojiSupport: "Emoji-Unterstutzung",
      noDailyLimit: "Kein Tageslimit",
      listingsPerDay: "Inserate pro Tag",
      listingsPerMonth: "Inserate pro Monat",
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
      watchDemo: "Bekijk demo",
      videoCaption: "Zie hoe het werkt in 15 seconden",
      heroBullet1:
        "Genereert automatisch SEO-klare titels, beschrijvingen en hashtags",
      heroBullet2: "Geen kopieer-plak. Geen foto's mailen.",
      heroBullet3: "Conform de voorwaarden van Vinted",
      addToChrome: "Toevoegen aan Chrome",
      addToChromeNote: "Gratis",
      safetyHeading: "Nul risico. 100% controle.",
      safetyBody:
        "In tegenstelling tot DotB en Vintex — die zich koppelen aan Vinteds prive-API — werkt AutoLister puur als een browser-productiviteitstool. Het schrijft tekst voor jou. Niets meer.",
      safetyNativeBadge: "100% native browser-extensie",
      safetyCoreBadge: "Het kernverschil",
      safetyCoreTitle: "Het risico is niet AI.",
      safetyCoreSubtitle:
        "Het risico is het automatiseren van acties op Vinted.",
      safetyCoreBody:
        "AutoLister gedraagt zich precies als een mens die heel snel typt. We gebruiken geen prive-API's en automatiseren geen likes of follows. Nul massa-acties.",
      safetyStatBotRiskLabel: "Bot-banrisico",
      safetyStatBotRiskNote: "Gemeld door verkopers binnen weken",
      safetyStatAlRiskLabel: "AutoLister-risico",
      safetyStatAlRiskNote: "0 massa-acties. 0 API-toegang.",
      safetyFeature1Title: "Geen API-toegang",
      safetyFeature1Body:
        "We raken nooit Vinteds interne code of prive-endpoints aan — nul Cloudflare-triggers.",
      safetyFeature2Title: "Menselijk tempo",
      safetyFeature2Body:
        "We vullen tekstvelden voor jou in — als een heel snelle typist. Geen massa-acties, geen spam-loops.",
      safetyFeature3Title: "Je saldo blijft veilig",
      safetyFeature3Body:
        "Je controleert elke listing voor publicatie. Je Vinted-saldo en account zijn nooit in gevaar.",
      comparisonBadge: "Eerlijke vergelijking",
      comparisonBotSubtitle: "Vinted-automatiseringsbots",
      comparisonAlSubtitle: "AI-contentgenerator",
      comparisonSafeChoice: "Veilige keuze",
      comparisonBotBullet1Title: "Hoog account-banrisico",
      comparisonBotBullet1Body:
        "Koppelen aan Vinteds prive-API — bans gemeld door de community binnen weken van gebruik",
      comparisonBotBullet2Title: "Cloudflare-botdetectie getriggerd",
      comparisonBotBullet2Body:
        "500 dagelijkse auto-likes en auto-follows markeren je account als geautomatiseerd verkeer",
      comparisonBotBullet3Title: "Schendt Vinteds gebruiksvoorwaarden",
      comparisonBotBullet3Body:
        "Automatisering via prive-API is uitdrukkelijk verboden in de Vinted-voorwaarden",
      comparisonBotBullet4Title: "Je Vinted-saldo in gevaar",
      comparisonBotBullet4Body:
        "Account-ban = saldo bevroren. Al het geld op het platform kan direct worden geblokkeerd",
      comparisonAlBullet1Title: "Nul banrisico",
      comparisonAlBullet1Body:
        "Leest je foto, schrijft je listingtekst — identiek gedrag als een menselijke verkoper",
      comparisonAlBullet2Title: "Nul Cloudflare-triggers",
      comparisonAlBullet2Body:
        "Geen prive-API-aanroepen. Geen massa-acties. Volledig onzichtbaar voor botdetectie.",
      comparisonAlBullet3Title: "100% conform Vinted-voorwaarden",
      comparisonAlBullet3Body:
        "Een schrijfassistent, geen bot. Helpt je betere listings te maken, volledig binnen de regels.",
      comparisonAlBullet4Title: "Je saldo blijft beschermd",
      comparisonAlBullet4Body:
        "Geen accountrisico, geen bevroren fondsen. Meer listen, minder zorgen.",
      comparisonFootnote:
        "Vergelijking gebaseerd op publiek geadverteerde functies van DotB en Vintex per 2025. AutoLister AI is niet gelieerd aan Vinted.",
      featuresTitle: "Sneller verkopen op Vinted",
      featuresSubtitle:
        "Foto. Scan. Verkoop. Van je camera-rol naar een Vinted listing in seconden.",
      feature1Title: "Conversie-Geoptimaliseerd",
      feature1Body:
        "Elke titel en beschrijving is gemaakt om aantrekkelijkheid te maximaliseren en verkopen te stimuleren.",
      feature2Title: "Naadloze Workflow",
      feature2Body:
        "Geen excuses meer. Van foto tot gepubliceerde listing verloopt alles naadloos.",
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
      step3Title: "Publiceer en verkoop",
      step3Body:
        "Controleer, pas aan en publiceer. Verkoop sneller met minder werk.",
      finalCtaTitle: "Klaar om je Vinted-verkoop te versnellen?",
      finalCtaBody:
        "Sluit je aan bij duizenden verkopers die AutoLister gebruiken om sneller te verkopen.",
      getStartedFree: "Gratis beginnen",
    },
    pricing: {
      safetyBannerTitle:
        "De enige Vinted-tool die je account echt veilig houdt.",
      safetyZeroMass: "0 massa-acties",
      safetyZeroApi: "0 API-koppelingen",
      safetyZeroBan: "0 ban-risico",
      accountSafe: "Accountveilig",
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
      aiGeneratedTitles: "AI-gegenereerde titels en beschrijvingen",
      phoneUpload:
        "Foto-upload via telefoon (binnenkort alleen Pro en Business)",
      seeIfYouLikeIt: "Probeer het eerst",
      everythingInStarter: "Alles van Starter",
      changeAiTone: "AI-schrijftoon aanpassen",
      emojiSupport: "Emoji-ondersteuning",
      noDailyLimit: "Geen daglimiet",
      listingsPerDay: "listings per dag",
      listingsPerMonth: "listings per maand",
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
      watchDemo: "Obejrzyj demo",
      videoCaption: "Zobacz jak to dziala w 15 sekund",
      heroBullet1:
        "Automatycznie generuje tytuly, opisy i hashtagi zoptymalizowane pod SEO",
      heroBullet2: "Bez kopiowania i wklejania. Bez wysylania zdjec mailem.",
      heroBullet3: "Zgodne z regulaminem Vinted",
      addToChrome: "Dodaj do Chrome",
      addToChromeNote: "To jest darmowe",
      safetyHeading: "Zero ryzyka. 100% kontroli.",
      safetyBody:
        "W przeciwienstwie do DotB i Vintex — ktore lacza sie z prywatnym API Vinted — AutoLister dziala wylacznie jako narzedzie produktywnosci. Pisze dla Ciebie tekst. Nic wiecej.",
      safetyNativeBadge: "100% natywne rozszerzenie przegladarki",
      safetyCoreBadge: "Kluczowa roznica",
      safetyCoreTitle: "Ryzykiem nie jest AI.",
      safetyCoreSubtitle: "Ryzykiem jest automatyzowanie akcji na Vinted.",
      safetyCoreBody:
        "AutoLister dziala jak czlowiek, ktory bardzo szybko pisze. Nie korzystamy z prywatnych API i nie automatyzujemy polubien ani obserwacji. Zero akcji masowych.",
      safetyStatBotRiskLabel: "Ryzyko bana bota",
      safetyStatBotRiskNote:
        "Zglaszane przez sprzedawcow w ciagu kilku tygodni",
      safetyStatAlRiskLabel: "Ryzyko AutoLister",
      safetyStatAlRiskNote: "0 akcji masowych. 0 dostep API.",
      safetyFeature1Title: "Bez dostepu do API",
      safetyFeature1Body:
        "Nigdy nie dotykamy wewnetrznego kodu Vinted ani prywatnych endpointow — zero wyzwalan Cloudflare.",
      safetyFeature2Title: "Ludzkie tempo",
      safetyFeature2Body:
        "Wypelniamy za Ciebie pola tekstowe — jak bardzo szybki maszynista. Bez akcji masowych, bez petli spamu.",
      safetyFeature3Title: "Twoj portfel pozostaje bezpieczny",
      safetyFeature3Body:
        "Przegladsz kazde ogloszenie przed publikacja. Twoj portfel Vinted i konto nigdy nie sa zagrozone.",
      comparisonBadge: "Uczciwe porownanie",
      comparisonBotSubtitle: "Boty automatyzujace Vinted",
      comparisonAlSubtitle: "Generator tresci AI",
      comparisonSafeChoice: "Bezpieczny wybor",
      comparisonBotBullet1Title: "Wysokie ryzyko bana konta",
      comparisonBotBullet1Body:
        "Lacza sie z prywatnym API Vinted — spolecznosc zglosila bany juz po kilku tygodniach",
      comparisonBotBullet2Title: "Wyzwolenie wykrywania botow Cloudflare",
      comparisonBotBullet2Body:
        "500 dziennych auto-polubien i auto-obserwacji oznacza Twoje konto jako automatyczny ruch",
      comparisonBotBullet3Title: "Narusza regulamin Vinted",
      comparisonBotBullet3Body:
        "Automatyzacja via prywatne API jest wyraznie zabroniona w regulaminie Vinted",
      comparisonBotBullet4Title: "Twoj portfel Vinted jest zagrozony",
      comparisonBotBullet4Body:
        "Ban konta = zamrozony portfel. Kazde pieniadze na platformie moga byc zablokowane natychmiast",
      comparisonAlBullet1Title: "Zero ryzyka bana",
      comparisonAlBullet1Body:
        "Odczytuje Twoje zdjecie, pisze tekst ogloszenia — zachowanie identyczne z ludzkim sprzedawca",
      comparisonAlBullet2Title: "Zero wyzwalan Cloudflare",
      comparisonAlBullet2Body:
        "Brak prywatnych wywolan API. Brak akcji masowych. Calkowicie niewidoczny dla wykrywania botow.",
      comparisonAlBullet3Title: "100% zgodny z regulaminem Vinted",
      comparisonAlBullet3Body:
        "Asystent pisania, nie bot. Pomaga tworzyc lepsze ogloszenia, w pelni zgodnie z zasadami.",
      comparisonAlBullet4Title: "Twoj portfel pozostaje chroniony",
      comparisonAlBullet4Body:
        "Brak ryzyka konta, brak zamrozonych srodkow. Wiecej sprzedawaj, mniej sie martw.",
      comparisonFootnote:
        "Porownanie oparte na publicznie reklamowanych funkcjach DotB i Vintex z 2025 roku. AutoLister AI nie jest powiazany z Vinted.",
      featuresTitle: "Szybsza sprzedaz na Vinted",
      featuresSubtitle:
        "Zdjecie. Analiza. Sprzedaz. Od galerii do gotowego ogloszenia Vinted w kilka sekund.",
      feature1Title: "Zoptymalizowane pod konwersje",
      feature1Body:
        "Kazdy tytul i opis jest stworzony tak, aby maksymalizowac atrakcyjnosc i napedzac sprzedaz.",
      feature2Title: "Plynna praca",
      feature2Body:
        "Nie ma juz wymowek. Od zdjecia do opublikowanego ogloszenia — wszystko plynnie.",
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
      step3Title: "Publikuj i sprzedawaj",
      step3Body:
        "Sprawdz, popraw i opublikuj. Sprzedawaj szybciej przy mniejszym wysilku.",
      finalCtaTitle: "Gotowy zwiekszyc sprzedaz na Vinted?",
      finalCtaBody:
        "Dolacz do tysiecy sprzedawcow, ktorzy uzywaja AutoLister do szybszej sprzedazy.",
      getStartedFree: "Zacznij za darmo",
    },
    pricing: {
      safetyBannerTitle:
        "Jedyne narzedzie Vinted, ktore naprawde chroni Twoje konto.",
      safetyZeroMass: "0 akcji masowych",
      safetyZeroApi: "0 dostepu API",
      safetyZeroBan: "0 ryzyka bana",
      accountSafe: "Bezpieczne",
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
      aiGeneratedTitles: "Tytuly i opisy generowane przez AI",
      phoneUpload: "Upload zdjec przez telefon (wkrotce tylko Pro i Business)",
      seeIfYouLikeIt: "Sprawdz zanim sie zdecydujesz",
      everythingInStarter: "Wszystko ze Starter",
      changeAiTone: "Zmiana tonu pisania AI",
      emojiSupport: "Obsluga emoji",
      noDailyLimit: "Brak limitu dziennego",
      listingsPerDay: "ogloszen dziennie",
      listingsPerMonth: "ogloszen miesiecznie",
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
      watchDemo: "Ver demo",
      videoCaption: "Mira como funciona en 15 segundos",
      heroBullet1:
        "Genera titulos, descripciones y hashtags optimizados para SEO automaticamente",
      heroBullet2: "Sin copiar y pegar. Sin enviar fotos por correo.",
      heroBullet3: "Cumple con los terminos de servicio de Vinted",
      addToChrome: "Anadir a Chrome",
      addToChromeNote: "Es gratis",
      safetyHeading: "Cero riesgo. 100% de control.",
      safetyBody:
        "A diferencia de DotB y Vintex — que se conectan a la API privada de Vinted para auto-seguir y auto-dar likes — AutoLister funciona estrictamente como una herramienta de productividad del navegador. Escribe texto por ti. Nada mas.",
      safetyNativeBadge: "Extension nativa del navegador al 100%",
      safetyCoreBadge: "La diferencia clave",
      safetyCoreTitle: "El riesgo no es la IA.",
      safetyCoreSubtitle: "El riesgo es automatizar acciones en Vinted.",
      safetyCoreBody:
        "AutoLister actua exactamente como un humano escribiendo muy rapido. Nunca tocamos APIs privadas ni automatizamos likes o follows. Cero acciones masivas.",
      safetyStatBotRiskLabel: "Riesgo de baneo del bot",
      safetyStatBotRiskNote: "Reportado por vendedores en semanas",
      safetyStatAlRiskLabel: "Riesgo AutoLister",
      safetyStatAlRiskNote: "0 acciones masivas. 0 acceso API.",
      safetyFeature1Title: "Sin acceso a API",
      safetyFeature1Body:
        "Nunca tocamos el codigo interno de Vinted ni endpoints privados — cero activacion de Cloudflare.",
      safetyFeature2Title: "Ritmo humano",
      safetyFeature2Body:
        "Rellenamos los campos de texto por ti — como un mecanografo muy rapido. Sin acciones masivas, sin bucles de spam.",
      safetyFeature3Title: "Tu cartera esta segura",
      safetyFeature3Body:
        "Revisas cada anuncio antes de publicarlo. Tu cartera y cuenta de Vinted nunca estan en riesgo.",
      comparisonBadge: "Comparacion honesta",
      comparisonBotSubtitle: "Bots de automatizacion de Vinted",
      comparisonAlSubtitle: "Generador de contenido IA",
      comparisonSafeChoice: "Eleccion segura",
      comparisonBotBullet1Title: "Alto riesgo de baneo de cuenta",
      comparisonBotBullet1Body:
        "Se conectan a la API privada de Vinted — bans reportados en la comunidad a las pocas semanas",
      comparisonBotBullet2Title: "Activacion de deteccion de bots Cloudflare",
      comparisonBotBullet2Body:
        "500 auto-likes y auto-follows diarios marcan tu cuenta como trafico automatizado",
      comparisonBotBullet3Title: "Viola los Terminos de Servicio de Vinted",
      comparisonBotBullet3Body:
        "Automatizar acciones de Vinted via API privada esta expresamente prohibido en sus ToS",
      comparisonBotBullet4Title: "Tu cartera de Vinted en riesgo",
      comparisonBotBullet4Body:
        "Baneo de cuenta = cartera congelada. Cualquier dinero en la plataforma podria bloquearse al instante",
      comparisonAlBullet1Title: "Cero riesgo de baneo",
      comparisonAlBullet1Body:
        "Lee tu foto, escribe el texto del anuncio — comportamiento identico al de un vendedor humano",
      comparisonAlBullet2Title: "Cero activaciones de Cloudflare",
      comparisonAlBullet2Body:
        "Sin llamadas privadas a la API. Sin acciones masivas. Completamente invisible para la deteccion de bots.",
      comparisonAlBullet3Title: "100% conforme con los ToS de Vinted",
      comparisonAlBullet3Body:
        "Un asistente de escritura, no un bot. Ayuda a crear mejores anuncios totalmente dentro de las reglas.",
      comparisonAlBullet4Title: "Tu cartera permanece protegida",
      comparisonAlBullet4Body:
        "Sin riesgo de cuenta, sin fondos congelados. Anuncia mas, preocupate menos.",
      comparisonFootnote:
        "Comparacion basada en las funciones publicamente anunciadas de DotB y Vintex a partir de 2025. AutoLister AI no esta afiliado ni respaldado por Vinted.",
      featuresTitle: "Una forma mas rapida de vender en Vinted",
      featuresSubtitle:
        "Foto. Analiza. Vende. De tu galeria a un anuncio de Vinted en segundos.",
      feature1Title: "Optimizado para Conversion",
      feature1Body:
        "Cada titulo y descripcion esta elaborado para maximizar el atractivo y generar ventas.",
      feature2Title: "Flujo de Trabajo Sin Fricciones",
      feature2Body:
        "Sin excusas para no vender. De la foto al anuncio publicado, todo fluye a la perfeccion.",
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
      step3Title: "Publica y vende",
      step3Body:
        "Revisa, ajusta si quieres y publica. Vende mas rapido con menos esfuerzo.",
      finalCtaTitle: "Listo para acelerar tus ventas en Vinted?",
      finalCtaBody:
        "Unete a miles de vendedores que usan AutoLister para vender mas rapido.",
      getStartedFree: "Empieza gratis",
    },
    pricing: {
      safetyBannerTitle:
        "La unica herramienta de Vinted que protege de verdad tu cuenta.",
      safetyZeroMass: "0 acciones masivas",
      safetyZeroApi: "0 accesos API",
      safetyZeroBan: "0 riesgo de baneo",
      accountSafe: "Cuenta segura",
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
      aiGeneratedTitles: "Titulos y descripciones generados por IA",
      phoneUpload: "Subida desde movil (pronto solo para Pro y Business)",
      seeIfYouLikeIt: "Pruebalo primero",
      everythingInStarter: "Todo lo de Starter",
      changeAiTone: "Cambiar tono de escritura IA",
      emojiSupport: "Soporte de emojis",
      noDailyLimit: "Sin limite diario",
      listingsPerDay: "anuncios por dia",
      listingsPerMonth: "anuncios por mes",
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
      watchDemo: "Guarda demo",
      videoCaption: "Scopri come funziona in 15 secondi",
      heroBullet1:
        "Genera automaticamente titoli, descrizioni e hashtag ottimizzati per il SEO",
      heroBullet2: "Nessun copia-incolla. Nessun invio di foto via email.",
      heroBullet3: "Conforme ai termini di servizio di Vinted",
      addToChrome: "Aggiungi a Chrome",
      addToChromeNote: "E gratis",
      safetyHeading: "Zero rischi. 100% controllo.",
      safetyBody:
        "A differenza di DotB e Vintex — che si collegano all'API privata di Vinted per auto-seguire e auto-mettere like — AutoLister opera strettamente come uno strumento di produttivita del browser. Scrive testo per te. Nient'altro.",
      safetyNativeBadge: "Estensione browser 100% nativa",
      safetyCoreBadge: "La differenza chiave",
      safetyCoreTitle: "Il rischio non e l'AI.",
      safetyCoreSubtitle: "Il rischio e automatizzare azioni su Vinted.",
      safetyCoreBody:
        "AutoLister si comporta esattamente come un umano che scrive molto velocemente. Non tocchiamo API private e non automatizziamo likes o follows. Zero azioni di massa.",
      safetyStatBotRiskLabel: "Rischio ban bot",
      safetyStatBotRiskNote: "Segnalato da venditori in poche settimane",
      safetyStatAlRiskLabel: "Rischio AutoLister",
      safetyStatAlRiskNote: "0 azioni di massa. 0 accessi API.",
      safetyFeature1Title: "Nessun accesso API",
      safetyFeature1Body:
        "Non tocchiamo mai il codice interno di Vinted o endpoint privati — zero trigger Cloudflare.",
      safetyFeature2Title: "Ritmo umano",
      safetyFeature2Body:
        "Compiliamo i campi di testo per te — come un dattilografo molto veloce. Nessuna azione di massa, nessun loop di spam.",
      safetyFeature3Title: "Il tuo portafoglio e al sicuro",
      safetyFeature3Body:
        "Revisioni ogni annuncio prima che vada in linea. Il tuo portafoglio e account Vinted non sono mai a rischio.",
      comparisonBadge: "Confronto onesto",
      comparisonBotSubtitle: "Bot di automazione Vinted",
      comparisonAlSubtitle: "Generatore di contenuti AI",
      comparisonSafeChoice: "Scelta sicura",
      comparisonBotBullet1Title: "Alto rischio di ban dell'account",
      comparisonBotBullet1Body:
        "Si collegano all'API privata di Vinted — la community segnala ban entro settimane dall'uso",
      comparisonBotBullet2Title: "Rilevamento bot Cloudflare attivato",
      comparisonBotBullet2Body:
        "500 auto-like e auto-follow giornalieri contrassegnano il tuo account come traffico automatizzato",
      comparisonBotBullet3Title: "Viola i Termini di Servizio di Vinted",
      comparisonBotBullet3Body:
        "Automatizzare le azioni di Vinted tramite API privata e esplicitamente vietato nei loro ToS",
      comparisonBotBullet4Title: "Il tuo portafoglio Vinted a rischio",
      comparisonBotBullet4Body:
        "Ban account = portafoglio congelato. Qualsiasi denaro sulla piattaforma potrebbe essere bloccato istantaneamente",
      comparisonAlBullet1Title: "Zero rischio di ban",
      comparisonAlBullet1Body:
        "Legge la tua foto, scrive il testo dell'annuncio — comportamento identico a un venditore umano",
      comparisonAlBullet2Title: "Zero trigger Cloudflare",
      comparisonAlBullet2Body:
        "Nessuna chiamata API privata. Nessuna azione di massa. Completamente invisibile al rilevamento bot.",
      comparisonAlBullet3Title: "100% conforme ai ToS di Vinted",
      comparisonAlBullet3Body:
        "Un assistente di scrittura, non un bot. Aiuta a creare annunci migliori, completamente nel rispetto delle regole.",
      comparisonAlBullet4Title: "Il tuo portafoglio resta protetto",
      comparisonAlBullet4Body:
        "Nessun rischio account, nessun fondo congelato. Pubblica di piu, preoccupati di meno.",
      comparisonFootnote:
        "Confronto basato sulle funzionalita pubblicamente pubblicizzate di DotB e Vintex al 2025. AutoLister AI non e affiliato ne approvato da Vinted.",
      featuresTitle: "Un modo piu veloce di vendere su Vinted",
      featuresSubtitle:
        "Scatta. Analizza. Vendi. Dalla galleria a un annuncio Vinted in pochi secondi.",
      feature1Title: "Ottimizzato per la Conversione",
      feature1Body:
        "Ogni titolo e descrizione e scritto per massimizzare l'attrattiva e generare vendite.",
      feature2Title: "Flusso di Lavoro Senza Intoppi",
      feature2Body:
        "Nessuna scusa per non vendere. Dalla foto all'annuncio pubblicato, tutto scorre perfettamente.",
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
      step3Title: "Pubblica e vendi",
      step3Body:
        "Controlla, modifica se vuoi e pubblica. Vendi piu velocemente con meno fatica.",
      finalCtaTitle: "Pronto ad aumentare le vendite su Vinted?",
      finalCtaBody:
        "Unisciti a migliaia di venditori che usano AutoLister per vendere piu rapidamente.",
      getStartedFree: "Inizia gratis",
    },
    pricing: {
      safetyBannerTitle:
        "L'unico strumento Vinted che protegge davvero il tuo account.",
      safetyZeroMass: "0 azioni di massa",
      safetyZeroApi: "0 accessi API",
      safetyZeroBan: "0 rischio ban",
      accountSafe: "Account sicuro",
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
      aiGeneratedTitles: "Titoli e descrizioni generati dall'AI",
      phoneUpload: "Upload da telefono (presto solo per Pro e Business)",
      seeIfYouLikeIt: "Provalo prima di decidere",
      everythingInStarter: "Tutto di Starter",
      changeAiTone: "Cambia il tono di scrittura AI",
      emojiSupport: "Supporto emoji",
      noDailyLimit: "Nessun limite giornaliero",
      listingsPerDay: "annunci al giorno",
      listingsPerMonth: "annunci al mese",
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
      watchDemo: "Ver demo",
      videoCaption: "Veja como funciona em 15 segundos",
      heroBullet1:
        "Gera automaticamente titulos, descricoes e hashtags otimizados para SEO",
      heroBullet2: "Sem copiar e colar. Sem enviar fotos por email.",
      heroBullet3: "Em conformidade com os termos de servico da Vinted",
      addToChrome: "Adicionar ao Chrome",
      addToChromeNote: "E gratis",
      safetyHeading: "Zero risco. 100% controlo.",
      safetyBody:
        "Ao contrario do DotB e Vintex — que se ligam a API privada da Vinted para auto-seguir e auto-dar gostos — o AutoLister funciona estritamente como uma ferramenta de produtividade do navegador. Escreve texto por si. Nada mais.",
      safetyNativeBadge: "Extensao de navegador 100% nativa",
      safetyCoreBadge: "A diferenca central",
      safetyCoreTitle: "O risco nao e a IA.",
      safetyCoreSubtitle: "O risco e automatizar acoes na Vinted.",
      safetyCoreBody:
        "O AutoLister comporta-se exatamente como um humano a escrever muito depressa. Nunca tocamos em APIs privadas nem automatizamos gostos ou follows. Zero acoes em massa.",
      safetyStatBotRiskLabel: "Risco de ban do bot",
      safetyStatBotRiskNote: "Reportado por vendedores em poucas semanas",
      safetyStatAlRiskLabel: "Risco AutoLister",
      safetyStatAlRiskNote: "0 acoes em massa. 0 acesso API.",
      safetyFeature1Title: "Sem acesso a API",
      safetyFeature1Body:
        "Nunca tocamos no codigo interno da Vinted ou endpoints privados — zero ativacoes Cloudflare.",
      safetyFeature2Title: "Ritmo humano",
      safetyFeature2Body:
        "Preenchemos os campos de texto por si — como um datilografo muito rapido. Sem acoes em massa, sem loops de spam.",
      safetyFeature3Title: "A sua carteira esta segura",
      safetyFeature3Body:
        "Reveja cada anuncio antes de publicar. A sua carteira e conta Vinted nunca estao em risco.",
      comparisonBadge: "Comparacao honesta",
      comparisonBotSubtitle: "Bots de automatizacao Vinted",
      comparisonAlSubtitle: "Gerador de conteudo IA",
      comparisonSafeChoice: "Escolha segura",
      comparisonBotBullet1Title: "Alto risco de ban de conta",
      comparisonBotBullet1Body:
        "Ligam-se a API privada da Vinted — comunidade reporta bans em poucas semanas de uso",
      comparisonBotBullet2Title: "Detecao de bots Cloudflare ativada",
      comparisonBotBullet2Body:
        "500 auto-gostos e auto-seguidores diarios marcam a sua conta como trafego automatizado",
      comparisonBotBullet3Title: "Viola os Termos de Servico da Vinted",
      comparisonBotBullet3Body:
        "Automatizar acoes da Vinted via API privada e explicitamente proibido nos seus ToS",
      comparisonBotBullet4Title: "A sua carteira Vinted em risco",
      comparisonBotBullet4Body:
        "Ban da conta = carteira congelada. Qualquer dinheiro na plataforma pode ser bloqueado instantaneamente",
      comparisonAlBullet1Title: "Zero risco de ban",
      comparisonAlBullet1Body:
        "Le a sua foto, escreve o texto do anuncio — comportamento identico ao de um vendedor humano",
      comparisonAlBullet2Title: "Zero ativacoes Cloudflare",
      comparisonAlBullet2Body:
        "Sem chamadas privadas a API. Sem acoes em massa. Completamente invisivel para detetar bots.",
      comparisonAlBullet3Title: "100% conforme com os ToS da Vinted",
      comparisonAlBullet3Body:
        "Um assistente de escrita, nao um bot. Ajuda a criar melhores anuncios, totalmente dentro das regras.",
      comparisonAlBullet4Title: "A sua carteira permanece protegida",
      comparisonAlBullet4Body:
        "Sem risco de conta, sem fundos congelados. Publique mais, preocupe-se menos.",
      comparisonFootnote:
        "Comparacao baseada nas funcionalidades publicamente anunciadas do DotB e Vintex ate 2025. O AutoLister AI nao e afiliado nem apoiado pela Vinted.",
      featuresTitle: "Uma forma mais rapida de vender na Vinted",
      featuresSubtitle:
        "Foto. Analise. Venda. Da galeria para um anuncio Vinted em segundos.",
      feature1Title: "Otimizado para Conversao",
      feature1Body:
        "Cada titulo e descricao e elaborado para maximizar o apelo e gerar mais vendas.",
      feature2Title: "Fluxo de Trabalho Fluido",
      feature2Body:
        "Sem desculpas para nao vender. Da foto ao anuncio publicado, tudo acontece sem fricao.",
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
      step3Title: "Publique e venda",
      step3Body:
        "Reveja, ajuste se quiser e publique. Venda mais rapido com menos trabalho.",
      finalCtaTitle: "Pronto para acelerar as suas vendas na Vinted?",
      finalCtaBody:
        "Junte-se a milhares de vendedores que usam o AutoLister para vender mais rapido.",
      getStartedFree: "Comecar gratis",
    },
    pricing: {
      safetyBannerTitle:
        "A unica ferramenta Vinted que protege mesmo a sua conta.",
      safetyZeroMass: "0 acoes em massa",
      safetyZeroApi: "0 acessos API",
      safetyZeroBan: "0 risco de ban",
      accountSafe: "Conta segura",
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
      aiGeneratedTitles: "Titulos e descricoes gerados por IA",
      phoneUpload: "Upload por telefone (brevemente so para Pro e Business)",
      seeIfYouLikeIt: "Experimente primeiro",
      everythingInStarter: "Tudo do Starter",
      changeAiTone: "Alterar tom de escrita IA",
      emojiSupport: "Suporte emoji",
      noDailyLimit: "Sem limite diario",
      listingsPerDay: "anuncios por dia",
      listingsPerMonth: "anuncios por mes",
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
