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
    extensionAction: "Add to Chrome",
    extensionNote: "Create drafts directly on Vinted. Five free drafts.",
    webAlternative: "Try a free draft without installing",
    webNote: "No install. Copy your draft into Vinted.",
    proof: "★ 4.6/5 · Chrome Web Store",
  },
  fr: {
    extensionAction: "Ajouter à Chrome",
    extensionNote:
      "Créez vos annonces directement sur Vinted. Cinq annonces gratuites.",
    webAlternative: "Essayer une annonce gratuite sans installation",
    webNote: "Sans installation. Copiez votre texte dans Vinted.",
    proof: "★ 4,6/5 · Chrome Web Store",
  },
  de: {
    extensionAction: "Zu Chrome hinzufügen",
    extensionNote:
      "Erstelle Entwürfe direkt auf Vinted. Fünf Entwürfe kostenlos.",
    webAlternative: "Kostenlosen Entwurf ohne Installation testen",
    webNote: "Ohne Installation. Kopiere deinen Entwurf in Vinted.",
    proof: "★ 4,6/5 · Chrome Web Store",
  },
  nl: {
    extensionAction: "Toevoegen aan Chrome",
    extensionNote: "Maak concepten direct op Vinted. Vijf gratis concepten.",
    webAlternative: "Probeer gratis een concept zonder installatie",
    webNote: "Geen installatie. Kopieer je concept naar Vinted.",
    proof: "★ 4,6/5 · Chrome Web Store",
  },
  pl: {
    extensionAction: "Dodaj do Chrome",
    extensionNote: "Twórz szkice bezpośrednio na Vinted. Pięć szkiców gratis.",
    webAlternative: "Wypróbuj bezpłatny szkic bez instalacji",
    webNote: "Bez instalacji. Skopiuj szkic do Vinted.",
    proof: "★ 4,6/5 · Chrome Web Store",
  },
  es: {
    extensionAction: "Añadir a Chrome",
    extensionNote:
      "Crea borradores directamente en Vinted. Cinco borradores gratis.",
    webAlternative: "Prueba un borrador gratis sin instalar nada",
    webNote: "Sin instalación. Copia tu borrador en Vinted.",
    proof: "★ 4,6/5 · Chrome Web Store",
  },
  it: {
    extensionAction: "Aggiungi a Chrome",
    extensionNote: "Crea bozze direttamente su Vinted. Cinque bozze gratis.",
    webAlternative: "Prova una bozza gratis senza installare nulla",
    webNote: "Senza installazione. Copia la tua bozza su Vinted.",
    proof: "★ 4,6/5 · Chrome Web Store",
  },
  pt: {
    extensionAction: "Adicionar ao Chrome",
    extensionNote:
      "Cria rascunhos diretamente no Vinted. Cinco rascunhos grátis.",
    webAlternative: "Experimenta um rascunho grátis sem instalar nada",
    webNote: "Sem instalação. Copia o teu rascunho para o Vinted.",
    proof: "★ 4,6/5 · Chrome Web Store",
  },
};
