import type { SiteLocale } from "./site";

/** Short route labels; the established headline and compatibility copy stay intact. */
export const WEB_ENTRY_COPY: Record<
  SiteLocale,
  {
    action: string;
    web: string;
    extension: string;
    devices: string;
    desktop: string;
    steps: [string, string, string];
    stepBodies: [string, string, string];
  }
> = {
  en: {
    action: "Create a draft",
    devices: "iPhone, iPad, Android or computer",
    desktop: "For Chrome on your computer",
    steps: ["Choose your photos", "Generate your draft", "Review and copy"],
    stepBodies: [
      "Open the web app. No installation needed.",
      "Get an editable title and description from your photos.",
      "Check your text, then copy it into your listing.",
    ],
    web: "No install. Upload photos, then copy your text.",
    extension: "Generate directly on the listing page.",
  },
  fr: {
    action: "Créer une annonce",
    devices: "iPhone, iPad, Android ou ordinateur",
    desktop: "Pour Chrome sur ordinateur",
    steps: [
      "Choisissez vos photos",
      "Générez votre annonce",
      "Vérifiez et copiez",
    ],
    stepBodies: [
      "Ouvrez l’application web. Aucune installation nécessaire.",
      "Obtenez un titre et une description modifiables à partir de vos photos.",
      "Vérifiez le texte, puis copiez-le dans votre annonce.",
    ],
    web: "Sans installation. Ajoutez vos photos, puis copiez le texte.",
    extension: "Générez directement sur la page de l’annonce.",
  },
  de: {
    action: "Entwurf erstellen",
    devices: "iPhone, iPad, Android oder Computer",
    desktop: "Für Chrome auf deinem Computer",
    steps: ["Fotos auswählen", "Entwurf erstellen", "Prüfen und kopieren"],
    stepBodies: [
      "Öffne die Web-App. Keine Installation nötig.",
      "Erstelle einen bearbeitbaren Titel und eine Beschreibung aus deinen Fotos.",
      "Prüfe den Text und kopiere ihn in dein Angebot.",
    ],
    web: "Ohne Installation. Fotos hochladen, dann den Text kopieren.",
    extension: "Direkt auf der Angebotsseite erstellen.",
  },
  nl: {
    action: "Concept maken",
    devices: "iPhone, iPad, Android of computer",
    desktop: "Voor Chrome op je computer",
    steps: ["Kies je foto’s", "Maak je concept", "Controleer en kopieer"],
    stepBodies: [
      "Open de webapp. Installeren is niet nodig.",
      "Maak een bewerkbare titel en beschrijving van je foto’s.",
      "Controleer de tekst en kopieer deze naar je advertentie.",
    ],
    web: "Geen installatie. Upload foto’s en kopieer je tekst.",
    extension: "Maak tekst direct op de advertentiepagina.",
  },
  pl: {
    action: "Utwórz szkic",
    devices: "iPhone, iPad, Android lub komputer",
    desktop: "Do Chrome na komputerze",
    steps: ["Wybierz zdjęcia", "Wygeneruj szkic", "Sprawdź i skopiuj"],
    stepBodies: [
      "Otwórz aplikację internetową. Bez instalacji.",
      "Uzyskaj edytowalny tytuł i opis na podstawie zdjęć.",
      "Sprawdź tekst i skopiuj go do ogłoszenia.",
    ],
    web: "Bez instalacji. Dodaj zdjęcia i skopiuj tekst.",
    extension: "Generuj bezpośrednio na stronie ogłoszenia.",
  },
  es: {
    action: "Crear un borrador",
    devices: "iPhone, iPad, Android u ordenador",
    desktop: "Para Chrome en tu ordenador",
    steps: ["Elige tus fotos", "Genera tu borrador", "Revisa y copia"],
    stepBodies: [
      "Abre la aplicación web. No requiere instalación.",
      "Obtén un título y una descripción editables a partir de tus fotos.",
      "Revisa el texto y cópialo en tu anuncio.",
    ],
    web: "Sin instalar. Sube fotos y copia el texto.",
    extension: "Genera directamente en la página del anuncio.",
  },
  it: {
    action: "Crea una bozza",
    devices: "iPhone, iPad, Android o computer",
    desktop: "Per Chrome sul computer",
    steps: ["Scegli le foto", "Genera la bozza", "Controlla e copia"],
    stepBodies: [
      "Apri l’app web. Nessuna installazione necessaria.",
      "Ottieni un titolo e una descrizione modificabili dalle tue foto.",
      "Controlla il testo e copialo nel tuo annuncio.",
    ],
    web: "Senza installazione. Carica le foto e copia il testo.",
    extension: "Genera direttamente nella pagina dell’annuncio.",
  },
  pt: {
    action: "Criar um rascunho",
    devices: "iPhone, iPad, Android ou computador",
    desktop: "Para Chrome no computador",
    steps: ["Escolha as fotos", "Gere o rascunho", "Reveja e copie"],
    stepBodies: [
      "Abra a aplicação web. Não precisa de instalar nada.",
      "Obtenha um título e uma descrição editáveis a partir das suas fotos.",
      "Reveja o texto e copie-o para o anúncio.",
    ],
    web: "Sem instalar. Adicione fotos e copie o texto.",
    extension: "Gere diretamente na página do anúncio.",
  },
};
