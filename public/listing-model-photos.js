/* Shared with extension lib/listing-model-photos.js. No framework or font dependency. */
(function (root) {
  "use strict";
  const keys =
    "Creating model photos…|Adding model photos…|Preparing your model…|Couldn’t create model photos.|Couldn’t add model photos.|Retry|Free 2 photo slots to add model photos.|Move the model photos to the start.|Adds two model photos to eligible listings.|Model photo|Model photos|Waiting for model photos…|Couldn’t load model photos.|Free 1 photo slot to add the model photo.|Add model photos|Uses 1 listing from your allowance.|Add item photos first.|Text ready · Model photos pending".split(
      "|",
    );
  const rows = {
    fr: "Création des photos du mannequin…|Ajout des photos du mannequin…|Préparation de votre mannequin…|Impossible de créer les photos du mannequin.|Impossible d’ajouter les photos du mannequin.|Réessayer|Libérez 2 places pour les photos du mannequin.|Placez les photos du mannequin en premier.|Ajoute deux photos du mannequin aux annonces adaptées.|Photo du mannequin|Photos du mannequin|Photos du mannequin en attente…|Impossible de charger les photos du mannequin.|Libérez 1 place pour la photo du mannequin.|Ajouter les photos du mannequin|Utilise 1 annonce de votre quota.|Ajoutez d’abord les photos de l’article.|Texte prêt · Photos du mannequin en cours",
    de: "Modelfotos werden erstellt…|Modelfotos werden hinzugefügt…|Dein Model wird vorbereitet…|Modelfotos konnten nicht erstellt werden.|Modelfotos konnten nicht hinzugefügt werden.|Erneut versuchen|Schaffe Platz für 2 Modelfotos.|Verschiebe die Modelfotos an den Anfang.|Fügt geeigneten Anzeigen zwei Modelfotos hinzu.|Modelfoto|Modelfotos|Warten auf Modelfotos…|Modelfotos konnten nicht geladen werden.|Schaffe Platz für 1 Modelfoto.|Modelfotos hinzufügen|Verbraucht 1 Anzeige deines Kontingents.|Füge zuerst Artikelfotos hinzu.|Text fertig · Modelfotos ausstehend",
    nl: "Modelfoto’s maken…|Modelfoto’s toevoegen…|Je model voorbereiden…|Modelfoto’s maken is niet gelukt.|Modelfoto’s toevoegen is niet gelukt.|Opnieuw proberen|Maak ruimte voor 2 modelfoto’s.|Zet de modelfoto’s vooraan.|Voegt twee modelfoto’s toe aan geschikte advertenties.|Modelfoto|Modelfoto’s|Wachten op modelfoto’s…|Modelfoto’s laden is niet gelukt.|Maak ruimte voor 1 modelfoto.|Modelfoto’s toevoegen|Gebruikt 1 advertentie uit je tegoed.|Voeg eerst artikelfoto’s toe.|Tekst klaar · Modelfoto’s in behandeling",
    es: "Creando fotos del modelo…|Añadiendo fotos del modelo…|Preparando tu modelo…|No se pudieron crear las fotos del modelo.|No se pudieron añadir las fotos del modelo.|Reintentar|Deja espacio para 2 fotos del modelo.|Coloca las fotos del modelo al principio.|Añade dos fotos del modelo a los anuncios adecuados.|Foto del modelo|Fotos del modelo|Esperando las fotos del modelo…|No se pudieron cargar las fotos del modelo.|Deja espacio para 1 foto del modelo.|Añadir fotos del modelo|Usa 1 anuncio de tu cupo.|Añade primero fotos del artículo.|Texto listo · Fotos del modelo pendientes",
    it: "Creazione delle foto del modello…|Aggiunta delle foto del modello…|Preparazione del tuo modello…|Impossibile creare le foto del modello.|Impossibile aggiungere le foto del modello.|Riprova|Libera spazio per 2 foto del modello.|Sposta le foto del modello all’inizio.|Aggiunge due foto del modello agli annunci adatti.|Foto del modello|Foto del modello|In attesa delle foto del modello…|Impossibile caricare le foto del modello.|Libera spazio per 1 foto del modello.|Aggiungi foto del modello|Usa 1 annuncio della tua quota.|Aggiungi prima le foto dell’articolo.|Testo pronto · Foto del modello in corso",
    pl: "Tworzenie zdjęć modela…|Dodawanie zdjęć modela…|Przygotowywanie modela…|Nie udało się utworzyć zdjęć modela.|Nie udało się dodać zdjęć modela.|Spróbuj ponownie|Zwolnij 2 miejsca na zdjęcia modela.|Przenieś zdjęcia modela na początek.|Dodaje dwa zdjęcia modela do odpowiednich ogłoszeń.|Zdjęcie modela|Zdjęcia modela|Oczekiwanie na zdjęcia modela…|Nie udało się wczytać zdjęć modela.|Zwolnij 1 miejsce na zdjęcie modela.|Dodaj zdjęcia modela|Wykorzystuje 1 ogłoszenie z limitu.|Najpierw dodaj zdjęcia przedmiotu.|Tekst gotowy · Zdjęcia modela w toku",
    pt: "A criar fotos do modelo…|A adicionar fotos do modelo…|A preparar o teu modelo…|Não foi possível criar as fotos do modelo.|Não foi possível adicionar as fotos do modelo.|Tentar novamente|Liberta espaço para 2 fotos do modelo.|Move as fotos do modelo para o início.|Adiciona duas fotos do modelo aos anúncios adequados.|Foto do modelo|Fotos do modelo|À espera das fotos do modelo…|Não foi possível carregar as fotos do modelo.|Liberta espaço para 1 foto do modelo.|Adicionar fotos do modelo|Usa 1 anúncio do teu limite.|Adiciona primeiro fotos do artigo.|Texto pronto · Fotos do modelo pendentes",
    cs: "Vytváření fotek modelu…|Přidávání fotek modelu…|Příprava tvého modelu…|Fotky modelu se nepodařilo vytvořit.|Fotky modelu se nepodařilo přidat.|Zkusit znovu|Uvolni 2 místa pro fotky modelu.|Přesuň fotky modelu na začátek.|Přidá dvě fotky modelu k vhodným inzerátům.|Fotka modelu|Fotky modelu|Čekání na fotky modelu…|Fotky modelu se nepodařilo načíst.|Uvolni 1 místo pro fotku modelu.|Přidat fotky modelu|Využije 1 inzerát z tvého limitu.|Nejprve přidej fotky předmětu.|Text hotový · Fotky modelu se připravují",
    da: "Opretter modelbilleder…|Tilføjer modelbilleder…|Forbereder din model…|Modelbillederne kunne ikke oprettes.|Modelbillederne kunne ikke tilføjes.|Prøv igen|Gør plads til 2 modelbilleder.|Flyt modelbillederne til starten.|Tilføjer to modelbilleder til egnede annoncer.|Modelbillede|Modelbilleder|Venter på modelbilleder…|Modelbillederne kunne ikke indlæses.|Gør plads til 1 modelbillede.|Tilføj modelbilleder|Bruger 1 annonce fra din kvote.|Tilføj først billeder af varen.|Tekst klar · Modelbilleder på vej",
    el: "Δημιουργία φωτογραφιών μοντέλου…|Προσθήκη φωτογραφιών μοντέλου…|Προετοιμασία του μοντέλου σου…|Δεν ήταν δυνατή η δημιουργία φωτογραφιών μοντέλου.|Δεν ήταν δυνατή η προσθήκη φωτογραφιών μοντέλου.|Δοκιμή ξανά|Ελευθέρωσε 2 θέσεις για φωτογραφίες μοντέλου.|Μετακίνησε τις φωτογραφίες μοντέλου στην αρχή.|Προσθέτει δύο φωτογραφίες μοντέλου σε κατάλληλες αγγελίες.|Φωτογραφία μοντέλου|Φωτογραφίες μοντέλου|Αναμονή για φωτογραφίες μοντέλου…|Δεν ήταν δυνατή η φόρτωση φωτογραφιών μοντέλου.|Ελευθέρωσε 1 θέση για τη φωτογραφία μοντέλου.|Προσθήκη φωτογραφιών μοντέλου|Χρησιμοποιεί 1 αγγελία από το όριό σου.|Πρόσθεσε πρώτα φωτογραφίες του είδους.|Το κείμενο είναι έτοιμο · Αναμονή φωτογραφιών",
    hr: "Izrada fotografija modela…|Dodavanje fotografija modela…|Priprema tvog modela…|Fotografije modela nije moguće izraditi.|Fotografije modela nije moguće dodati.|Pokušaj ponovno|Oslobodi 2 mjesta za fotografije modela.|Premjesti fotografije modela na početak.|Dodaje dvije fotografije modela prikladnim oglasima.|Fotografija modela|Fotografije modela|Čekanje fotografija modela…|Fotografije modela nije moguće učitati.|Oslobodi 1 mjesto za fotografiju modela.|Dodaj fotografije modela|Troši 1 oglas iz tvoje kvote.|Prvo dodaj fotografije predmeta.|Tekst spreman · Fotografije modela u pripremi",
    fi: "Luodaan mallikuvia…|Lisätään mallikuvia…|Valmistellaan malliasi…|Mallikuvia ei voitu luoda.|Mallikuvia ei voitu lisätä.|Yritä uudelleen|Vapauta tilaa 2 mallikuvalle.|Siirrä mallikuvat ensimmäisiksi.|Lisää kaksi mallikuvaa sopiviin ilmoituksiin.|Mallikuva|Mallikuvat|Odotetaan mallikuvia…|Mallikuvia ei voitu ladata.|Vapauta tilaa 1 mallikuvalle.|Lisää mallikuvat|Käyttää 1 ilmoituksen kiintiöstäsi.|Lisää ensin tuotekuvat.|Teksti valmis · Mallikuvat tulossa",
    hu: "Modellfotók készítése…|Modellfotók hozzáadása…|A modelled előkészítése…|Nem sikerült elkészíteni a modellfotókat.|Nem sikerült hozzáadni a modellfotókat.|Újrapróbálkozás|Szabadíts fel 2 helyet a modellfotóknak.|Helyezd a modellfotókat az elejére.|Két modellfotót ad a megfelelő hirdetésekhez.|Modellfotó|Modellfotók|Várakozás a modellfotókra…|Nem sikerült betölteni a modellfotókat.|Szabadíts fel 1 helyet a modellfotónak.|Modellfotók hozzáadása|1 hirdetést használ fel a keretedből.|Először adj hozzá termékfotókat.|Szöveg kész · Modellfotók folyamatban",
    lt: "Kuriamos modelio nuotraukos…|Pridedamos modelio nuotraukos…|Ruošiamas tavo modelis…|Nepavyko sukurti modelio nuotraukų.|Nepavyko pridėti modelio nuotraukų.|Bandyti dar kartą|Atlaisvink 2 vietas modelio nuotraukoms.|Perkelk modelio nuotraukas į pradžią.|Prideda dvi modelio nuotraukas prie tinkamų skelbimų.|Modelio nuotrauka|Modelio nuotraukos|Laukiama modelio nuotraukų…|Nepavyko įkelti modelio nuotraukų.|Atlaisvink 1 vietą modelio nuotraukai.|Pridėti modelio nuotraukas|Panaudoja 1 skelbimą iš tavo limito.|Pirmiausia pridėk prekės nuotraukas.|Tekstas paruoštas · Modelio nuotraukos ruošiamos",
    ro: "Se creează fotografiile modelului…|Se adaugă fotografiile modelului…|Se pregătește modelul tău…|Fotografiile modelului nu au putut fi create.|Fotografiile modelului nu au putut fi adăugate.|Încearcă din nou|Eliberează 2 locuri pentru fotografiile modelului.|Mută fotografiile modelului la început.|Adaugă două fotografii ale modelului la anunțurile potrivite.|Fotografie a modelului|Fotografii ale modelului|Se așteaptă fotografiile modelului…|Fotografiile modelului nu au putut fi încărcate.|Eliberează 1 loc pentru fotografia modelului.|Adaugă fotografiile modelului|Folosește 1 anunț din cota ta.|Adaugă mai întâi fotografiile articolului.|Text gata · Fotografii în curs",
    sk: "Vytváranie fotiek modelu…|Pridávanie fotiek modelu…|Príprava tvojho modelu…|Fotky modelu sa nepodarilo vytvoriť.|Fotky modelu sa nepodarilo pridať.|Skúsiť znova|Uvoľni 2 miesta pre fotky modelu.|Presuň fotky modelu na začiatok.|Pridá dve fotky modelu k vhodným inzerátom.|Fotka modelu|Fotky modelu|Čakanie na fotky modelu…|Fotky modelu sa nepodarilo načítať.|Uvoľni 1 miesto pre fotku modelu.|Pridať fotky modelu|Využije 1 inzerát z tvojho limitu.|Najprv pridaj fotky predmetu.|Text hotový · Fotky modelu sa pripravujú",
    sv: "Skapar modellbilder…|Lägger till modellbilder…|Förbereder din modell…|Det gick inte att skapa modellbilder.|Det gick inte att lägga till modellbilder.|Försök igen|Gör plats för 2 modellbilder.|Flytta modellbilderna till början.|Lägger till två modellbilder i lämpliga annonser.|Modellbild|Modellbilder|Väntar på modellbilder…|Det gick inte att läsa in modellbilder.|Gör plats för 1 modellbild.|Lägg till modellbilder|Använder 1 annons från din kvot.|Lägg till varubilder först.|Text klar · Modellbilder på väg",
  };
  function text(key) {
    const locale = root.AutoListerModelCopy?.getLocale?.() || "en";
    const language = String(locale).toLowerCase().split(/[-_]/)[0];
    const code = language === "cz" ? "cs" : language;
    const row = rows[code]?.split("|");
    const i = keys.indexOf(key);
    return i >= 0 && row ? row[i] : key;
  }
  function statusKey(state) {
    return (
      {
        preparing: keys[2],
        generating: keys[0],
        adding: keys[1],
        failed: keys[3],
        attachment_failed: keys[4],
        connection_failed: keys[12],
        capacity: keys[6],
        capacity_one: keys[13],
        order_failed: keys[7],
        queued: keys[11],
      }[state?.status] || null
    );
  }
  function render(container, state, retry) {
    const key = statusKey(state);
    const working = ["preparing", "generating", "adding", "queued"].includes(
      state?.status,
    );
    container.className = "mp-progress";
    container.hidden = !key || (working && !state?.eligible);
    if (container.hidden) {
      container.replaceChildren();
      delete container.dataset.signature;
      return;
    }
    const signature = JSON.stringify([
      key,
      working,
      state?.canRetry,
      text(key),
    ]);
    container._mpRetry = retry;
    if (container.dataset.signature === signature) return;
    container.dataset.signature = signature;
    container.replaceChildren();
    container.setAttribute("aria-label", text(keys[10]));
    if (working) {
      const previews = document.createElement("div");
      previews.className = "mp-placeholders";
      previews.setAttribute("aria-hidden", "true");
      for (let n = 0; n < 2; n++) {
        const card = document.createElement("span");
        card.className = "mp-placeholder";
        previews.append(card);
      }
      container.append(previews);
    }
    const status = document.createElement("span");
    status.className = "mp-message";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.textContent = text(key);
    container.append(status);
    if (state?.canRetry && !working) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "mp-retry";
      button.textContent = text(keys[5]);
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          await container._mpRetry?.();
        } finally {
          button.disabled = false;
        }
      });
      container.append(button);
    }
  }
  const api = { text, statusKey, render, keys, rows };
  root.AutoListerPhotoUI = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
