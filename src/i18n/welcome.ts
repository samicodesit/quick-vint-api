export const SUPPORTED_WELCOME_LOCALES = [
  "en",
  "fr",
  "de",
  "nl",
  "pl",
  "es",
  "it",
  "pt",
] as const;

export type WelcomeLocale = (typeof SUPPORTED_WELCOME_LOCALES)[number];

export const DEFAULT_WELCOME_LOCALE: WelcomeLocale = "en";

const LOCALE_SET = new Set<string>(SUPPORTED_WELCOME_LOCALES);

type WelcomeCopy = {
  languageName: string;
  seoTitle: string;
  seoDescription: string;
  heroBadge: string;
  heroTitle: string;
  heroSubtitle: string;
  installTitle: string;
  installSubtitle: string;
  planBadge: string;
  pinBadge: string;
  pinTitle: string;
  pinBody: string;
  stepsTitle: string;
  steps: [string, string, string];
  labelTipBadge: string;
  labelTipTitle: string;
  labelTipBody: string;
  primaryCta: string;
  secondaryCta: string;
  fallbackCta: string;
  reassurance: string;
  compliance: string;
  switcherLabel: string;
};

export const WELCOME_COPY: Record<WelcomeLocale, WelcomeCopy> = {
  en: {
    languageName: "English",
    seoTitle: "Welcome to AutoLister AI | Start Selling on Vinted in Seconds",
    seoDescription:
      "Welcome to AutoLister AI. Pin your extension, open Vinted, and click Generate to create your listing in seconds.",
    heroBadge: "Extension Installed",
    heroTitle: "You are 3 clicks away from your first listing",
    heroSubtitle:
      "Pin AutoLister AI, open Vinted, and generate your listing instantly.",
    installTitle: "Installation complete.",
    installSubtitle: "Autolister is added to your browser.",
    planBadge: "Free plan active",
    pinBadge: "Optional",
    pinTitle: "Pin the extension",
    pinBody:
      "Click the puzzle icon in your browser toolbar to pin Autolister for easy access.",
    stepsTitle: "How it works",
    steps: [
      "Pin the extension to your Chrome toolbar",
      "Go to Vinted and open your listing flow",
      "Click Generate to create title and description",
    ],
    labelTipBadge: "Pro tip",
    labelTipTitle: "Add label photos",
    labelTipBody:
      "Include clear photos of tags, sizes, and materials for accurate AI descriptions.",
    primaryCta: "Go to Vinted and list now",
    secondaryCta: "See pricing plans",
    fallbackCta: "Open default Vinted listing page",
    reassurance: "Free plan included. Upgrade any time.",
    compliance:
      "AutoLister AI is an independent tool and is not affiliated with Vinted.",
    switcherLabel: "Language",
  },
  fr: {
    languageName: "Français",
    seoTitle:
      "Bienvenue sur AutoLister AI | Vendez sur Vinted en quelques secondes",
    seoDescription:
      "Bienvenue sur AutoLister AI. Épinglez l'extension, ouvrez Vinted et cliquez sur Générer pour créer votre annonce en quelques secondes.",
    heroBadge: "Extension installée",
    heroTitle: "Vous êtes à 3 clics de votre première annonce",
    heroSubtitle:
      "Épinglez AutoLister AI, ouvrez Vinted et générez votre annonce instantanément.",
    installTitle: "Installation terminée.",
    installSubtitle: "Autolister a été ajouté à votre navigateur.",
    planBadge: "Plan gratuit actif",
    pinBadge: "Optionnel",
    pinTitle: "Épinglez l'extension",
    pinBody:
      "Cliquez sur l'icône puzzle dans la barre d'outils du navigateur pour épingler Autolister et le retrouver facilement.",
    stepsTitle: "Comment ça marche",
    steps: [
      "Épinglez l'extension dans votre barre d'outils Chrome",
      "Allez sur Vinted et ouvrez le flux de création d'annonce",
      "Cliquez sur Générer pour créer le titre et la description",
    ],
    labelTipBadge: "Conseil photo",
    labelTipTitle: "Ajoutez une photo de l'étiquette si possible",
    labelTipBody: "Cela aide AutoLister à lire la marque, la taille et la matière.",
    primaryCta: "Aller sur Vinted et publier",
    secondaryCta: "Voir les offres",
    fallbackCta: "Ouvrir la page Vinted par défaut",
    reassurance:
      "Le plan gratuit inclut 2 annonces par jour. Passez à une offre supérieure quand vous voulez.",
    compliance:
      "AutoLister AI est un outil indépendant et n'est pas affilié à Vinted.",
    switcherLabel: "Langue",
  },
  de: {
    languageName: "Deutsch",
    seoTitle: "Willkommen bei AutoLister AI | In Sekunden auf Vinted verkaufen",
    seoDescription:
      "Willkommen bei AutoLister AI. Erweiterung anpinnen, Vinted öffnen und auf Generieren klicken, um dein Inserat in Sekunden zu erstellen.",
    heroBadge: "Erweiterung installiert",
    heroTitle: "Du bist nur 3 Klicks von deinem ersten Inserat entfernt",
    heroSubtitle:
      "Pinne AutoLister AI an, öffne Vinted und erstelle dein Inserat sofort.",
    installTitle: "Installation abgeschlossen.",
    installSubtitle: "Autolister wurde deinem Browser hinzugefügt.",
    planBadge: "Free-Plan aktiv",
    pinBadge: "Optional",
    pinTitle: "Erweiterung anpinnen",
    pinBody:
      "Klicke auf das Puzzle-Symbol in der Browser-Symbolleiste, um Autolister für schnellen Zugriff anzupinnen.",
    stepsTitle: "So funktioniert es",
    steps: [
      "Pinne die Erweiterung in deine Chrome-Symbolleiste",
      "Gehe zu Vinted und öffne den Inserat-Flow",
      "Klicke auf Generieren für Titel und Beschreibung",
    ],
    labelTipBadge: "Foto-Tipp",
    labelTipTitle: "Füge wenn möglich ein Etikett-Foto hinzu",
    labelTipBody: "So erkennt AutoLister Marke, Größe und Material besser.",
    primaryCta: "Zu Vinted und jetzt inserieren",
    secondaryCta: "Preise ansehen",
    fallbackCta: "Standard-Vinted-Seite öffnen",
    reassurance:
      "Im Free-Plan sind 2 Inserate pro Tag enthalten. Upgrade jederzeit möglich.",
    compliance:
      "AutoLister AI ist ein unabhängiges Tool und nicht mit Vinted verbunden.",
    switcherLabel: "Sprache",
  },
  nl: {
    languageName: "Nederlands",
    seoTitle: "Welkom bij AutoLister AI | Verkoop op Vinted in seconden",
    seoDescription:
      "Welkom bij AutoLister AI. Pin de extensie, open Vinted en klik op Genereren om je advertentie in seconden te maken.",
    heroBadge: "Extensie geïnstalleerd",
    heroTitle: "Je bent 3 klikken verwijderd van je eerste advertentie",
    heroSubtitle:
      "Pin AutoLister AI, open Vinted en genereer direct je advertentie.",
    installTitle: "Installatie voltooid.",
    installSubtitle: "Autolister is toegevoegd aan je browser.",
    planBadge: "Gratis plan actief",
    pinBadge: "Optioneel",
    pinTitle: "Pin de extensie",
    pinBody:
      "Klik op het puzzelicoon in de browserwerkbalk om Autolister vast te zetten voor snelle toegang.",
    stepsTitle: "Zo werkt het",
    steps: [
      "Pin de extensie aan je Chrome-werkbalk",
      "Ga naar Vinted en open je advertentieflow",
      "Klik op Genereren voor titel en beschrijving",
    ],
    labelTipBadge: "Fototip",
    labelTipTitle: "Voeg indien mogelijk een label-foto toe",
    labelTipBody: "Zo kan AutoLister merk, maat en materiaal beter lezen.",
    primaryCta: "Ga naar Vinted en plaats nu",
    secondaryCta: "Bekijk prijzen",
    fallbackCta: "Open standaard Vinted-pagina",
    reassurance:
      "Gratis plan bevat 2 advertenties per dag. Upgrade wanneer je wilt.",
    compliance:
      "AutoLister AI is een onafhankelijke tool en is niet verbonden met Vinted.",
    switcherLabel: "Taal",
  },
  pl: {
    languageName: "Polski",
    seoTitle: "Witamy w AutoLister AI | Sprzedawaj na Vinted w kilka sekund",
    seoDescription:
      "Witamy w AutoLister AI. Przypnij rozszerzenie, otwórz Vinted i kliknij Generuj, aby utworzyć ofertę w kilka sekund.",
    heroBadge: "Rozszerzenie zainstalowane",
    heroTitle: "Do pierwszego ogłoszenia dzielą Cię 3 kliknięcia",
    heroSubtitle:
      "Przypnij AutoLister AI, otwórz Vinted i wygeneruj ogłoszenie natychmiast.",
    installTitle: "Instalacja zakończona.",
    installSubtitle: "Autolister został dodany do Twojej przeglądarki.",
    planBadge: "Darmowy plan aktywny",
    pinBadge: "Opcjonalnie",
    pinTitle: "Przypnij rozszerzenie",
    pinBody:
      "Kliknij ikonę puzzla na pasku narzędzi przeglądarki, aby przypiąć Autolister i mieć do niego szybki dostęp.",
    stepsTitle: "Jak to działa",
    steps: [
      "Przypnij rozszerzenie do paska narzędzi Chrome",
      "Wejdź na Vinted i otwórz tworzenie ogłoszenia",
      "Kliknij Generuj, aby utworzyć tytuł i opis",
    ],
    labelTipBadge: "Wskazówka",
    labelTipTitle: "Dodaj zdjęcie metki, jeśli możesz",
    labelTipBody: "To pomaga AutoLister odczytać markę, rozmiar i materiał.",
    primaryCta: "Przejdź do Vinted i wystaw teraz",
    secondaryCta: "Zobacz plany",
    fallbackCta: "Otwórz domyślną stronę Vinted",
    reassurance:
      "Plan darmowy obejmuje 2 ogłoszenia dziennie. Możesz przejść na wyższy plan w dowolnym momencie.",
    compliance:
      "AutoLister AI to niezależne narzędzie i nie jest powiązane z Vinted.",
    switcherLabel: "Język",
  },
  es: {
    languageName: "Español",
    seoTitle: "Bienvenido a AutoLister AI | Vende en Vinted en segundos",
    seoDescription:
      "Bienvenido a AutoLister AI. Fija la extensión, abre Vinted y pulsa Generar para crear tu anuncio en segundos.",
    heroBadge: "Extensión instalada",
    heroTitle: "Estás a 3 clics de tu primer anuncio",
    heroSubtitle:
      "Fija AutoLister AI, abre Vinted y genera tu anuncio al instante.",
    installTitle: "Instalación completada.",
    installSubtitle: "Autolister se ha añadido a tu navegador.",
    planBadge: "Plan gratuito activo",
    pinBadge: "Opcional",
    pinTitle: "Fija la extensión",
    pinBody:
      "Haz clic en el icono de puzzle de la barra de herramientas del navegador para fijar Autolister y acceder fácilmente.",
    stepsTitle: "Cómo funciona",
    steps: [
      "Fija la extensión en la barra de herramientas de Chrome",
      "Ve a Vinted y abre el flujo de anuncio",
      "Pulsa Generar para crear título y descripción",
    ],
    labelTipBadge: "Consejo",
    labelTipTitle: "Añade una foto de la etiqueta si puedes",
    labelTipBody: "Ayuda a AutoLister a leer marca, talla y material.",
    primaryCta: "Ir a Vinted y publicar ahora",
    secondaryCta: "Ver planes",
    fallbackCta: "Abrir página predeterminada de Vinted",
    reassurance:
      "El plan gratuito incluye 2 anuncios al día. Mejora cuando quieras.",
    compliance:
      "AutoLister AI es una herramienta independiente y no está afiliada a Vinted.",
    switcherLabel: "Idioma",
  },
  it: {
    languageName: "Italiano",
    seoTitle: "Benvenuto in AutoLister AI | Vendi su Vinted in pochi secondi",
    seoDescription:
      "Benvenuto in AutoLister AI. Fissa l'estensione, apri Vinted e fai clic su Genera per creare il tuo annuncio in pochi secondi.",
    heroBadge: "Estensione installata",
    heroTitle: "Sei a 3 clic dal tuo primo annuncio",
    heroSubtitle:
      "Fissa AutoLister AI, apri Vinted e genera subito il tuo annuncio.",
    installTitle: "Installazione completata.",
    installSubtitle: "Autolister è stato aggiunto al tuo browser.",
    planBadge: "Piano gratuito attivo",
    pinBadge: "Opzionale",
    pinTitle: "Fissa l'estensione",
    pinBody:
      "Fai clic sull'icona del puzzle nella barra degli strumenti del browser per fissare Autolister e accedervi facilmente.",
    stepsTitle: "Come funziona",
    steps: [
      "Fissa l'estensione nella barra strumenti di Chrome",
      "Vai su Vinted e apri il flusso di pubblicazione",
      "Fai clic su Genera per creare titolo e descrizione",
    ],
    labelTipBadge: "Consiglio",
    labelTipTitle: "Aggiungi una foto dell'etichetta se puoi",
    labelTipBody: "Aiuta AutoLister a leggere marca, taglia e materiale.",
    primaryCta: "Vai su Vinted e pubblica ora",
    secondaryCta: "Vedi i piani",
    fallbackCta: "Apri pagina Vinted predefinita",
    reassurance:
      "Il piano gratuito include 2 annunci al giorno. Puoi fare upgrade quando vuoi.",
    compliance:
      "AutoLister AI è uno strumento indipendente e non è affiliato a Vinted.",
    switcherLabel: "Lingua",
  },
  pt: {
    languageName: "Português",
    seoTitle: "Bem-vindo ao AutoLister AI | Venda no Vinted em segundos",
    seoDescription:
      "Bem-vindo ao AutoLister AI. Fixe a extensão, abra o Vinted e clique em Gerar para criar o seu anúncio em segundos.",
    heroBadge: "Extensão instalada",
    heroTitle: "Falta apenas 3 cliques para o seu primeiro anúncio",
    heroSubtitle:
      "Fixe o AutoLister AI, abra o Vinted e gere o seu anúncio instantaneamente.",
    installTitle: "Instalação concluída.",
    installSubtitle: "O Autolister foi adicionado ao seu navegador.",
    planBadge: "Plano gratuito ativo",
    pinBadge: "Opcional",
    pinTitle: "Fixe a extensão",
    pinBody:
      "Clique no ícone de puzzle na barra de ferramentas do navegador para fixar o Autolister e aceder facilmente.",
    stepsTitle: "Como funciona",
    steps: [
      "Fixe a extensão na barra de ferramentas do Chrome",
      "Vá ao Vinted e abra o fluxo de criação de anúncio",
      "Clique em Gerar para criar título e descrição",
    ],
    labelTipBadge: "Dica",
    labelTipTitle: "Adicione uma foto da etiqueta se puder",
    labelTipBody: "Ajuda o AutoLister a ler marca, tamanho e material.",
    primaryCta: "Ir para o Vinted e publicar agora",
    secondaryCta: "Ver planos",
    fallbackCta: "Abrir página padrão do Vinted",
    reassurance:
      "O plano gratuito inclui 2 anúncios por dia. Atualize quando quiser.",
    compliance:
      "O AutoLister AI é uma ferramenta independente e não é afiliada ao Vinted.",
    switcherLabel: "Idioma",
  },
};

export function normalizeWelcomeLocale(input?: string | null): WelcomeLocale {
  if (!input) return DEFAULT_WELCOME_LOCALE;

  const lowerValue = input.toLowerCase();
  const shortCode = lowerValue.split(/[-_]/)[0];

  if (LOCALE_SET.has(lowerValue)) {
    return lowerValue as WelcomeLocale;
  }

  if (LOCALE_SET.has(shortCode)) {
    return shortCode as WelcomeLocale;
  }

  return DEFAULT_WELCOME_LOCALE;
}
