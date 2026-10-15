export type UiCopy = {
  heading: string;
  example: string;
  title: string;
  description: string;
  length: string;
  short: string;
  long: string;
  format: string;
  bullets: string;
  paragraphs: string;
  hashtags: string;
  emojis: string;
  addNote: string;
  note: string;
  done: string;
  useStyle: string;
  editStyle: string;
  skip: string;
  selected: string;
};
export type ExampleCopy = {
  title: string;
  intro: string;
  shortIntro: string;
  details: string[];
  shortDetails: string[];
  hashtags: string;
};
export type Translation = {
  code: string;
  name: string;
  ui: UiCopy;
  example: ExampleCopy;
};
function ui(values: string[]): UiCopy {
  const keys: (keyof UiCopy)[] = [
    "heading",
    "example",
    "title",
    "description",
    "length",
    "short",
    "long",
    "format",
    "bullets",
    "paragraphs",
    "hashtags",
    "emojis",
    "addNote",
    "note",
    "done",
    "useStyle",
    "editStyle",
    "skip",
    "selected",
  ];
  if (values.length !== keys.length)
    throw new Error("Incomplete UI translation");
  return Object.fromEntries(
    keys.map((key, index) => [key, values[index]]),
  ) as UiCopy;
}
/** Prepared translations of the retained Maje example. No model calls or new product facts. */
export const translations: Translation[] = [
  {
    code: "en",
    name: "English",
    ui: ui([
      "Your listing style",
      "Example",
      "Title",
      "Description",
      "Length",
      "Short",
      "Long",
      "Format",
      "Bullets",
      "Text",
      "Hashtags",
      "Emojis",
      "Add seller note",
      "Seller note",
      "Done",
      "Use this style",
      "Edit style",
      "Skip",
      "Selected",
    ]),
    example: {
      title: "Maje black wrap-style puff sleeve dress size 34",
      intro:
        "Black Maje dress in size 34, with a wrap-style front and short puff sleeves",
      shortIntro: "Maje black wrap-style dress, size 34",
      details: [
        "Textured black fabric with a subtle sparkly look throughout",
        "Deep V-neckline and fitted waist with a flared skirt",
        "Decorative gold-tone buttons on the front, two at the chest and two at the waist",
        "Short voluminous sleeves with gathered cuffs",
        "Back has a clean fitted shape with panel seams",
      ],
      shortDetails: [
        "Textured black fabric with subtle sparkle",
        "Deep V-neck, fitted waist and flared skirt",
        "Four gold-tone buttons at chest and waist",
        "Short puff sleeves with gathered cuffs",
        "Fitted back with panel seams",
      ],
      hashtags:
        "#Maje #dress #blackdress #puffsleeves #wrapdress #vneckdress #textureddress #minidress #black #womensfashion",
    },
  },
  {
    code: "fr",
    name: "Français",
    ui: ui([
      "Votre style d’annonce",
      "Exemple",
      "Titre",
      "Description",
      "Longueur",
      "Courte",
      "Longue",
      "Format",
      "Puces",
      "Texte",
      "Hashtags",
      "Emojis",
      "Ajouter une note",
      "Note du vendeur",
      "Terminé",
      "Utiliser ce style",
      "Modifier le style",
      "Passer",
      "Sélectionné",
    ]),
    example: {
      title:
        "Robe noire Maje style portefeuille à manches bouffantes, taille 34",
      intro:
        "Robe noire Maje en taille 34, avec un devant style portefeuille et des manches courtes bouffantes",
      shortIntro: "Robe noire Maje style portefeuille, taille 34",
      details: [
        "Tissu noir texturé avec un léger effet scintillant sur l’ensemble",
        "Décolleté en V profond, taille ajustée et jupe évasée",
        "Boutons décoratifs dorés sur le devant, deux à la poitrine et deux à la taille",
        "Manches courtes volumineuses avec poignets froncés",
        "Dos ajusté avec des coutures de découpe",
      ],
      shortDetails: [
        "Tissu noir texturé légèrement scintillant",
        "Décolleté en V, taille ajustée et jupe évasée",
        "Quatre boutons dorés à la poitrine et à la taille",
        "Manches courtes bouffantes, poignets froncés",
        "Dos ajusté avec coutures de découpe",
      ],
      hashtags:
        "#Maje #robe #robenoire #manchesbouffantes #robeportefeuille #colV #robetexturée #robecourte #noir #modefemme",
    },
  },
  {
    code: "cz",
    name: "Čeština",
    ui: ui([
      "Váš styl inzerátu",
      "Ukázka",
      "Název",
      "Popis",
      "Délka",
      "Krátký",
      "Dlouhý",
      "Formát",
      "Odrážky",
      "Text",
      "Hashtagy",
      "Emoji",
      "Přidat poznámku",
      "Poznámka prodejce",
      "Hotovo",
      "Použít tento styl",
      "Upravit styl",
      "Přeskočit",
      "Vybráno",
    ]),
    example: {
      title:
        "Černé šaty Maje v zavinovacím stylu s nabíranými rukávy, velikost 34",
      intro:
        "Černé šaty Maje ve velikosti 34, s předním dílem v zavinovacím stylu a krátkými nabíranými rukávy",
      shortIntro: "Černé šaty Maje v zavinovacím stylu, velikost 34",
      details: [
        "Černá strukturovaná látka s jemným třpytem po celém povrchu",
        "Hluboký výstřih do V, přiléhavý pas a rozšířená sukně",
        "Ozdobné knoflíky ve zlatém tónu vpředu, dva na hrudi a dva v pase",
        "Krátké objemné rukávy s nařasenými manžetami",
        "Přiléhavá záda s členícími švy",
      ],
      shortDetails: [
        "Černá strukturovaná látka s jemným třpytem",
        "Výstřih do V, přiléhavý pas a rozšířená sukně",
        "Čtyři zlatavé knoflíky na hrudi a v pase",
        "Krátké nabírané rukávy s řasenými manžetami",
        "Přiléhavá záda s členícími švy",
      ],
      hashtags:
        "#Maje #šaty #černéšaty #nabíranérukávy #zavinovacístyl #výstřihdoV #krátkéšaty #černá #dámskámóda",
    },
  },
  {
    code: "da",
    name: "Dansk",
    ui: ui([
      "Din annoncestil",
      "Eksempel",
      "Titel",
      "Beskrivelse",
      "Længde",
      "Kort",
      "Lang",
      "Format",
      "Punkter",
      "Tekst",
      "Hashtags",
      "Emojis",
      "Tilføj sælgernote",
      "Sælgernote",
      "Færdig",
      "Brug denne stil",
      "Rediger stil",
      "Spring over",
      "Valgt",
    ]),
    example: {
      title: "Sort Maje-kjole i slå om-stil med pufærmer, størrelse 34",
      intro:
        "Sort Maje-kjole i størrelse 34 med en front i slå om-stil og korte pufærmer",
      shortIntro: "Sort Maje-kjole i slå om-stil, størrelse 34",
      details: [
        "Sort stof med struktur og et diskret glitrende udtryk over det hele",
        "Dyb V-udskæring, tætsiddende talje og udvidet nederdel",
        "Dekorative guldfarvede knapper foran, to ved brystet og to ved taljen",
        "Korte fyldige ærmer med rynkede manchetter",
        "Tætsiddende ryg med panelsømme",
      ],
      shortDetails: [
        "Sort struktureret stof med diskret glimmer",
        "Dyb V-hals, markeret talje og vid nederdel",
        "Fire guldfarvede knapper ved bryst og talje",
        "Korte pufærmer med rynkede manchetter",
        "Tætsiddende ryg med panelsømme",
      ],
      hashtags:
        "#Maje #kjole #sortkjole #pufærmer #slåomstil #vhals #kortkjole #sort #damemode",
    },
  },
  {
    code: "nl",
    name: "Nederlands",
    ui: ui([
      "Jouw advertentiestijl",
      "Voorbeeld",
      "Titel",
      "Beschrijving",
      "Lengte",
      "Kort",
      "Lang",
      "Opmaak",
      "Lijst",
      "Tekst",
      "Hashtags",
      "Emoji’s",
      "Verkoopnotitie toevoegen",
      "Verkoopnotitie",
      "Klaar",
      "Gebruik deze stijl",
      "Stijl aanpassen",
      "Overslaan",
      "Gekozen",
    ]),
    example: {
      title: "Zwarte Maje-jurk in wikkelstijl met pofmouwen, maat 34",
      intro:
        "Zwarte Maje-jurk in maat 34, met een voorkant in wikkelstijl en korte pofmouwen",
      shortIntro: "Zwarte Maje-jurk in wikkelstijl, maat 34",
      details: [
        "Zwarte stof met structuur en een subtiele glinstering over het hele oppervlak",
        "Diepe V-hals, aansluitende taille en uitlopende rok",
        "Decoratieve goudkleurige knopen aan de voorkant, twee bij de borst en twee bij de taille",
        "Korte volumineuze mouwen met gerimpelde manchetten",
        "Aansluitende achterkant met deelnaden",
      ],
      shortDetails: [
        "Zwarte stof met structuur en subtiele glinstering",
        "Diepe V-hals, aansluitende taille en uitlopende rok",
        "Vier goudkleurige knopen bij borst en taille",
        "Korte pofmouwen met gerimpelde manchetten",
        "Aansluitende rug met deelnaden",
      ],
      hashtags:
        "#Maje #jurk #zwartejurk #pofmouwen #wikkelstijl #vhals #kortejurk #zwart #damesmode",
    },
  },
  {
    code: "de",
    name: "Deutsch",
    ui: ui([
      "Dein Anzeigenstil",
      "Beispiel",
      "Titel",
      "Beschreibung",
      "Länge",
      "Kurz",
      "Lang",
      "Format",
      "Liste",
      "Text",
      "Hashtags",
      "Emojis",
      "Verkäufernotiz hinzufügen",
      "Verkäufernotiz",
      "Fertig",
      "Diesen Stil verwenden",
      "Stil bearbeiten",
      "Überspringen",
      "Ausgewählt",
    ]),
    example: {
      title: "Schwarzes Maje-Kleid in Wickeloptik mit Puffärmeln, Größe 34",
      intro:
        "Schwarzes Maje-Kleid in Größe 34 mit Vorderseite in Wickeloptik und kurzen Puffärmeln",
      shortIntro: "Schwarzes Maje-Kleid in Wickeloptik, Größe 34",
      details: [
        "Strukturierter schwarzer Stoff mit dezentem Glitzereffekt auf der gesamten Fläche",
        "Tiefer V-Ausschnitt, anliegende Taille und ausgestellter Rock",
        "Dekorative goldfarbene Knöpfe vorne, zwei auf Brusthöhe und zwei an der Taille",
        "Kurze voluminöse Ärmel mit gerafften Bündchen",
        "Anliegende Rückenpartie mit Teilungsnähten",
      ],
      shortDetails: [
        "Schwarzer Strukturstoff mit dezentem Glitzer",
        "Tiefer V-Ausschnitt, anliegende Taille, weiter Rock",
        "Vier goldfarbene Knöpfe an Brust und Taille",
        "Kurze Puffärmel mit gerafften Bündchen",
        "Anliegender Rücken mit Teilungsnähten",
      ],
      hashtags:
        "#Maje #Kleid #schwarzesKleid #Puffärmel #Wickeloptik #VAusschnitt #Minikleid #schwarz #Damenmode",
    },
  },
  {
    code: "el",
    name: "Ελληνικά",
    ui: ui([
      "Το στιλ της αγγελίας σας",
      "Παράδειγμα",
      "Τίτλος",
      "Περιγραφή",
      "Μήκος",
      "Σύντομη",
      "Εκτενής",
      "Μορφή",
      "Λίστα",
      "Κείμενο",
      "Hashtags",
      "Emoji",
      "Προσθήκη σημείωσης",
      "Σημείωση πωλητή",
      "Έτοιμο",
      "Χρήση αυτού του στιλ",
      "Αλλαγή στιλ",
      "Παράλειψη",
      "Επιλέχθηκε",
    ]),
    example: {
      title:
        "Μαύρο φόρεμα Maje σε κρουαζέ στιλ με φουσκωτά μανίκια, μέγεθος 34",
      intro:
        "Μαύρο φόρεμα Maje σε μέγεθος 34, με μπροστινό μέρος σε κρουαζέ στιλ και κοντά φουσκωτά μανίκια",
      shortIntro: "Μαύρο φόρεμα Maje σε κρουαζέ στιλ, μέγεθος 34",
      details: [
        "Μαύρο ύφασμα με ανάγλυφη υφή και διακριτική λάμψη σε όλη την επιφάνεια",
        "Βαθύ ντεκολτέ σε V, εφαρμοστή μέση και φούστα που ανοίγει προς τα κάτω",
        "Διακοσμητικά χρυσαφί κουμπιά μπροστά, δύο στο στήθος και δύο στη μέση",
        "Κοντά μανίκια με όγκο και σούρα στις μανσέτες",
        "Εφαρμοστή πλάτη με ραφές που χωρίζουν το ύφασμα σε τμήματα",
      ],
      shortDetails: [
        "Μαύρο ανάγλυφο ύφασμα με διακριτική λάμψη",
        "Βαθύ V, εφαρμοστή μέση και φούστα που ανοίγει",
        "Τέσσερα χρυσαφί κουμπιά στο στήθος και τη μέση",
        "Κοντά φουσκωτά μανίκια με σουρωτές μανσέτες",
        "Εφαρμοστή πλάτη με ραφές τμημάτων",
      ],
      hashtags:
        "#Maje #φόρεμα #μαύροφόρεμα #φουσκωτάμανίκια #κρουαζέ #ντεκολτέV #κοντόφόρεμα #μαύρο #γυναικείαμόδα",
    },
  },
  {
    code: "hr",
    name: "Hrvatski",
    ui: ui([
      "Vaš stil oglasa",
      "Primjer",
      "Naslov",
      "Opis",
      "Duljina",
      "Kratki",
      "Dugi",
      "Format",
      "Popis",
      "Tekst",
      "Hashtagovi",
      "Emojiji",
      "Dodaj napomenu",
      "Napomena prodavača",
      "Gotovo",
      "Koristi ovaj stil",
      "Uredi stil",
      "Preskoči",
      "Odabrano",
    ]),
    example: {
      title: "Crna Maje haljina u stilu na preklop s puf rukavima, veličina 34",
      intro:
        "Crna Maje haljina u veličini 34, s prednjim dijelom u stilu na preklop i kratkim puf rukavima",
      shortIntro: "Crna Maje haljina u stilu na preklop, veličina 34",
      details: [
        "Crna tkanina s teksturom i diskretnim svjetlucavim efektom po cijeloj površini",
        "Duboki V-izrez, pripijeni struk i proširena suknja",
        "Ukrasni gumbi zlatne boje sprijeda, dva na prsima i dva u struku",
        "Kratki voluminozni rukavi s nabranim manšetama",
        "Pripijena leđa s krojnim šavovima",
      ],
      shortDetails: [
        "Crna teksturirana tkanina s blagim sjajem",
        "Duboki V-izrez, pripijeni struk i proširena suknja",
        "Četiri gumba zlatne boje na prsima i u struku",
        "Kratki puf rukavi s nabranim manšetama",
        "Pripijena leđa s krojnim šavovima",
      ],
      hashtags:
        "#Maje #haljina #crnahaljina #pufrukavi #preklop #Vizrez #kratkahaljina #crna #ženskamoda",
    },
  },
  {
    code: "fi",
    name: "Suomeksi",
    ui: ui([
      "Ilmoituksesi tyyli",
      "Esimerkki",
      "Otsikko",
      "Kuvaus",
      "Pituus",
      "Lyhyt",
      "Pitkä",
      "Muoto",
      "Lista",
      "Teksti",
      "Hashtagit",
      "Emojit",
      "Lisää myyjän huomautus",
      "Myyjän huomautus",
      "Valmis",
      "Käytä tätä tyyliä",
      "Muokkaa tyyliä",
      "Ohita",
      "Valittu",
    ]),
    example: {
      title: "Maje musta kietaisutyylinen mekko puffihihoilla, koko 34",
      intro:
        "Musta Maje-mekko koossa 34, kietaisutyylinen etuosa ja lyhyet puffihihat",
      shortIntro: "Musta kietaisutyylinen Maje-mekko, koko 34",
      details: [
        "Mustassa pintakuvioidussa kankaassa on hienovaraista kimallusta kauttaaltaan",
        "Syvä V-pääntie, istuva vyötärö ja levenevä helma",
        "Edessä kullanväriset koristenapit, kaksi rinnalla ja kaksi vyötäröllä",
        "Lyhyet runsaat hihat ja poimutetut hihansuut",
        "Istuvassa selkäosassa on leikkaussaumat",
      ],
      shortDetails: [
        "Musta pintakuvioitu kangas, hienovarainen kimallus",
        "Syvä V-pääntie, istuva vyötärö, levenevä helma",
        "Neljä kullanväristä nappia rinnalla ja vyötäröllä",
        "Lyhyet puffihihat, poimutetut hihansuut",
        "Istuva selkäosa leikkaussaumoilla",
      ],
      hashtags:
        "#Maje #mekko #mustamekko #puffihihat #kietaisutyyli #Vpääntie #lyhytmekko #musta #naistenmuoti",
    },
  },
  {
    code: "hu",
    name: "Magyar",
    ui: ui([
      "A hirdetésed stílusa",
      "Példa",
      "Cím",
      "Leírás",
      "Hossz",
      "Rövid",
      "Hosszú",
      "Formátum",
      "Lista",
      "Szöveg",
      "Hashtagek",
      "Emojik",
      "Eladói megjegyzés hozzáadása",
      "Eladói megjegyzés",
      "Kész",
      "Ezt a stílust használom",
      "Stílus módosítása",
      "Kihagyás",
      "Kiválasztva",
    ]),
    example: {
      title:
        "Fekete Maje ruha átlapolt fazonnal és puffos ujjakkal, 34-es méret",
      intro:
        "Fekete Maje ruha 34-es méretben, átlapolt hatású elejével és rövid puffos ujjakkal",
      shortIntro: "Fekete, átlapolt fazonú Maje ruha, 34-es méret",
      details: [
        "Texturált fekete anyag, az egész felületen finom csillogással",
        "Mély V-kivágás, testhez simuló derék és bővülő szoknyarész",
        "Elöl aranyszínű díszgombok, kettő a mellrésznél és kettő a deréknál",
        "Rövid, bő ujjak ráncolt mandzsettával",
        "Testhez simuló hátrész szabásvonalakkal",
      ],
      shortDetails: [
        "Fekete texturált anyag finom csillogással",
        "Mély V-kivágás, szűk derék, bővülő szoknya",
        "Négy aranyszínű gomb a mellrészen és a deréknál",
        "Rövid puffos ujjak ráncolt mandzsettával",
        "Testhez simuló hátrész szabásvonalakkal",
      ],
      hashtags:
        "#Maje #ruha #feketeruha #puffosujj #átlapolt #Vkivágás #miniruha #fekete #nőidivat",
    },
  },
  {
    code: "it",
    name: "Italiano",
    ui: ui([
      "Il tuo stile di annuncio",
      "Esempio",
      "Titolo",
      "Descrizione",
      "Lunghezza",
      "Breve",
      "Lunga",
      "Formato",
      "Elenco",
      "Testo",
      "Hashtag",
      "Emoji",
      "Aggiungi nota del venditore",
      "Nota del venditore",
      "Fatto",
      "Usa questo stile",
      "Modifica stile",
      "Salta",
      "Selezionato",
    ]),
    example: {
      title:
        "Abito nero Maje stile portafoglio con maniche a sbuffo, taglia 34",
      intro:
        "Abito nero Maje in taglia 34, con davanti stile portafoglio e maniche corte a sbuffo",
      shortIntro: "Abito nero Maje stile portafoglio, taglia 34",
      details: [
        "Tessuto nero lavorato con un leggero effetto brillante su tutta la superficie",
        "Profondo scollo a V, vita aderente e gonna svasata",
        "Bottoni decorativi color oro sul davanti, due sul petto e due in vita",
        "Maniche corte voluminose con polsini arricciati",
        "Schiena aderente con cuciture di sagomatura",
      ],
      shortDetails: [
        "Tessuto nero lavorato e leggermente brillante",
        "Scollo a V, vita aderente e gonna svasata",
        "Quattro bottoni dorati sul petto e in vita",
        "Maniche corte a sbuffo con polsini arricciati",
        "Schiena aderente con cuciture di sagomatura",
      ],
      hashtags:
        "#Maje #abito #abitonero #manicheasbuffo #stileportafoglio #scolloaV #abitocorto #nero #modadonna",
    },
  },
  {
    code: "lt",
    name: "Lietuvių",
    ui: ui([
      "Jūsų skelbimo stilius",
      "Pavyzdys",
      "Pavadinimas",
      "Aprašymas",
      "Ilgis",
      "Trumpas",
      "Ilgas",
      "Formatas",
      "Sąrašas",
      "Tekstas",
      "Žymos",
      "Jaustukai",
      "Pridėti pardavėjo pastabą",
      "Pardavėjo pastaba",
      "Atlikta",
      "Naudoti šį stilių",
      "Keisti stilių",
      "Praleisti",
      "Pasirinkta",
    ]),
    example: {
      title:
        "Juoda susiaučiamo stiliaus Maje suknelė pūstomis rankovėmis, 34 dydis",
      intro:
        "Juoda 34 dydžio Maje suknelė su susiaučiamo stiliaus priekiu ir trumpomis pūstomis rankovėmis",
      shortIntro: "Juoda susiaučiamo stiliaus Maje suknelė, 34 dydis",
      details: [
        "Juodas tekstūrinis audinys, subtiliai žvilgantis visame paviršiuje",
        "Gili V formos iškirptė, prigludęs liemuo ir platėjantis sijonas",
        "Priekyje dekoratyvinės aukso spalvos sagos, dvi ties krūtine ir dvi ties liemeniu",
        "Trumpos plačios rankovės su parauktais rankogaliais",
        "Prigludusi nugaros dalis su formuojančiomis siūlėmis",
      ],
      shortDetails: [
        "Juodas tekstūrinis audinys su subtiliu žvilgesiu",
        "Gili V iškirptė, prigludęs liemuo, platėjantis sijonas",
        "Keturios aukso spalvos sagos ties krūtine ir liemeniu",
        "Trumpos pūstos rankovės, paraukti rankogaliai",
        "Prigludusi nugara su formuojančiomis siūlėmis",
      ],
      hashtags:
        "#Maje #suknelė #juodasuknelė #pūstosrankovės #Viškirptė #trumpasuknelė #juoda #moterųmada",
    },
  },
  {
    code: "pl",
    name: "Polski",
    ui: ui([
      "Styl Twojego ogłoszenia",
      "Przykład",
      "Tytuł",
      "Opis",
      "Długość",
      "Krótki",
      "Długi",
      "Format",
      "Lista",
      "Tekst",
      "Hashtagi",
      "Emoji",
      "Dodaj notatkę sprzedawcy",
      "Notatka sprzedawcy",
      "Gotowe",
      "Użyj tego stylu",
      "Zmień styl",
      "Pomiń",
      "Wybrano",
    ]),
    example: {
      title:
        "Czarna sukienka Maje o kopertowym kroju z bufiastymi rękawami, rozmiar 34",
      intro:
        "Czarna sukienka Maje w rozmiarze 34, z przodem w stylu kopertowym i krótkimi bufiastymi rękawami",
      shortIntro: "Czarna sukienka Maje w stylu kopertowym, rozmiar 34",
      details: [
        "Czarna tkanina o wyraźnej fakturze i delikatnym połysku na całej powierzchni",
        "Głęboki dekolt w serek, dopasowana talia i rozkloszowany dół",
        "Ozdobne guziki w złotym kolorze z przodu, dwa na piersi i dwa w talii",
        "Krótkie, obszerne rękawy z marszczonymi mankietami",
        "Dopasowany tył z szwami modelującymi",
      ],
      shortDetails: [
        "Czarna tkanina z fakturą i subtelnym połyskiem",
        "Dekolt w serek, dopasowana talia, rozkloszowany dół",
        "Cztery złote guziki na piersi i w talii",
        "Krótkie bufiaste rękawy, marszczone mankiety",
        "Dopasowany tył ze szwami modelującymi",
      ],
      hashtags:
        "#Maje #sukienka #czarnasukienka #bufiasterękawy #kopertowa #dekoltwserek #minisukienka #czarny #modadamska",
    },
  },
  {
    code: "pt",
    name: "Português",
    ui: ui([
      "O estilo do seu anúncio",
      "Exemplo",
      "Título",
      "Descrição",
      "Extensão",
      "Curta",
      "Longa",
      "Formato",
      "Lista",
      "Texto",
      "Hashtags",
      "Emojis",
      "Adicionar nota do vendedor",
      "Nota do vendedor",
      "Concluído",
      "Usar este estilo",
      "Editar estilo",
      "Saltar",
      "Selecionado",
    ]),
    example: {
      title:
        "Vestido preto Maje estilo cruzado com mangas abalonadas, tamanho 34",
      intro:
        "Vestido preto Maje no tamanho 34, com frente de estilo cruzado e mangas curtas abalonadas",
      shortIntro: "Vestido preto Maje estilo cruzado, tamanho 34",
      details: [
        "Tecido preto texturado com um brilho subtil em toda a superfície",
        "Decote em V profundo, cintura ajustada e saia evasé",
        "Botões decorativos dourados na frente, dois no peito e dois na cintura",
        "Mangas curtas volumosas com punhos franzidos",
        "Costas ajustadas com costuras de recorte",
      ],
      shortDetails: [
        "Tecido preto texturado com brilho subtil",
        "Decote em V, cintura ajustada e saia evasé",
        "Quatro botões dourados no peito e na cintura",
        "Mangas curtas abalonadas com punhos franzidos",
        "Costas ajustadas com costuras de recorte",
      ],
      hashtags:
        "#Maje #vestido #vestidopreto #mangasabalonadas #estilocruzado #decoteV #vestidocurto #preto #modafeminina",
    },
  },
  {
    code: "ro",
    name: "Română",
    ui: ui([
      "Stilul anunțului tău",
      "Exemplu",
      "Titlu",
      "Descriere",
      "Lungime",
      "Scurtă",
      "Lungă",
      "Format",
      "Listă",
      "Text",
      "Hashtaguri",
      "Emoji",
      "Adaugă nota vânzătorului",
      "Nota vânzătorului",
      "Gata",
      "Folosește acest stil",
      "Modifică stilul",
      "Omite",
      "Selectat",
    ]),
    example: {
      title:
        "Rochie neagră Maje cu aspect petrecut și mâneci bufante, mărimea 34",
      intro:
        "Rochie neagră Maje, mărimea 34, cu partea din față în stil petrecut și mâneci scurte bufante",
      shortIntro: "Rochie neagră Maje cu aspect petrecut, mărimea 34",
      details: [
        "Material negru texturat, cu un efect discret strălucitor pe toată suprafața",
        "Decolteu adânc în V, talie cambrată și fustă evazată",
        "Nasturi decorativi aurii în față, doi la piept și doi în talie",
        "Mâneci scurte voluminoase, cu manșete încrețite",
        "Spate cambrat, cu cusături de croi",
      ],
      shortDetails: [
        "Material negru texturat, cu luciu discret",
        "Decolteu în V, talie cambrată, fustă evazată",
        "Patru nasturi aurii la piept și în talie",
        "Mâneci scurte bufante, manșete încrețite",
        "Spate cambrat cu cusături de croi",
      ],
      hashtags:
        "#Maje #rochie #rochieneagră #mânecibufante #stilpetrecut #decolteuV #rochiemini #negru #modăfeminină",
    },
  },
  {
    code: "es",
    name: "Español",
    ui: ui([
      "El estilo de tu anuncio",
      "Ejemplo",
      "Título",
      "Descripción",
      "Longitud",
      "Corta",
      "Larga",
      "Formato",
      "Lista",
      "Texto",
      "Hashtags",
      "Emojis",
      "Añadir nota del vendedor",
      "Nota del vendedor",
      "Listo",
      "Usar este estilo",
      "Editar estilo",
      "Omitir",
      "Seleccionado",
    ]),
    example: {
      title:
        "Vestido negro Maje estilo cruzado con mangas abullonadas, talla 34",
      intro:
        "Vestido negro Maje en talla 34, con parte delantera de estilo cruzado y mangas cortas abullonadas",
      shortIntro: "Vestido negro Maje estilo cruzado, talla 34",
      details: [
        "Tejido negro con textura y un brillo sutil en toda la superficie",
        "Escote en V pronunciado, cintura ajustada y falda evasé",
        "Botones decorativos dorados en la parte delantera, dos en el pecho y dos en la cintura",
        "Mangas cortas con volumen y puños fruncidos",
        "Espalda ajustada con costuras de paneles",
      ],
      shortDetails: [
        "Tejido negro con textura y brillo sutil",
        "Escote en V, cintura ajustada y falda evasé",
        "Cuatro botones dorados en pecho y cintura",
        "Mangas cortas abullonadas con puños fruncidos",
        "Espalda ajustada con costuras de paneles",
      ],
      hashtags:
        "#Maje #vestido #vestidonegro #mangasabullonadas #estilocruzado #escoteV #vestidocorto #negro #modamujer",
    },
  },
  {
    code: "sk",
    name: "Slovenčina",
    ui: ui([
      "Váš štýl inzerátu",
      "Ukážka",
      "Názov",
      "Popis",
      "Dĺžka",
      "Krátky",
      "Dlhý",
      "Formát",
      "Odrážky",
      "Text",
      "Hashtagy",
      "Emoji",
      "Pridať poznámku",
      "Poznámka predajcu",
      "Hotovo",
      "Použiť tento štýl",
      "Upraviť štýl",
      "Preskočiť",
      "Vybrané",
    ]),
    example: {
      title:
        "Čierne šaty Maje v zavinovacom štýle s naberanými rukávmi, veľkosť 34",
      intro:
        "Čierne šaty Maje vo veľkosti 34, s predným dielom v zavinovacom štýle a krátkymi naberanými rukávmi",
      shortIntro: "Čierne šaty Maje v zavinovacom štýle, veľkosť 34",
      details: [
        "Čierna štruktúrovaná látka s jemným trblietaním po celom povrchu",
        "Hlboký výstrih do V, priliehavý pás a rozšírená sukňa",
        "Ozdobné gombíky v zlatom tóne vpredu, dva na hrudi a dva v páse",
        "Krátke objemné rukávy s nariasenými manžetami",
        "Priliehavý chrbát s členiacimi švami",
      ],
      shortDetails: [
        "Čierna štruktúrovaná látka s jemným leskom",
        "Výstrih do V, priliehavý pás a rozšírená sukňa",
        "Štyri zlatisté gombíky na hrudi a v páse",
        "Krátke naberané rukávy s riasenými manžetami",
        "Priliehavý chrbát s členiacimi švami",
      ],
      hashtags:
        "#Maje #šaty #čiernešaty #naberanérukávy #zavinovacíštýl #výstrihdoV #krátkešaty #čierna #dámskamóda",
    },
  },
  {
    code: "sv",
    name: "Svenska",
    ui: ui([
      "Din annonsstil",
      "Exempel",
      "Titel",
      "Beskrivning",
      "Längd",
      "Kort",
      "Lång",
      "Format",
      "Lista",
      "Text",
      "Hashtaggar",
      "Emojier",
      "Lägg till säljaranteckning",
      "Säljaranteckning",
      "Klart",
      "Använd den här stilen",
      "Ändra stil",
      "Hoppa över",
      "Vald",
    ]),
    example: {
      title: "Svart Maje-klänning i omlottstil med puffärmar, storlek 34",
      intro:
        "Svart Maje-klänning i storlek 34 med framsida i omlottstil och korta puffärmar",
      shortIntro: "Svart Maje-klänning i omlottstil, storlek 34",
      details: [
        "Svart tyg med struktur och en diskret glittrande yta över hela plagget",
        "Djup V-ringning, figurnära midja och utställd kjol",
        "Dekorativa guldfärgade knappar framtill, två vid bröstet och två vid midjan",
        "Korta vida ärmar med rynkade muddar",
        "Figurnära rygg med panelsömmar",
      ],
      shortDetails: [
        "Svart strukturerat tyg med diskret glitter",
        "Djup V-ringning, smal midja och utställd kjol",
        "Fyra guldfärgade knappar vid bröst och midja",
        "Korta puffärmar med rynkade muddar",
        "Figurnära rygg med panelsömmar",
      ],
      hashtags:
        "#Maje #klänning #svartklänning #puffärmar #omlottstil #vringning #kortklänning #svart #dammode",
    },
  },
];
export function normalizeLanguage(value: unknown): string {
  const code = String(value ?? "")
    .toLowerCase()
    .split(/[-_]/)[0];
  return code === "cs" ? "cz" : code;
}
export function getTranslation(code: string): Translation {
  return (
    translations.find((t) => t.code === normalizeLanguage(code)) ??
    translations[0]
  );
}
export function detectLanguage(languages: readonly string[]): string {
  return (
    languages
      .map(normalizeLanguage)
      .find((code) => translations.some((t) => t.code === code)) ?? "en"
  );
}
export function languageFlag(code: string): string {
  const countries: Record<string, string> = {
    en: "gb",
    da: "dk",
    el: "gr",
    sv: "se",
  };
  const normalized = getTranslation(code).code;
  return `/app/flags/${countries[normalized] ?? normalized}.svg`;
}
