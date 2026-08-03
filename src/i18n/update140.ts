import type { SiteLocale } from "./site.js";

export type Update140Copy = {
  seo: { title: string; description: string };
  nav: { releaseLabel: string; homeLabel: string; version: string };
  scroll: { explore: string; continue: string };
  hero: {
    eyebrow: string;
    title: string;
    body: string;
    feature: string;
    featureBody: string;
  };
  batch: {
    eyebrow: string;
    title: string;
    body: string;
    benefitsLabel: string;
    benefits: [string, string, string];
  };
  review: { eyebrow: string; title: string; body: string };
  summary: {
    label: string;
    items: [
      { eyebrow: string; title: string; body: string },
      { eyebrow: string; title: string; body: string },
      { eyebrow: string; title: string; body: string },
    ];
  };
  closing: { title: string; body: string; action: string };
  shots: { wardrobe: string; phone: string; review: string };
};

export const UPDATE_140_COPY: Record<SiteLocale, Update140Copy> = {
  en: {
    seo: {
      title: "What’s new in AutoLister 1.4",
      description:
        "Rewrite wardrobe listings and upload phone photos more smoothly with AutoLister 1.4.",
    },
    nav: {
      releaseLabel: "AutoLister release",
      homeLabel: "AutoLister home",
      version: "Version",
    },
    scroll: { explore: "See what’s new", continue: "Keep scrolling" },
    hero: {
      eyebrow: "AutoLister 1.4 · What’s new",
      title: "Your wardrobe, rewritten.",
      body: "Refresh more listings. Move photos from your phone without babysitting. Keep control of every change.",
      feature: "Rewrite your wardrobe",
      featureBody:
        "Select the listings. Choose the language. Process them all at once.",
    },
    batch: {
      eyebrow: "Batch processing",
      title: "Sell the whole pile.",
      body: "Upload the photos, group each item, then sit back while AutoLister works through every listing one after another.",
      benefitsLabel: "Batch processing benefits",
      benefits: [
        "Upload from your phone",
        "Or upload photos or a folder from your computer",
        "Let the whole batch run automatically",
      ],
    },
    review: {
      eyebrow: "Review first",
      title: "Check it before it changes.",
      body: "See the new title and description first. Use either suggestion or keep your current text.",
    },
    summary: {
      label: "AutoLister 1.4 highlights",
      items: [
        {
          eyebrow: "Wardrobe",
          title: "Rewrite multiple listings",
          body: "Select them once. Process them all at once.",
        },
        {
          eyebrow: "Batch processing",
          title: "Let the listings run automatically",
          body: "Upload once, then let AutoLister work through the pile.",
        },
        {
          eyebrow: "Review first",
          title: "Apply only what you want",
          body: "Your existing text stays until you choose.",
        },
      ],
    },
    closing: {
      title: "Ready when you are.",
      body: "The update is installed. Open your Vinted wardrobe to try it.",
      action: "Open Vinted",
    },
    shots: {
      wardrobe:
        "AutoLister wardrobe rewrite widget, selected listings, and toolbar",
      phone: "AutoLister phone upload and desktop batch receiving state",
      review: "AutoLister title and description review suggestions on Vinted",
    },
  },
  fr: {
    seo: {
      title: "Nouveautés d’AutoLister 1.4",
      description:
        "Actualisez vos annonces et transférez plus facilement les photos de votre téléphone avec AutoLister 1.4.",
    },
    nav: {
      releaseLabel: "Nouveautés AutoLister",
      homeLabel: "Accueil AutoLister",
      version: "Version",
    },
    scroll: { explore: "Voir les nouveautés", continue: "Continuez à défiler" },
    hero: {
      eyebrow: "AutoLister 1.4 · Nouveautés",
      title: "Votre dressing, réécrit.",
      body: "Actualisez plus d’annonces. Transférez vos photos sans surveillance. Gardez le contrôle sur chaque modification.",
      feature: "Réécrivez votre dressing",
      featureBody:
        "Sélectionnez les annonces. Choisissez la langue. Traitez-les toutes à la fois.",
    },
    batch: {
      eyebrow: "Traitement par lots",
      title: "Vendez toute la pile.",
      body: "Ajoutez les photos, regroupez chaque article, puis laissez AutoLister créer les annonces l’une après l’autre.",
      benefitsLabel: "Avantages du traitement par lots",
      benefits: [
        "Importez depuis votre téléphone",
        "Ou depuis des photos ou un dossier sur votre ordinateur",
        "Laissez tout le lot s’exécuter automatiquement",
      ],
    },
    review: {
      eyebrow: "Vérifier d’abord",
      title: "Vérifiez avant de modifier.",
      body: "Consultez d’abord le nouveau titre et la description. Utilisez une suggestion ou gardez votre texte actuel.",
    },
    summary: {
      label: "Points forts d’AutoLister 1.4",
      items: [
        {
          eyebrow: "Dressing",
          title: "Réécrivez plusieurs annonces",
          body: "Sélectionnez-les une fois. Traitez-les toutes à la fois.",
        },
        {
          eyebrow: "Traitement par lots",
          title: "Laissez les annonces s’enchaîner",
          body: "Importez une fois, puis laissez AutoLister traiter toute la pile.",
        },
        {
          eyebrow: "Vérifier d’abord",
          title: "Appliquez seulement ce qui vous plaît",
          body: "Votre texte reste intact jusqu’à votre choix.",
        },
      ],
    },
    closing: {
      title: "À vous de jouer.",
      body: "La mise à jour est installée. Ouvrez votre dressing Vinted pour l’essayer.",
      action: "Ouvrir Vinted",
    },
    shots: {
      wardrobe:
        "Widget de réécriture du dressing AutoLister, annonces sélectionnées et barre d’outils",
      phone:
        "Import de photos depuis le téléphone et réception du lot sur ordinateur",
      review: "Suggestions AutoLister de titre et de description sur Vinted",
    },
  },
  de: {
    seo: {
      title: "Neu in AutoLister 1.4",
      description:
        "Überarbeite Kleiderschrank-Anzeigen und übertrage Handyfotos einfacher mit AutoLister 1.4.",
    },
    nav: {
      releaseLabel: "AutoLister-Neuigkeiten",
      homeLabel: "AutoLister-Startseite",
      version: "Version",
    },
    scroll: { explore: "Neues entdecken", continue: "Weiter scrollen" },
    hero: {
      eyebrow: "AutoLister 1.4 · Neu",
      title: "Dein Kleider­schrank, neu geschrieben.",
      body: "Überarbeite mehr Anzeigen. Übertrage Fotos vom Handy ohne Warten. Behalte jede Änderung unter Kontrolle.",
      feature: "Kleiderschrank überarbeiten",
      featureBody:
        "Anzeigen auswählen. Sprache festlegen. Alles auf einmal verarbeiten.",
    },
    batch: {
      eyebrow: "Stapelverarbeitung",
      title: "Verkaufe den ganzen Stapel.",
      body: "Fotos hochladen, Artikel gruppieren und entspannen, während AutoLister eine Anzeige nach der anderen erstellt.",
      benefitsLabel: "Vorteile der Stapelverarbeitung",
      benefits: [
        "Vom Handy hochladen",
        "Oder Fotos bzw. einen Ordner vom Computer auswählen",
        "Den ganzen Stapel automatisch verarbeiten lassen",
      ],
    },
    review: {
      eyebrow: "Erst prüfen",
      title: "Prüfe es vor der Änderung.",
      body: "Sieh dir den neuen Titel und die Beschreibung zuerst an. Übernimm einen Vorschlag oder behalte deinen Text.",
    },
    summary: {
      label: "Highlights von AutoLister 1.4",
      items: [
        {
          eyebrow: "Kleiderschrank",
          title: "Mehrere Anzeigen überarbeiten",
          body: "Einmal auswählen. Alles auf einmal verarbeiten.",
        },
        {
          eyebrow: "Stapelverarbeitung",
          title: "Anzeigen automatisch durchlaufen lassen",
          body: "Einmal hochladen und AutoLister den Stapel abarbeiten lassen.",
        },
        {
          eyebrow: "Erst prüfen",
          title: "Nur übernehmen, was dir gefällt",
          body: "Dein bisheriger Text bleibt, bis du dich entscheidest.",
        },
      ],
    },
    closing: {
      title: "Bereit, wenn du es bist.",
      body: "Das Update ist installiert. Öffne deinen Vinted-Kleiderschrank und probiere es aus.",
      action: "Vinted öffnen",
    },
    shots: {
      wardrobe:
        "AutoLister-Widget zur Überarbeitung des Kleiderschranks mit ausgewählten Anzeigen",
      phone: "Handy-Fotoupload und Stapelübertragung auf den Computer",
      review: "AutoLister-Vorschläge für Titel und Beschreibung auf Vinted",
    },
  },
  nl: {
    seo: {
      title: "Nieuw in AutoLister 1.4",
      description:
        "Herschrijf kledingkastadvertenties en verplaats telefoonfoto’s soepeler met AutoLister 1.4.",
    },
    nav: {
      releaseLabel: "AutoLister-update",
      homeLabel: "AutoLister-homepage",
      version: "Versie",
    },
    scroll: { explore: "Bekijk wat er nieuw is", continue: "Blijf scrollen" },
    hero: {
      eyebrow: "AutoLister 1.4 · Nieuw",
      title: "Je kledingkast, herschreven.",
      body: "Vernieuw meer advertenties. Verplaats foto’s vanaf je telefoon zonder erbij te blijven. Houd controle over elke wijziging.",
      feature: "Herschrijf je kledingkast",
      featureBody:
        "Selecteer advertenties. Kies de taal. Verwerk alles tegelijk.",
    },
    batch: {
      eyebrow: "Batchverwerking",
      title: "Verkoop de hele stapel.",
      body: "Upload de foto’s, groepeer elk item en leun achterover terwijl AutoLister de advertenties één voor één afwerkt.",
      benefitsLabel: "Voordelen van batchverwerking",
      benefits: [
        "Upload vanaf je telefoon",
        "Of kies foto’s of een map op je computer",
        "Laat de hele batch automatisch draaien",
      ],
    },
    review: {
      eyebrow: "Eerst bekijken",
      title: "Controleer vóór er iets verandert.",
      body: "Bekijk eerst de nieuwe titel en beschrijving. Gebruik een suggestie of behoud je huidige tekst.",
    },
    summary: {
      label: "Hoogtepunten van AutoLister 1.4",
      items: [
        {
          eyebrow: "Kledingkast",
          title: "Herschrijf meerdere advertenties",
          body: "Eén keer selecteren. Alles tegelijk verwerken.",
        },
        {
          eyebrow: "Batchverwerking",
          title: "Laat advertenties automatisch doorlopen",
          body: "Upload één keer en laat AutoLister de stapel afwerken.",
        },
        {
          eyebrow: "Eerst bekijken",
          title: "Pas alleen toe wat je wilt",
          body: "Je bestaande tekst blijft staan tot jij kiest.",
        },
      ],
    },
    closing: {
      title: "Klaar wanneer jij dat bent.",
      body: "De update is geïnstalleerd. Open je Vinted-kledingkast om hem te proberen.",
      action: "Vinted openen",
    },
    shots: {
      wardrobe:
        "AutoLister-widget voor het herschrijven van je kledingkast met geselecteerde advertenties",
      phone: "Foto-upload vanaf telefoon en batchontvangst op de computer",
      review: "AutoLister-suggesties voor titel en beschrijving op Vinted",
    },
  },
  pl: {
    seo: {
      title: "Nowości w AutoLister 1.4",
      description:
        "Odświeżaj ogłoszenia i sprawniej przesyłaj zdjęcia z telefonu dzięki AutoLister 1.4.",
    },
    nav: {
      releaseLabel: "Nowości AutoLister",
      homeLabel: "Strona główna AutoLister",
      version: "Wersja",
    },
    scroll: { explore: "Zobacz nowości", continue: "Przewijaj dalej" },
    hero: {
      eyebrow: "AutoLister 1.4 · Nowości",
      title: "Twoja szafa, napisana od nowa.",
      body: "Odświeżaj więcej ogłoszeń. Przesyłaj zdjęcia z telefonu bez pilnowania. Kontroluj każdą zmianę.",
      feature: "Odśwież swoją szafę",
      featureBody: "Wybierz ogłoszenia. Ustaw język. Przetwórz wszystko naraz.",
    },
    batch: {
      eyebrow: "Przetwarzanie grupowe",
      title: "Sprzedaj cały stos.",
      body: "Prześlij zdjęcia, pogrupuj przedmioty i odpocznij, gdy AutoLister tworzy kolejne ogłoszenia.",
      benefitsLabel: "Zalety przetwarzania grupowego",
      benefits: [
        "Prześlij z telefonu",
        "Albo wybierz zdjęcia lub folder na komputerze",
        "Uruchom cały zestaw automatycznie",
      ],
    },
    review: {
      eyebrow: "Najpierw sprawdź",
      title: "Sprawdź przed zmianą.",
      body: "Najpierw zobacz nowy tytuł i opis. Użyj sugestii albo zachowaj obecny tekst.",
    },
    summary: {
      label: "Najważniejsze zmiany w AutoLister 1.4",
      items: [
        {
          eyebrow: "Szafa",
          title: "Odśwież wiele ogłoszeń",
          body: "Wybierz raz. Przetwórz wszystko naraz.",
        },
        {
          eyebrow: "Przetwarzanie grupowe",
          title: "Pozwól ogłoszeniom tworzyć się automatycznie",
          body: "Prześlij raz i pozwól AutoLister zająć się całym stosem.",
        },
        {
          eyebrow: "Najpierw sprawdź",
          title: "Zastosuj tylko to, co chcesz",
          body: "Obecny tekst pozostaje, dopóki nie zdecydujesz.",
        },
      ],
    },
    closing: {
      title: "Gotowe, gdy Ty jesteś gotowy.",
      body: "Aktualizacja jest zainstalowana. Otwórz swoją szafę Vinted i wypróbuj ją.",
      action: "Otwórz Vinted",
    },
    shots: {
      wardrobe:
        "Widżet AutoLister do odświeżania szafy z wybranymi ogłoszeniami",
      phone: "Przesyłanie zdjęć z telefonu i odbieranie zestawu na komputerze",
      review: "Sugestie tytułu i opisu AutoLister w Vinted",
    },
  },
  es: {
    seo: {
      title: "Novedades de AutoLister 1.4",
      description:
        "Renueva anuncios y transfiere fotos del móvil con más facilidad gracias a AutoLister 1.4.",
    },
    nav: {
      releaseLabel: "Novedades de AutoLister",
      homeLabel: "Inicio de AutoLister",
      version: "Versión",
    },
    scroll: { explore: "Ver las novedades", continue: "Sigue desplazándote" },
    hero: {
      eyebrow: "AutoLister 1.4 · Novedades",
      title: "Tu armario, reescrito.",
      body: "Renueva más anuncios. Pasa fotos desde el móvil sin estar pendiente. Mantén el control de cada cambio.",
      feature: "Reescribe tu armario",
      featureBody:
        "Selecciona los anuncios. Elige el idioma. Procésalos todos a la vez.",
    },
    batch: {
      eyebrow: "Procesamiento por lotes",
      title: "Vende toda la pila.",
      body: "Sube las fotos, agrupa cada artículo y relájate mientras AutoLister prepara los anuncios uno tras otro.",
      benefitsLabel: "Ventajas del procesamiento por lotes",
      benefits: [
        "Sube fotos desde el móvil",
        "O elige fotos o una carpeta en el ordenador",
        "Deja que todo el lote se procese automáticamente",
      ],
    },
    review: {
      eyebrow: "Revisar primero",
      title: "Revísalo antes de cambiar.",
      body: "Mira primero el título y la descripción nuevos. Usa una sugerencia o conserva tu texto actual.",
    },
    summary: {
      label: "Lo mejor de AutoLister 1.4",
      items: [
        {
          eyebrow: "Armario",
          title: "Reescribe varios anuncios",
          body: "Selecciónalos una vez. Procésalos todos a la vez.",
        },
        {
          eyebrow: "Procesamiento por lotes",
          title: "Deja que los anuncios avancen solos",
          body: "Sube una vez y deja que AutoLister procese toda la pila.",
        },
        {
          eyebrow: "Revisar primero",
          title: "Aplica solo lo que quieras",
          body: "Tu texto actual no cambia hasta que tú decidas.",
        },
      ],
    },
    closing: {
      title: "Listo cuando tú quieras.",
      body: "La actualización ya está instalada. Abre tu armario de Vinted para probarla.",
      action: "Abrir Vinted",
    },
    shots: {
      wardrobe:
        "Widget de AutoLister para reescribir el armario con anuncios seleccionados",
      phone:
        "Carga de fotos desde el móvil y recepción del lote en el ordenador",
      review:
        "Sugerencias de AutoLister para el título y la descripción en Vinted",
    },
  },
  it: {
    seo: {
      title: "Novità di AutoLister 1.4",
      description:
        "Aggiorna gli annunci e trasferisci più facilmente le foto dal telefono con AutoLister 1.4.",
    },
    nav: {
      releaseLabel: "Novità di AutoLister",
      homeLabel: "Home di AutoLister",
      version: "Versione",
    },
    scroll: { explore: "Scopri le novità", continue: "Continua a scorrere" },
    hero: {
      eyebrow: "AutoLister 1.4 · Novità",
      title: "Il tuo armadio, riscritto.",
      body: "Aggiorna più annunci. Trasferisci le foto dal telefono senza dover aspettare. Mantieni il controllo su ogni modifica.",
      feature: "Riscrivi il tuo armadio",
      featureBody:
        "Seleziona gli annunci. Scegli la lingua. Elaborali tutti insieme.",
    },
    batch: {
      eyebrow: "Elaborazione in serie",
      title: "Vendi tutta la pila.",
      body: "Carica le foto, raggruppa ogni articolo e rilassati mentre AutoLister crea gli annunci uno dopo l’altro.",
      benefitsLabel: "Vantaggi dell’elaborazione in serie",
      benefits: [
        "Carica dal telefono",
        "Oppure scegli foto o una cartella dal computer",
        "Lascia che l’intero gruppo proceda automaticamente",
      ],
    },
    review: {
      eyebrow: "Prima controlla",
      title: "Controlla prima di cambiare.",
      body: "Guarda prima il nuovo titolo e la descrizione. Usa un suggerimento oppure mantieni il testo attuale.",
    },
    summary: {
      label: "Punti forti di AutoLister 1.4",
      items: [
        {
          eyebrow: "Armadio",
          title: "Riscrivi più annunci",
          body: "Selezionali una volta. Elaborali tutti insieme.",
        },
        {
          eyebrow: "Elaborazione in serie",
          title: "Lascia procedere gli annunci automaticamente",
          body: "Carica una volta e lascia che AutoLister elabori tutta la pila.",
        },
        {
          eyebrow: "Prima controlla",
          title: "Applica solo ciò che vuoi",
          body: "Il testo attuale resta invariato finché non scegli.",
        },
      ],
    },
    closing: {
      title: "Pronto quando vuoi.",
      body: "L’aggiornamento è installato. Apri il tuo armadio Vinted per provarlo.",
      action: "Apri Vinted",
    },
    shots: {
      wardrobe:
        "Widget AutoLister per riscrivere l’armadio con annunci selezionati",
      phone:
        "Caricamento di foto dal telefono e ricezione del gruppo sul computer",
      review: "Suggerimenti AutoLister per titolo e descrizione su Vinted",
    },
  },
  pt: {
    seo: {
      title: "Novidades do AutoLister 1.4",
      description:
        "Atualize anúncios e transfira fotografias do telemóvel com mais facilidade no AutoLister 1.4.",
    },
    nav: {
      releaseLabel: "Novidades do AutoLister",
      homeLabel: "Página inicial do AutoLister",
      version: "Versão",
    },
    scroll: { explore: "Ver as novidades", continue: "Continue a deslocar" },
    hero: {
      eyebrow: "AutoLister 1.4 · Novidades",
      title: "O seu roupeiro, reescrito.",
      body: "Atualize mais anúncios. Transfira fotografias do telemóvel sem ficar à espera. Mantenha o controlo de cada alteração.",
      feature: "Reescreva o seu roupeiro",
      featureBody:
        "Selecione os anúncios. Escolha o idioma. Processe tudo de uma vez.",
    },
    batch: {
      eyebrow: "Processamento em lote",
      title: "Venda a pilha toda.",
      body: "Carregue as fotografias, agrupe cada artigo e descontraia enquanto o AutoLister cria os anúncios um após outro.",
      benefitsLabel: "Vantagens do processamento em lote",
      benefits: [
        "Carregue a partir do telemóvel",
        "Ou escolha fotografias ou uma pasta no computador",
        "Deixe o lote inteiro avançar automaticamente",
      ],
    },
    review: {
      eyebrow: "Rever primeiro",
      title: "Verifique antes de alterar.",
      body: "Veja primeiro o novo título e a descrição. Use uma sugestão ou mantenha o texto atual.",
    },
    summary: {
      label: "Destaques do AutoLister 1.4",
      items: [
        {
          eyebrow: "Roupeiro",
          title: "Reescreva vários anúncios",
          body: "Selecione uma vez. Processe tudo de uma vez.",
        },
        {
          eyebrow: "Processamento em lote",
          title: "Deixe os anúncios avançar automaticamente",
          body: "Carregue uma vez e deixe o AutoLister tratar da pilha.",
        },
        {
          eyebrow: "Rever primeiro",
          title: "Aplique apenas o que quiser",
          body: "O texto atual mantém-se até decidir.",
        },
      ],
    },
    closing: {
      title: "Pronto quando estiver.",
      body: "A atualização está instalada. Abra o seu roupeiro Vinted para experimentar.",
      action: "Abrir Vinted",
    },
    shots: {
      wardrobe:
        "Widget AutoLister para reescrever o roupeiro com anúncios selecionados",
      phone:
        "Carregamento de fotografias pelo telemóvel e receção do lote no computador",
      review: "Sugestões AutoLister de título e descrição na Vinted",
    },
  },
};
