import type { SiteLocale } from "./site.js";

export const PHONE_TRANSFER_COPY: Record<
  SiteLocale,
  {
    heading: string;
    steps: string[];
    example: string;
    qrLabel: string;
    organizer: string;
    previews: string;
  }
> = {
  en: {
    heading: "Send phone photos to your computer",
    steps: [
      "On Vinted's listing form, choose Phone | Computer in the extension, then one item.",
      "Scan the QR code with your phone and choose your item photos.",
      "Check the received photos on your computer, then prepare your draft.",
    ],
    example:
      "Example QR screen. Start your own upload session in the extension.",
    qrLabel: "Phone upload QR (example)",
    organizer: "Organize item photos",
    previews: "Extension screenshots",
  },
  fr: {
    heading: "Envoyez les photos du téléphone à l'ordinateur",
    steps: [
      "Sur le formulaire Vinted, cliquez sur Phone | Computer dans l'extension, puis choisissez un seul article.",
      "Scannez le QR code avec votre téléphone et choisissez les photos de l'article.",
      "Vérifiez les photos reçues sur l'ordinateur, puis préparez votre brouillon.",
    ],
    example:
      "Exemple d'écran QR. Lancez votre propre session d'envoi dans l'extension.",
    qrLabel: "Envoi par QR code (exemple)",
    organizer: "Regrouper les photos par article",
    previews: "Captures de l'extension",
  },
  de: {
    heading: "Handyfotos an den Computer senden",
    steps: [
      "Wähle im Vinted-Anzeigenformular Phone | Computer in der Erweiterung und dann einen einzelnen Artikel.",
      "Scanne den QR-Code mit deinem Handy und wähle deine Artikelfotos aus.",
      "Prüfe die empfangenen Fotos am Computer und erstelle dann deinen Entwurf.",
    ],
    example:
      "Beispielansicht des QR-Codes. Starte eine eigene Upload-Sitzung in der Erweiterung.",
    qrLabel: "Handy-Upload per QR (Beispiel)",
    organizer: "Artikelfotos gruppieren",
    previews: "Screenshots der Erweiterung",
  },
  nl: {
    heading: "Stuur telefoonfoto's naar je computer",
    steps: [
      "Kies in het Vinted-advertentieformulier Phone | Computer in de extensie en daarna één artikel.",
      "Scan de QR-code met je telefoon en kies de foto's van je artikel.",
      "Controleer de ontvangen foto's op je computer en maak daarna je concept.",
    ],
    example:
      "Voorbeeld van het QR-scherm. Start je eigen uploadsessie in de extensie.",
    qrLabel: "Upload via QR (voorbeeld)",
    organizer: "Foto's per artikel groeperen",
    previews: "Screenshots van de extensie",
  },
  pl: {
    heading: "Prześlij zdjęcia z telefonu na komputer",
    steps: [
      "W formularzu ogłoszenia Vinted wybierz Phone | Computer w rozszerzeniu, a następnie jeden przedmiot.",
      "Zeskanuj kod QR telefonem i wybierz zdjęcia przedmiotu.",
      "Sprawdź odebrane zdjęcia na komputerze, a następnie przygotuj szkic ogłoszenia.",
    ],
    example:
      "Przykładowy ekran z kodem QR. Rozpocznij własną sesję przesyłania w rozszerzeniu.",
    qrLabel: "Przesyłanie przez QR (przykład)",
    organizer: "Grupowanie zdjęć przedmiotów",
    previews: "Zrzuty ekranu rozszerzenia",
  },
  es: {
    heading: "Envía fotos del móvil al ordenador",
    steps: [
      "En el formulario de Vinted, selecciona Phone | Computer en la extensión y después un solo artículo.",
      "Escanea el código QR con el móvil y elige las fotos del artículo.",
      "Comprueba las fotos recibidas en el ordenador y prepara tu borrador.",
    ],
    example:
      "Pantalla QR de ejemplo. Inicia tu propia sesión de envío en la extensión.",
    qrLabel: "Envío por QR (ejemplo)",
    organizer: "Agrupar fotos por artículo",
    previews: "Capturas de la extensión",
  },
  it: {
    heading: "Invia le foto dal telefono al computer",
    steps: [
      "Nel modulo dell'annuncio Vinted, scegli Phone | Computer nell'estensione, poi un solo articolo.",
      "Scansiona il codice QR con il telefono e scegli le foto dell'articolo.",
      "Controlla le foto ricevute sul computer, poi prepara la bozza.",
    ],
    example:
      "Schermata QR di esempio. Avvia una sessione di invio nell'estensione.",
    qrLabel: "Invio tramite QR (esempio)",
    organizer: "Raggruppa le foto per articolo",
    previews: "Schermate dell'estensione",
  },
  pt: {
    heading: "Envia fotografias do telemóvel para o computador",
    steps: [
      "No formulário do anúncio Vinted, escolhe Phone | Computer na extensão e depois um único artigo.",
      "Lê o código QR com o telemóvel e escolhe as fotografias do artigo.",
      "Confirma as fotografias recebidas no computador e prepara o rascunho.",
    ],
    example:
      "Exemplo do ecrã QR. Inicia a tua própria sessão de envio na extensão.",
    qrLabel: "Envio por QR (exemplo)",
    organizer: "Agrupar fotografias por artigo",
    previews: "Capturas da extensão",
  },
};
