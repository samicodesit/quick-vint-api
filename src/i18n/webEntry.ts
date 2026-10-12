import type { SiteLocale } from "./site";

/** Short route labels; the established headline and compatibility copy stay intact. */
export const WEB_ENTRY_COPY: Record<
  SiteLocale,
  { action: string; web: string; extension: string }
> = {
  en: {
    action: "Create a draft",
    web: "No install. Upload photos, then copy your text.",
    extension: "Generate directly on the listing page.",
  },
  fr: {
    action: "Créer une annonce",
    web: "Sans installation. Ajoutez vos photos, puis copiez le texte.",
    extension: "Générez directement sur la page de l’annonce.",
  },
  de: {
    action: "Entwurf erstellen",
    web: "Ohne Installation. Fotos hochladen, dann den Text kopieren.",
    extension: "Direkt auf der Angebotsseite erstellen.",
  },
  nl: {
    action: "Concept maken",
    web: "Geen installatie. Upload foto’s en kopieer je tekst.",
    extension: "Maak tekst direct op de advertentiepagina.",
  },
  pl: {
    action: "Utwórz szkic",
    web: "Bez instalacji. Dodaj zdjęcia i skopiuj tekst.",
    extension: "Generuj bezpośrednio na stronie ogłoszenia.",
  },
  es: {
    action: "Crear un borrador",
    web: "Sin instalar. Sube fotos y copia el texto.",
    extension: "Genera directamente en la página del anuncio.",
  },
  it: {
    action: "Crea una bozza",
    web: "Senza installazione. Carica le foto e copia il testo.",
    extension: "Genera direttamente nella pagina dell’annuncio.",
  },
  pt: {
    action: "Criar um rascunho",
    web: "Sem instalar. Adicione fotos e copie o texto.",
    extension: "Gere diretamente na página do anúncio.",
  },
};
