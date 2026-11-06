import type { SiteLocale } from "./site.js";

export const HOME_MODEL_COPY: Record<
  SiteLocale,
  {
    badge: string;
    teaser: string;
    heading: string;
    body: string;
    action: string;
    extensionAction: string;
    original: string;
    front: string;
    back: string;
    note: string;
    originalAlt: string;
    frontAlt: string;
    backAlt: string;
  }
> = {
  en: {
    badge: "New",
    teaser: "AI model photos",
    heading: "Show your items on your own AI model.",
    body: "Create your model once. Add two model photos to eligible listings, alongside your originals.",
    action: "Try it in the web app",
    extensionAction: "Get the extension",
    original: "Original photo",
    front: "AI front view",
    back: "Second AI photo",
    note: "AI-generated examples. Check item details before using the photos.",
    originalAlt: "Original photo of a beige embroidered top on a hanger",
    frontAlt: "AI model wearing the beige embroidered top, front view",
    backAlt:
      "A second AI photo of the same model wearing the beige embroidered top",
  },
  fr: {
    badge: "Nouveau",
    teaser: "Photos sur mannequin IA",
    heading: "Présentez vos articles sur votre propre mannequin IA.",
    body: "Créez votre mannequin une seule fois. Ajoutez deux photos sur mannequin aux annonces compatibles, en plus de vos photos d’origine.",
    action: "Essayer dans l’appli web",
    extensionAction: "Installer l’extension",
    original: "Photo d’origine",
    front: "Vue de face IA",
    back: "Deuxième photo IA",
    note: "Exemples générés par IA. Vérifiez les détails de l’article avant d’utiliser les photos.",
    originalAlt: "Photo d’origine d’un haut beige brodé sur un cintre",
    frontAlt: "Mannequin IA portant le haut beige brodé, de face",
    backAlt: "Deuxième photo IA du même mannequin portant le haut beige brodé",
  },
  de: {
    badge: "Neu",
    teaser: "Fotos mit deinem KI-Model",
    heading: "Zeige deine Artikel an deinem eigenen KI-Model.",
    body: "Erstelle dein Model einmal. Ergänze geeignete Anzeigen mit zwei Modelfotos, zusätzlich zu deinen Originalfotos.",
    action: "In der Web-App ausprobieren",
    extensionAction: "Erweiterung installieren",
    original: "Originalfoto",
    front: "KI-Vorderansicht",
    back: "Zweites KI-Foto",
    note: "KI-generierte Beispiele. Prüfe die Artikeldetails, bevor du die Fotos verwendest.",
    originalAlt:
      "Originalfoto eines beigefarbenen bestickten Oberteils am Bügel",
    frontAlt: "KI-Model im beigefarbenen bestickten Oberteil von vorne",
    backAlt:
      "Zweites KI-Foto desselben Models im beigefarbenen bestickten Oberteil",
  },
  nl: {
    badge: "Nieuw",
    teaser: "Foto’s met je AI-model",
    heading: "Laat je artikelen zien op je eigen AI-model.",
    body: "Maak je model één keer. Voeg twee modelfoto’s toe aan geschikte advertenties, naast je originele foto’s.",
    action: "Probeer het in de webapp",
    extensionAction: "Installeer de extensie",
    original: "Originele foto",
    front: "AI-vooraanzicht",
    back: "Tweede AI-foto",
    note: "AI-gegenereerde voorbeelden. Controleer de artikeldetails voordat je de foto’s gebruikt.",
    originalAlt: "Originele foto van een beige geborduurde top op een hanger",
    frontAlt: "AI-model met de beige geborduurde top, van voren",
    backAlt:
      "Een tweede AI-foto van hetzelfde model met de beige geborduurde top",
  },
  es: {
    badge: "Nuevo",
    teaser: "Fotos con tu modelo de IA",
    heading: "Muestra tus artículos en tu propio modelo de IA.",
    body: "Crea tu modelo una sola vez. Añade dos fotos con modelo a los anuncios compatibles, junto a tus fotos originales.",
    action: "Pruébalo en la aplicación web",
    extensionAction: "Instalar la extensión",
    original: "Foto original",
    front: "Vista frontal con IA",
    back: "Segunda foto con IA",
    note: "Ejemplos generados con IA. Revisa los detalles del artículo antes de usar las fotos.",
    originalAlt: "Foto original de un top beige bordado en una percha",
    frontAlt: "Modelo de IA con el top beige bordado, de frente",
    backAlt: "Segunda foto de IA del mismo modelo con el top beige bordado",
  },
  it: {
    badge: "Novità",
    teaser: "Foto con il tuo modello IA",
    heading: "Mostra i tuoi articoli sul tuo modello IA.",
    body: "Crea il tuo modello una sola volta. Aggiungi due foto con modello agli annunci compatibili, insieme alle foto originali.",
    action: "Provalo nell’app web",
    extensionAction: "Installa l’estensione",
    original: "Foto originale",
    front: "Vista davanti IA",
    back: "Seconda foto IA",
    note: "Esempi generati con IA. Controlla i dettagli dell’articolo prima di usare le foto.",
    originalAlt: "Foto originale di un top beige ricamato su una gruccia",
    frontAlt: "Modello IA con il top beige ricamato, visto da davanti",
    backAlt: "Seconda foto IA dello stesso modello con il top beige ricamato",
  },
  pl: {
    badge: "Nowość",
    teaser: "Zdjęcia z modelem AI",
    heading: "Pokaż swoje rzeczy na własnym modelu AI.",
    body: "Stwórz model raz. Dodawaj dwa zdjęcia z modelem do odpowiednich ogłoszeń, obok oryginalnych zdjęć.",
    action: "Wypróbuj w aplikacji webowej",
    extensionAction: "Zainstaluj rozszerzenie",
    original: "Oryginalne zdjęcie",
    front: "Przód z AI",
    back: "Drugie zdjęcie AI",
    note: "Przykłady wygenerowane przez AI. Sprawdź szczegóły przedmiotu przed użyciem zdjęć.",
    originalAlt: "Oryginalne zdjęcie beżowej haftowanej bluzki na wieszaku",
    frontAlt: "Model AI w beżowej haftowanej bluzce, widok z przodu",
    backAlt: "Drugie zdjęcie AI tego samego modelu w beżowej haftowanej bluzce",
  },
  pt: {
    badge: "Novo",
    teaser: "Fotos com o teu modelo de IA",
    heading: "Mostra os teus artigos no teu próprio modelo de IA.",
    body: "Cria o teu modelo uma única vez. Adiciona duas fotos com modelo aos anúncios compatíveis, juntamente com as fotos originais.",
    action: "Experimentar na aplicação web",
    extensionAction: "Instalar a extensão",
    original: "Foto original",
    front: "Vista de frente com IA",
    back: "Segunda foto com IA",
    note: "Exemplos gerados por IA. Verifica os detalhes do artigo antes de usares as fotos.",
    originalAlt: "Foto original de um top bege bordado num cabide",
    frontAlt: "Modelo de IA com o top bege bordado, de frente",
    backAlt: "Segunda foto de IA do mesmo modelo com o top bege bordado",
  },
};
