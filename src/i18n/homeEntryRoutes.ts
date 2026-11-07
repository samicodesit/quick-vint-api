import type { SiteLocale } from "./site";

export const HOME_ENTRY_ROUTES: Record<
  SiteLocale,
  {
    extensionAction: string;
    extensionNote: string;
    webAlternative: string;
    webNote: string;
    proof: string;
  }
> = {
  en: {
    extensionAction: "Add to Chrome for free",
    extensionNote: "Create drafts directly on Vinted.",
    webAlternative: "Try a free draft without installing",
    webNote: "No install. Copy your draft into Vinted.",
    proof: "★ 4.6/5 · Chrome Web Store",
  },
  fr: {
    extensionAction: "Ajouter à Chrome gratuitement",
    extensionNote: "Créez vos annonces directement sur Vinted.",
    webAlternative: "Essayer une annonce gratuite sans installation",
    webNote: "Sans installation. Copiez votre texte dans Vinted.",
    proof: "★ 4,6/5 · Chrome Web Store",
  },
  de: {
    extensionAction: "Kostenlos zu Chrome hinzufügen",
    extensionNote: "Erstelle Entwürfe direkt auf Vinted.",
    webAlternative: "Kostenlosen Entwurf ohne Installation testen",
    webNote: "Ohne Installation. Kopiere deinen Entwurf in Vinted.",
    proof: "★ 4,6/5 · Chrome Web Store",
  },
  nl: {
    extensionAction: "Gratis toevoegen aan Chrome",
    extensionNote: "Maak concepten direct op Vinted.",
    webAlternative: "Probeer gratis een concept zonder installatie",
    webNote: "Geen installatie. Kopieer je concept naar Vinted.",
    proof: "★ 4,6/5 · Chrome Web Store",
  },
  pl: {
    extensionAction: "Dodaj do Chrome za darmo",
    extensionNote: "Twórz szkice bezpośrednio na Vinted.",
    webAlternative: "Wypróbuj bezpłatny szkic bez instalacji",
    webNote: "Bez instalacji. Skopiuj szkic do Vinted.",
    proof: "★ 4,6/5 · Chrome Web Store",
  },
  es: {
    extensionAction: "Añadir a Chrome gratis",
    extensionNote: "Crea borradores directamente en Vinted.",
    webAlternative: "Prueba un borrador gratis sin instalar nada",
    webNote: "Sin instalación. Copia tu borrador en Vinted.",
    proof: "★ 4,6/5 · Chrome Web Store",
  },
  it: {
    extensionAction: "Aggiungi a Chrome gratis",
    extensionNote: "Crea bozze direttamente su Vinted.",
    webAlternative: "Prova una bozza gratis senza installare nulla",
    webNote: "Senza installazione. Copia la tua bozza su Vinted.",
    proof: "★ 4,6/5 · Chrome Web Store",
  },
  pt: {
    extensionAction: "Adicionar ao Chrome grátis",
    extensionNote: "Cria rascunhos diretamente no Vinted.",
    webAlternative: "Experimenta um rascunho grátis sem instalar nada",
    webNote: "Sem instalação. Copia o teu rascunho para o Vinted.",
    proof: "★ 4,6/5 · Chrome Web Store",
  },
};
