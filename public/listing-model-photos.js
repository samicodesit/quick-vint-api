/* Shared with extension lib/listing-model-photos.js. No framework or font dependency. */
(function (root) {
  "use strict";
  const keys =
    "Creating model photos…|Adding model photos…|Preparing your model…|Couldn’t create model photos.|Couldn’t add model photos.|Retry|Free 2 photo slots to add model photos.|Photos added. Couldn’t put them first.|Adds two model photos to eligible listings.|Model photo|Model photos|Waiting for model photos…|Couldn’t load model photos.|Free 1 photo slot to add the model photo.|Add model photos|Uses 1 listing from your allowance.|Add item photos first.|Text ready · Model photos pending|Model photos aren’t available for this item.".split(
      "|",
    );
  const rows = {
    fr: "Création des photos du mannequin…|Ajout des photos du mannequin…|Préparation de votre mannequin…|Impossible de créer les photos du mannequin.|Impossible d’ajouter les photos du mannequin.|Réessayer|Libérez 2 places pour les photos du mannequin.|Photos ajoutées. Impossible de les placer en premier.|Ajoute deux photos du mannequin aux annonces adaptées.|Photo du mannequin|Photos du mannequin|Photos du mannequin en attente…|Impossible de charger les photos du mannequin.|Libérez 1 place pour la photo du mannequin.|Ajouter les photos du mannequin|Utilise 1 annonce de votre quota.|Ajoutez d’abord les photos de l’article.|Texte prêt · Photos du mannequin en cours|Les photos du mannequin ne sont pas disponibles pour cet article.",
    de: "Modelfotos werden erstellt…|Modelfotos werden hinzugefügt…|Dein Model wird vorbereitet…|Modelfotos konnten nicht erstellt werden.|Modelfotos konnten nicht hinzugefügt werden.|Erneut versuchen|Schaffe Platz für 2 Modelfotos.|Fotos hinzugefügt. Sie konnten nicht an den Anfang verschoben werden.|Fügt geeigneten Anzeigen zwei Modelfotos hinzu.|Modelfoto|Modelfotos|Warten auf Modelfotos…|Modelfotos konnten nicht geladen werden.|Schaffe Platz für 1 Modelfoto.|Modelfotos hinzufügen|Verbraucht 1 Anzeige deines Kontingents.|Füge zuerst Artikelfotos hinzu.|Text fertig · Modelfotos ausstehend|Für diesen Artikel sind keine Modelfotos verfügbar.",
    nl: "Modelfoto’s maken…|Modelfoto’s toevoegen…|Je model voorbereiden…|Modelfoto’s maken is niet gelukt.|Modelfoto’s toevoegen is niet gelukt.|Opnieuw proberen|Maak ruimte voor 2 modelfoto’s.|Foto’s toegevoegd. Vooraan zetten is niet gelukt.|Voegt twee modelfoto’s toe aan geschikte advertenties.|Modelfoto|Modelfoto’s|Wachten op modelfoto’s…|Modelfoto’s laden is niet gelukt.|Maak ruimte voor 1 modelfoto.|Modelfoto’s toevoegen|Gebruikt 1 advertentie uit je tegoed.|Voeg eerst artikelfoto’s toe.|Tekst klaar · Modelfoto’s in behandeling|Modelfoto’s zijn niet beschikbaar voor dit artikel.",
    es: "Creando fotos del modelo…|Añadiendo fotos del modelo…|Preparando tu modelo…|No se pudieron crear las fotos del modelo.|No se pudieron añadir las fotos del modelo.|Reintentar|Deja espacio para 2 fotos del modelo.|Fotos añadidas. No se pudieron colocar al principio.|Añade dos fotos del modelo a los anuncios adecuados.|Foto del modelo|Fotos del modelo|Esperando las fotos del modelo…|No se pudieron cargar las fotos del modelo.|Deja espacio para 1 foto del modelo.|Añadir fotos del modelo|Usa 1 anuncio de tu cupo.|Añade primero fotos del artículo.|Texto listo · Fotos del modelo pendientes|Las fotos del modelo no están disponibles para este artículo.",
    it: "Creazione delle foto del modello…|Aggiunta delle foto del modello…|Preparazione del tuo modello…|Impossibile creare le foto del modello.|Impossibile aggiungere le foto del modello.|Riprova|Libera spazio per 2 foto del modello.|Foto aggiunte. Non è stato possibile metterle per prime.|Aggiunge due foto del modello agli annunci adatti.|Foto del modello|Foto del modello|In attesa delle foto del modello…|Impossibile caricare le foto del modello.|Libera spazio per 1 foto del modello.|Aggiungi foto del modello|Usa 1 annuncio della tua quota.|Aggiungi prima le foto dell’articolo.|Testo pronto · Foto del modello in corso|Le foto del modello non sono disponibili per questo articolo.",
    pl: "Tworzenie zdjęć modela…|Dodawanie zdjęć modela…|Przygotowywanie modela…|Nie udało się utworzyć zdjęć modela.|Nie udało się dodać zdjęć modela.|Spróbuj ponownie|Zwolnij 2 miejsca na zdjęcia modela.|Zdjęcia dodane. Nie udało się umieścić ich na początku.|Dodaje dwa zdjęcia modela do odpowiednich ogłoszeń.|Zdjęcie modela|Zdjęcia modela|Oczekiwanie na zdjęcia modela…|Nie udało się wczytać zdjęć modela.|Zwolnij 1 miejsce na zdjęcie modela.|Dodaj zdjęcia modela|Wykorzystuje 1 ogłoszenie z limitu.|Najpierw dodaj zdjęcia przedmiotu.|Tekst gotowy · Zdjęcia modela w toku|Zdjęcia modela nie są dostępne dla tego przedmiotu.",
    pt: "A criar fotos do modelo…|A adicionar fotos do modelo…|A preparar o teu modelo…|Não foi possível criar as fotos do modelo.|Não foi possível adicionar as fotos do modelo.|Tentar novamente|Liberta espaço para 2 fotos do modelo.|Fotos adicionadas. Não foi possível colocá-las no início.|Adiciona duas fotos do modelo aos anúncios adequados.|Foto do modelo|Fotos do modelo|À espera das fotos do modelo…|Não foi possível carregar as fotos do modelo.|Liberta espaço para 1 foto do modelo.|Adicionar fotos do modelo|Usa 1 anúncio do teu limite.|Adiciona primeiro fotos do artigo.|Texto pronto · Fotos do modelo pendentes|As fotos do modelo não estão disponíveis para este artigo.",
    cs: "Vytváření fotek modelu…|Přidávání fotek modelu…|Příprava tvého modelu…|Fotky modelu se nepodařilo vytvořit.|Fotky modelu se nepodařilo přidat.|Zkusit znovu|Uvolni 2 místa pro fotky modelu.|Fotky byly přidány. Nepodařilo se je přesunout na začátek.|Přidá dvě fotky modelu k vhodným inzerátům.|Fotka modelu|Fotky modelu|Čekání na fotky modelu…|Fotky modelu se nepodařilo načíst.|Uvolni 1 místo pro fotku modelu.|Přidat fotky modelu|Využije 1 inzerát z tvého limitu.|Nejprve přidej fotky předmětu.|Text hotový · Fotky modelu se připravují|Fotky modelu nejsou pro tento předmět dostupné.",
    da: "Opretter modelbilleder…|Tilføjer modelbilleder…|Forbereder din model…|Modelbillederne kunne ikke oprettes.|Modelbillederne kunne ikke tilføjes.|Prøv igen|Gør plads til 2 modelbilleder.|Billeder tilføjet. De kunne ikke placeres først.|Tilføjer to modelbilleder til egnede annoncer.|Modelbillede|Modelbilleder|Venter på modelbilleder…|Modelbillederne kunne ikke indlæses.|Gør plads til 1 modelbillede.|Tilføj modelbilleder|Bruger 1 annonce fra din kvote.|Tilføj først billeder af varen.|Tekst klar · Modelbilleder på vej|Modelbilleder er ikke tilgængelige for denne vare.",
    el: "Δημιουργία φωτογραφιών μοντέλου…|Προσθήκη φωτογραφιών μοντέλου…|Προετοιμασία του μοντέλου σου…|Δεν ήταν δυνατή η δημιουργία φωτογραφιών μοντέλου.|Δεν ήταν δυνατή η προσθήκη φωτογραφιών μοντέλου.|Δοκιμή ξανά|Ελευθέρωσε 2 θέσεις για φωτογραφίες μοντέλου.|Οι φωτογραφίες προστέθηκαν, αλλά δεν τοποθετήθηκαν πρώτες.|Προσθέτει δύο φωτογραφίες μοντέλου σε κατάλληλες αγγελίες.|Φωτογραφία μοντέλου|Φωτογραφίες μοντέλου|Αναμονή για φωτογραφίες μοντέλου…|Δεν ήταν δυνατή η φόρτωση φωτογραφιών μοντέλου.|Ελευθέρωσε 1 θέση για τη φωτογραφία μοντέλου.|Προσθήκη φωτογραφιών μοντέλου|Χρησιμοποιεί 1 αγγελία από το όριό σου.|Πρόσθεσε πρώτα φωτογραφίες του είδους.|Το κείμενο είναι έτοιμο · Αναμονή φωτογραφιών|Δεν διατίθενται φωτογραφίες μοντέλου για αυτό το είδος.",
    hr: "Izrada fotografija modela…|Dodavanje fotografija modela…|Priprema tvog modela…|Fotografije modela nije moguće izraditi.|Fotografije modela nije moguće dodati.|Pokušaj ponovno|Oslobodi 2 mjesta za fotografije modela.|Fotografije su dodane, ali ih nije bilo moguće postaviti na početak.|Dodaje dvije fotografije modela prikladnim oglasima.|Fotografija modela|Fotografije modela|Čekanje fotografija modela…|Fotografije modela nije moguće učitati.|Oslobodi 1 mjesto za fotografiju modela.|Dodaj fotografije modela|Troši 1 oglas iz tvoje kvote.|Prvo dodaj fotografije predmeta.|Tekst spreman · Fotografije modela u pripremi|Fotografije modela nisu dostupne za ovaj predmet.",
    fi: "Luodaan mallikuvia…|Lisätään mallikuvia…|Valmistellaan malliasi…|Mallikuvia ei voitu luoda.|Mallikuvia ei voitu lisätä.|Yritä uudelleen|Vapauta tilaa 2 mallikuvalle.|Kuvat lisätty. Niitä ei voitu siirtää ensimmäisiksi.|Lisää kaksi mallikuvaa sopiviin ilmoituksiin.|Mallikuva|Mallikuvat|Odotetaan mallikuvia…|Mallikuvia ei voitu ladata.|Vapauta tilaa 1 mallikuvalle.|Lisää mallikuvat|Käyttää 1 ilmoituksen kiintiöstäsi.|Lisää ensin tuotekuvat.|Teksti valmis · Mallikuvat tulossa|Mallikuvia ei ole saatavilla tälle tuotteelle.",
    hu: "Modellfotók készítése…|Modellfotók hozzáadása…|A modelled előkészítése…|Nem sikerült elkészíteni a modellfotókat.|Nem sikerült hozzáadni a modellfotókat.|Újrapróbálkozás|Szabadíts fel 2 helyet a modellfotóknak.|A fotókat hozzáadtuk, de nem sikerült az első helyekre tenni őket.|Két modellfotót ad a megfelelő hirdetésekhez.|Modellfotó|Modellfotók|Várakozás a modellfotókra…|Nem sikerült betölteni a modellfotókat.|Szabadíts fel 1 helyet a modellfotónak.|Modellfotók hozzáadása|1 hirdetést használ fel a keretedből.|Először adj hozzá termékfotókat.|Szöveg kész · Modellfotók folyamatban|Ehhez a termékhez nem készíthetők modellfotók.",
    lt: "Kuriamos modelio nuotraukos…|Pridedamos modelio nuotraukos…|Ruošiamas tavo modelis…|Nepavyko sukurti modelio nuotraukų.|Nepavyko pridėti modelio nuotraukų.|Bandyti dar kartą|Atlaisvink 2 vietas modelio nuotraukoms.|Nuotraukos pridėtos, bet jų nepavyko perkelti į pradžią.|Prideda dvi modelio nuotraukas prie tinkamų skelbimų.|Modelio nuotrauka|Modelio nuotraukos|Laukiama modelio nuotraukų…|Nepavyko įkelti modelio nuotraukų.|Atlaisvink 1 vietą modelio nuotraukai.|Pridėti modelio nuotraukas|Panaudoja 1 skelbimą iš tavo limito.|Pirmiausia pridėk prekės nuotraukas.|Tekstas paruoštas · Modelio nuotraukos ruošiamos|Šiai prekei modelio nuotraukos negalimos.",
    ro: "Se creează fotografiile modelului…|Se adaugă fotografiile modelului…|Se pregătește modelul tău…|Fotografiile modelului nu au putut fi create.|Fotografiile modelului nu au putut fi adăugate.|Încearcă din nou|Eliberează 2 locuri pentru fotografiile modelului.|Fotografiile au fost adăugate, dar nu au putut fi puse primele.|Adaugă două fotografii ale modelului la anunțurile potrivite.|Fotografie a modelului|Fotografii ale modelului|Se așteaptă fotografiile modelului…|Fotografiile modelului nu au putut fi încărcate.|Eliberează 1 loc pentru fotografia modelului.|Adaugă fotografiile modelului|Folosește 1 anunț din cota ta.|Adaugă mai întâi fotografiile articolului.|Text gata · Fotografii în curs|Fotografiile cu modelul nu sunt disponibile pentru acest articol.",
    sk: "Vytváranie fotiek modelu…|Pridávanie fotiek modelu…|Príprava tvojho modelu…|Fotky modelu sa nepodarilo vytvoriť.|Fotky modelu sa nepodarilo pridať.|Skúsiť znova|Uvoľni 2 miesta pre fotky modelu.|Fotky boli pridané. Nepodarilo sa ich presunúť na začiatok.|Pridá dve fotky modelu k vhodným inzerátom.|Fotka modelu|Fotky modelu|Čakanie na fotky modelu…|Fotky modelu sa nepodarilo načítať.|Uvoľni 1 miesto pre fotku modelu.|Pridať fotky modelu|Využije 1 inzerát z tvojho limitu.|Najprv pridaj fotky predmetu.|Text hotový · Fotky modelu sa pripravujú|Fotky modelu nie sú pre tento predmet dostupné.",
    sv: "Skapar modellbilder…|Lägger till modellbilder…|Förbereder din modell…|Det gick inte att skapa modellbilder.|Det gick inte att lägga till modellbilder.|Försök igen|Gör plats för 2 modellbilder.|Bilder tillagda. Det gick inte att lägga dem först.|Lägger till två modellbilder i lämpliga annonser.|Modellbild|Modellbilder|Väntar på modellbilder…|Det gick inte att läsa in modellbilder.|Gör plats för 1 modellbild.|Lägg till modellbilder|Använder 1 annons från din kvot.|Lägg till varubilder först.|Text klar · Modellbilder på väg|Modellbilder är inte tillgängliga för den här varan.",
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
        skipped: keys[18],
      }[state?.status] || null
    );
  }
  function render(container, state, retry) {
    const key = statusKey(state);
    const working = ["preparing", "generating", "adding", "queued"].includes(
      state?.status,
    );
    container.className =
      "mp-progress" + (state?.status === "skipped" ? " mp-unavailable" : "");
    container.hidden = !key || (working && !state?.eligible);
    if (container.hidden) {
      container.replaceChildren();
      delete container.dataset.signature;
      return;
    }
    const remaining =
      2 -
      new Set(
        (state?.receivedSlots || []).filter((slot) =>
          ["primary", "secondary"].includes(slot),
        ),
      ).size;
    container.dataset.remaining = String(remaining);
    const signature = JSON.stringify([
      key,
      working,
      remaining,
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
      for (let n = 0; n < remaining; n++) {
        const card = document.createElement("span");
        card.className = "mp-placeholder";
        previews.append(card);
      }
      container.append(previews);
    }
    if (state?.status === "skipped") {
      const icon = document.createElement("span");
      icon.className = "mp-unavailable-icon";
      icon.setAttribute("aria-hidden", "true");
      // Lucide UserRoundX, ISC. See listing-model-photos.LICENSE.
      icon.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false"><path d="m16.5 16.5 5 5"/><path d="M2 21a8 8 0 0 1 11.531-7.18"/><path d="m21.5 16.5-5 5"/><circle cx="10" cy="8" r="5"/></svg>';
      container.append(icon);
    }
    const status = document.createElement("span");
    status.className = "mp-message";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.textContent = text(key);
    container.append(status);
    if (state?.canRetry && !working && state?.status !== "skipped") {
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
