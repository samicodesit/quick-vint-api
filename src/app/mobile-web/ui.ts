import billingCopy from "../../data/billingCopy.json";
import {
  detectLanguage,
  getTranslation,
  normalizeLanguage,
} from "./styleTranslations";
import { UI_LOCALES, workspaceCopy, type UiLocale } from "./uiCopy";

/** Interface locale never reads selected title/description languages or user content. */
export function getUiLocale(languages?: readonly string[]): UiLocale {
  return detectLanguage(
    languages ??
      (typeof navigator === "undefined"
        ? []
        : [...(navigator.languages || []), navigator.language]),
  ) as UiLocale;
}
export function uiLanguageTag(locale = getUiLocale()): string {
  return locale === "cz" ? "cs" : locale;
}
const aliases: Record<string, string> = {};
function alias(target: string, sources: string[]) {
  for (const source of sources) aliases[source] = target;
}
alias("Account", ["Your account", "Close account"]);
alias("Add item", [
  "Add new",
  "Add new item",
  "New draft",
  "New item",
  "Create item",
]);
alias("Add photos", [
  "Add photos of your item",
  "Item photos",
  "Add a photo before generating.",
  "Add at least one photo to continue",
  "Choose a photo.",
  "Choose at least one photo.",
]);
alias("Add several items", ["Prepare several items", "Multiple items"]);
alias("Close", [
  "Close dialog",
  "Close item options",
  "Close photo editor",
  "Close extension suggestion",
]);
alias("Check result", ["Check saved result"]);
alias("Copied", [
  "Copied ✓",
  "Link copied",
  "Both fields copied. Open Vinted when you are ready.",
]);
alias("Defaults", ["Settings scope"]);
alias("Save defaults", ["Save as my defaults"]);
alias("Saved", ["Defaults saved"]);
alias("Delete", ["Delete?", "Delete item"]);
alias("Your drafts", ["Saved items", "Listing drafts", "AutoLister drafts"]);
alias("Listed", ["Listed item", "Listed items"]);
alias("Generate draft", ["Generate", "Generate listing"]);
alias("Generate drafts", ["Generate ready drafts"]);
alias("Generating…", [
  "Generating",
  "Writing your listing",
  "Our AI is finding the useful details in your photos",
]);
alias("Settings", ["Listing style", "Description style"]);
alias("This item", ["For this new item", "this item"]);
alias("Item photo", [
  "Photo to edit",
  "Photo to delete",
  "Photo being uploaded",
  "Selected item’s cover photo",
  "Item to delete",
]);
alias("Photo options", ["Photo tool", "Item status"]);
alias("Next", ["Next ready", "Next ready item"]);
alias("Untitled item", ["Untitled draft"]);
alias("Preparing…", [
  "Preparing item",
  "Preparing your listing",
  "Preparing your photos",
  "Your photos are being securely prepared.",
  "Drafts are being prepared.",
]);
alias("Ready to copy", [
  "Draft ready",
  "Your listing is ready",
  "Your drafts are saved and ready to review.",
  "All drafts are ready to review and copy.",
]);
alias("Ready to generate", ["Ready to generate."]);
alias("Waiting…", ["Waiting"]);
alias("Resume", ["Resume to finish preparing your drafts."]);
alias("Select", [
  "Selected photos",
  "Select ready items",
  "Select at least one item to generate.",
]);
alias("Photos", ["Photo library"]);
alias("Saved in this browser", [
  "Your items are saved. Review them or add photos for another item.",
]);
alias("Take a photo or choose from your library", [
  "Tap to take a photo or choose from your gallery",
  "Choose from gallery",
]);
alias("Use your phone", [
  "Upload from your phone",
  "Scan to add photos from your phone",
  "Phone upload link",
]);
alias("Uploading…", [
  "Uploading",
  "Photos are uploading…",
  "Uploading photos… You can group the photos that are ready.",
]);
alias("Please sign in again to continue.", [
  "Sign in again to upload photos.",
  "Sign in to AutoLister to open this draft.",
  "Sign in to open your drafts.",
  "Sign in to the same account to continue this item.",
]);
alias("Something went wrong. Please try again.", [
  "The request could not be completed.",
  "The request path is not available.",
  "This draft action is not available.",
  "Invalid draft action.",
  "Invalid draft request.",
  "Invalid draft state.",
  "Invalid item identifier.",
  "Invalid page.",
  "We could not apply it to this account. Please try again.",
]);
alias("Could not connect. Try again.", [
  "We could not reach AutoLister. Check your connection and try again.",
  "Could not create QR code. Try again.",
  "Could not load the QR code. Try again.",
  "Could not open Google sign-in. Try again.",
  "Could not receive your photos. Try again.",
  "Could not check the current account. Reload to try again.",
  "Your preferences could not be loaded. Try again.",
]);
alias("Could not save settings. Try again.", [
  "Could not save defaults. Try again.",
  "Your settings could not be saved. Please try again.",
  "Your preferences could not be saved. Try again.",
  "Not saved. Change this setting again to retry.",
]);
alias("Your work could not be saved. Try again.", [
  "The generated text could not be saved.",
]);
alias("Could not send a code. Try again.", [
  "Unable to send the sign-in email.",
]);
alias("Your account changed. Reload AutoLister and open the draft again.", [
  "Your account changed. Reopen your model.",
  "This draft belongs to another account.",
]);
alias("This photo could not be prepared. Choose another image and try again.", [
  "The image could not be compressed.",
  "The image could not be prepared.",
  "The image dimensions could not be read.",
  "Image decode failed",
  "Image preparation is unavailable in this browser.",
  "The uploaded photos could not be prepared for generation.",
  "We could not upload this photo.",
  "Photo upload failed.",
  "Upload failed",
  "Upload incomplete",
  "Reopen this photo and try again.",
]);
alias("This photo is no longer available.", [
  "This photo is no longer saved in this browser.",
  "One of these photos is no longer available.",
  "This photo moved or is no longer saved. Reopen the item.",
]);
alias(
  "This browser's storage is full. Delete unused items or photos, then try again.",
  [
    "This browser's storage is full.",
    "This browser's photo storage is full. Delete unused photos and try again.",
  ],
);
alias("Your usage could not be checked. Try again before generating.", [
  "Your generation allowance could not be checked. Try again.",
  "Usage unavailable",
]);
alias(
  "You have reached your current generation limit. Your drafts are still saved.",
  [
    "You have no generations left in your current allowance. Your drafts are still saved.",
    "You have reached your current generation limit.",
  ],
);
alias("Choose up to 10 photos for one item.", [
  "Choose up to 10 different photos for one item.",
  "One item can have up to 10 photos.",
  "One item can have up to 10 photos. Wait for uploads or choose fewer photos.",
]);
alias("Choose up to 100 photos per import.", [
  "One import can have up to 100 photos.",
]);
alias("Choose a JPEG photo smaller than 4 MB.", [
  "Choose a prepared JPEG photo.",
  "Each prepared photo must be no larger than 4 MB.",
]);
alias(
  "Your generation is still being saved. Check its result before trying again.",
  [
    "This item is still being saved. Check its result before retrying.",
    "This item's result is still being checked. Check its saved result shortly.",
    "This item's outcome is still being checked. Use Check saved result before trying again.",
    "This item is generating in another tab. Check its result before generating again.",
    "Check this item's generation result before making changes.",
  ],
);
alias("This draft changed on another device. Your edits are still here.", [
  "This item changed in another tab. Reload its saved version.",
]);
alias("Add photos", [
  "Add photos of one item to prepare its listing.",
  "Choose this item's original photos.",
  "Choose this item's photos.",
]);
alias("Title", ["Add a title"]);
alias("Description", ["Add a description"]);
alias("All photos are grouped", [
  "All photos grouped. Generate each item automatically.",
]);
alias("Your work could not be saved. Try again.", [
  "Batch settings could not be saved for every item. Change this setting again to retry. Each item's last saved choices are safe.",
]);
alias("Select photos of the same item.", [
  "Choose photos that have not been grouped yet.",
]);
alias("Check your listing settings and try again.", [
  "Choose valid languages and description style.",
  "Choose valid listing settings.",
]);
alias("Load saved version", [
  "Choose which version of this draft to keep before continuing.",
]);
alias("Contact support", ["Contact us for tailored limits"]);
alias("Continue", ["Continue grouping"]);
alias("Could not open checkout. Please try again.", [
  "Could not open billing. Please try again.",
]);
alias("Reload your drafts.", [
  "Could not open this item.",
  "Reopen this item to edit its photo.",
  "Reload the photo groups before moving photos.",
  "Reload this draft before saving.",
  "This item is no longer saved in this browser.",
]);
alias("Add several items", ["Create items from selected photos"]);
alias("Separate items", ["Create one item per selected photo"]);
alias("Keep my edits", ["Restore edits"]);
alias("The request was cancelled.", [
  "Draft import cancelled.",
  "Photo generation was cancelled.",
  "Photo upload was cancelled.",
]);
alias("Your work could not be saved. Try again.", ["Drafts unavailable"]);
alias("Check your email", ["Email sent."]);
alias("Listed", ["Items you mark as listed will appear here."]);
alias("Signing you in", [
  "Signing in to AutoLister",
  "Just a moment while we finish securely.",
]);
alias("Preparing…", [
  "Keep AutoLister open while preparing.",
  "The next item is still preparing.",
]);
alias("This draft changed on another device. Your edits are still here.", [
  "This item changed.",
  "This item's photos changed.",
]);
alias("Generation failed.", [
  "This item could not be generated.",
  "This attempt did not finish. Review the item and generate again.",
]);
alias("This photo could not be prepared. Choose another image and try again.", [
  "This photo could not be opened. Close and try again.",
]);
alias("Check result", [
  "No saved result is available for that attempt. Check your usage before generating again.",
]);
alias("Review and copy", [
  "Open an item to review its photos and finish preparing it.",
  "Review",
  "You can review another draft while this item is being prepared.",
]);
alias("Sign in", [
  "Sign in or create an account",
  "We could not restore your session",
]);
alias("Not saved", [
  "Unsaved edits",
  "You have unsaved edits from this tab.",
  "Changed",
]);
alias("Update your payment", ["Update payment"]);
alias("Waiting…", [
  "Waiting for its turn. The previous text will be replaced.",
]);
alias("Wait for your settings and photos to finish saving.", [
  "Wait for this item's generation to finish before saving your edits.",
]);
alias("Keep my edits", ["Your style is still saved"]);
alias("Item settings", ["Processing mode"]);
alias("Review and copy", ["Write item"]);
alias("Please sign in again to continue.", [
  "A different account is signed in. Use a private window for reviewer access.",
  "Check the reviewer password and try again.",
]);
alias("Choose up to 10 photos for one item.", [
  "Choose fewer photos on your phone and try again.",
]);
alias("Choose photos", ["Choose an item."]);
alias("Preparing…", ["A batch is already running."]);
alias("Photo upload failed.", [
  "We could not upload this photo.",
  "Upload failed",
  "Upload incomplete",
]);
alias("Something went wrong. Please try again.", [
  "Saved note must be plain text.",
]);
alias("Unavailable", [
  "Mobile web app unavailable",
  "This private workspace is not enabled yet.",
]);
alias("Reload your drafts.", [
  "Close other AutoLister tabs, then reload to open your drafts.",
]);
alias("Try again", ["Reconnecting…"]);
alias("All photos are grouped", ["Continue grouping"]);
alias("Choose up to 10 photos for one item.", [
  "Remove a photo to add another",
]);
alias("Ungroup", ["Remove item. Return photos to the pool."]);
alias("Replace the paused batch? Its remaining items stay saved.", [
  "Replace the paused batch with this selection? Its remaining items will stay saved as drafts.",
]);
alias("Add photos", [
  "Add more photos",
  "Select Photos",
  "Select photo again",
  "Choose photos from your phone gallery.",
]);
alias("Sent to desktop", ["Sent to Desktop", "Photos Sent", "Sent"]);
alias("Ready", ["Photo ready"]);
alias("Waiting…", ["Waiting...", "Waiting"]);
alias("Unavailable", ["RAW unavailable"]);
alias("Failed", ["Error"]);
alias("Something went wrong. Please try again.", [
  "Couldn’t add model photos.",
]);
alias("Cancel", ["Cancel Entire Upload"]);
alias("The request was cancelled.", [
  "Upload Cancelled",
  "Upload cancelled",
  "Upload cancelled or replaced",
]);
alias("Try again", [
  "Retry Failed Photos",
  "Retry confirmation",
  "Retrying...",
]);
alias("Uploading…", [
  "Uploading...",
  "Sending",
  "Finalizing desktop handoff...",
]);
alias("Preparing…", [
  "Starting...",
  "Compressing...",
  "Processing...",
  "Compressing photos before upload. Keep this page open.",
]);
alias("Keep this page open while your photos are added.", [
  "Uploading compressed photos. Keep this page open.",
]);
alias("Ready", ["Ready to send"]);
alias("Waiting for your connection. Your photos are kept here.", [
  "Waiting for connection…",
  "Connection interrupted. Retrying…",
  "Upload is paused.",
]);
alias("Could not connect. Try again.", [
  "Could not finish the phone upload. Please retry.",
  "Could not start upload",
  "Upload error",
  "Upload request timed out",
  "Upload stopped making progress",
]);
alias("Try again", [
  "Please wait a moment before retrying.",
  "Retry the failed photos when your connection is stable.",
]);
alias("Upload finished, but desktop was not notified. Tap retry.", [
  "Could not notify your desktop. Tap retry.",
  "Tap retry to notify your desktop again.",
  "Upload finished, but desktop was not notified. Try again.",
]);
alias("Start a new phone upload from your desktop.", [
  "This upload is no longer available. Start a new phone upload from your desktop.",
]);
alias(
  "This upload session expired. Its temporary photos are no longer available. Start a new phone upload from your desktop.",
  ["Upload Expired"],
);
alias("Needs attention", ["We couldn’t load this photo"]);
alias("Upload Photos", ["Upload Batch Photos", "QuickVint Upload"]);
alias("Select photos of the same item.", [
  "Select photos for your",
  "current item",
  "Select the same item photos to finish opening your draft.",
  "Choose the same item photos",
]);
alias("Add item", ["Start a new session for a different item."]);
alias("Use your phone", ["Start a new phone upload from your desktop."]);
alias("Copied", ["Link copied to clipboard"]);
alias("Your drafts", ["Your ChatGPT draft", "Open draft"]);
alias("Please sign in again to continue.", [
  "Sign in to open your draft.",
  "Sign in to AutoLister",
]);
alias("Open a draft from ChatGPT to continue.", [
  "Open the original draft link from ChatGPT.",
]);
alias("Opening…", ["Opening your draft…", "Loading photos…"]);
alias("Ready to copy", ["Draft opened in AutoLister."]);
alias("Your account changed. Reload AutoLister and open the draft again.", [
  "Your account changed. Open the draft again.",
]);
alias("Reload your drafts.", [
  "Could not open this draft.",
  "Could not open this draft. Try again.",
]);

export const uiCatalogs = Object.fromEntries(
  UI_LOCALES.map((locale) => {
    const copy = { ...workspaceCopy[locale] };
    const enStyle = getTranslation("en").ui;
    const localStyle = getTranslation(locale).ui;
    for (const key of Object.keys(enStyle) as (keyof typeof enStyle)[])
      copy[enStyle[key]] ??= localStyle[key];
    for (const key of Object.keys(
      billingCopy.en,
    ) as (keyof typeof billingCopy.en)[])
      copy[billingCopy.en[key]] ??= billingCopy[locale][key];
    // These aliases use existing complete catalogs instead of copying their translations.
    copy["Bullet points"] = copy.Bullets;
    copy.Paragraphs = copy.Text;
    copy["Change listing style"] = copy["Edit style"];
    copy["Choose a plan"] = copy["Choose a plan or credits"];
    copy["One-time credits"] = copy["One-time"];
    copy["Free plan"] = copy.Free;
    copy["Regenerate · 1 generation"] = copy["Generate draft"] + " · 1";
    copy["Retry · 1 generation"] = copy["Retry generation"] + " · 1";
    for (const [source, target] of Object.entries(aliases)) {
      if (source in workspaceCopy[locale]) continue;
      let key = target;
      const seen = new Set([source]);
      while (!copy[key] && aliases[key] && !seen.has(key)) {
        seen.add(key);
        key = aliases[key];
      }
      if (!copy[key]) throw new Error(`Unknown UI copy alias: ${target}`);
      copy[source] = copy[key];
    }
    copy["Close account"] = `${copy.Close}: ${copy.Account}`;
    copy["Emojis: locked, view plans"] =
      `${copy.Emojis}: ${copy["View plans"]}`;
    copy["Include seller note: locked, view plans"] =
      `${copy["Include seller note"]}: ${copy["View plans"]}`;
    copy["Save photo (JPEG)"] = `${copy["Save photo"]} (JPEG)`;
    copy["From this device"] = copy["Choose photos"];
    copy.Camera = copy["Take photo"];
    copy["New listing"] = copy["Add item"];
    copy.New = copy["Add item"];
    copy[
      "Review your listing before posting. AutoLister is not affiliated with Vinted."
    ] ??=
      `${copy["Review and copy"]}. ${copy["AutoLister is not affiliated with Vinted."]}`;
    copy["Manage your payment securely with Stripe."] ??=
      copy["Secure checkout by Stripe. Cancel anytime."];
    copy["No daily cap"] = copy.Unlimited;
    copy["No monthly cap"] = copy.Unlimited;
    copy["Uses 1 generation"] = `${copy["Uses generations"]}: 1`;
    Object.assign(copy, {
      "{0} of {1} listings remaining": `${copy["Listings remaining"]}: {0}/{1}`,
      "{0} listings remaining": `${copy["Listings remaining"]}: {0}`,
      "{0} generation{1} left": `${copy["Listings remaining"]}: {0}`,
      "{0} plan": "{0}",
      "Securely uploading {0} of {1} photos": `${copy["Uploading…"]} {0}/{1}`,
      "{0} photo{1} selected": `${copy.Photos} (${copy.Selected}): {0}`,
      "Selected photo {0}": `${copy.Photos} (${copy.Selected}): {0}`,
      "Remove photo {0}": `${copy.Remove}: ${copy.Photos} {0}`,
      "{0}: locked, view plans": `{0}: ${copy["View plans"]}`,
      "Hashtags {0} · Emojis {1} · {2}": `${copy.Hashtags} {0} · ${copy.Emojis} {1} · {2}`,
      "Title: {0} · Description: {1}": `${copy.Title}: {0} · ${copy.Description}: {1}`,
      "Select {0}": `${copy.Select}: {0}`,
      "item {0}": `${copy.Item} {0}`,
      "Item {0}": `${copy.Item} {0}`,
      "{0} photo{1} · {2}": `${copy.Photos}: {0} · {2}`,
      "{0} selected": `${copy.Selected}: {0}`,
      "Generate {0} draft{1}": `${copy["Generate drafts"]}: {0}`,
      "Select photo {0}": `${copy.Select}: ${copy.Photos} {0}`,
      "Items ({0})": `${copy["Your items"]} ({0})`,
      "Settings for {0}": `${copy.Settings}: {0}`,
      "Remove {0} from batch": `${copy.Remove}: {0} (${copy["This batch"]})`,
      "Uses {0} generation{1}{2}": `${copy["Uses generations"]}: {0}{2}`,
      ". {0} unassigned photos stay saved.": ` · ${copy["Saved in this browser"]}: {0}`,
      "{0} photos waiting to be grouped": `${copy.Photos}: {0} · ${copy["Group photos to create an item."]}`,
      "This item · {0}": `${copy["This item"]} · {0}`,
      "Photos · {0}": `${copy.Photos} · {0}`,
      "This item{0}": `${copy["This item"]}{0}`,
      "Copy {0}{1}": `${copy.Copy}: {0}{1}`,
      "Photo {0} options": `${copy["Photo options"]}: {0}`,
      "{0} of {1} ready{2}": `${copy.Ready}: {0}/{1}{2}`,
      "Paused · {0} of {1} ready": `${copy.Paused} · ${copy.Ready}: {0}/{1}`,
      " · {0} failed": ` · ${copy.Failed}: {0}`,
      "{0} items": `${copy["Your items"]}: {0}`,
      "{0} copied.": `${copy.Copied}: {0}`,
      "Generate the first {0} of {1} selected items? This run uses {2} generations (up to 20 per run). The remaining items stay saved.":
        copy["Generate {0} of {1} items? The remaining items stay saved."],
      "Delete {0} item{1} and their {2} photos? This cannot be undone.":
        copy["Delete {0} items and {2} photos? This cannot be undone."],
      "Delete “{0}” and its {1} photos? This cannot be undone.":
        copy["Delete “{0}” and {1} photos? This cannot be undone."],
      "Replace the current title and description for {0}? This uses {1} generation{2}.":
        copy[
          "Replace the title and description for {0}? Uses {1} generations."
        ],
      "Adding {0} of {1}…": `${copy["Uploading…"]} {0}/{1}`,
      "Sending {0} / {1}": `${copy["Uploading…"]} {0}/{1}`,
      "Sending {0} of {1}": `${copy["Uploading…"]} {0}/{1}`,
      "{0} of {1} photos sent": `${copy["Sent to desktop"]}: {0}/{1}`,
      "{0} photos sent": `${copy["Sent to desktop"]}: {0}`,
      "{0} photos ready on your computer": `${copy["Sent to desktop"]}: {0}`,
      "{0} photo{1} failed": `${copy.Failed}: {0}`,
      "{0} photo{1} failed. Retry when ready.": `${copy.Failed}: {0}. ${copy["Try again"]}`,
      "{0} photo{1} failed. Try again.": `${copy.Failed}: {0}. ${copy["Try again"]}`,
      "{0} photo{1} need another try.": `${copy["Try again"]}: {0}`,
      "Retry {0} failed photo{1}": `${copy["Try again"]} (${copy.Failed}: {0})`,
      "Send {0} photo{1}": `${copy["Upload Photos"]}: {0}`,
    });
    copy["Session:"] = "ID:";
    copy["Remove photo"] = `${copy.Remove}: ${copy.Photos}`;
    copy["Paid options"] = copy["Choose a plan"];
    copy["Crop shape"] = copy.Crop;
    copy["Rotate 90°"] = `${copy.Rotate} 90°`;
    copy["Undo hide"] = copy.Undo;
    copy["Text ready · Model photos pending"] = copy["Ready to copy"];
    copy["{0} degrees"] = "{0}°";
    copy["0 degrees"] = "0°";
    return [locale, copy];
  }),
) as Record<UiLocale, Record<string, string>>;

export function uiText(
  source: string,
  language: string = getUiLocale(),
): string {
  const locale = getUiLocale([normalizeLanguage(language)]);
  return locale === "en" ? source : (uiCatalogs[locale][source] ?? source);
}
export function uiFormat(
  source: string,
  values: readonly unknown[],
  language: string = getUiLocale(),
): string {
  if (source === "{0} degrees")
    return new Intl.NumberFormat(uiLanguageTag(getUiLocale([language])), {
      style: "unit",
      unit: "degree",
      unitDisplay: "long",
    }).format(Number(values[0]));
  return uiText(source, language).replace(/\{(\d+)\}/g, (_, index: string) =>
    String(values[Number(index)] ?? ""),
  );
}
/** API error text has no interface locale. Map known messages; keep unknown provider text out of the UI. */
export function uiError(message: unknown): string {
  const source = typeof message === "string" ? message : "";
  const locale = getUiLocale();
  if (
    source &&
    (locale === "en" || Object.values(uiCatalogs[locale]).includes(source))
  )
    return source;
  return source in uiCatalogs.en
    ? uiText(source)
    : uiText("Something went wrong. Please try again.");
}

const attributes = [
  "aria-label",
  "aria-valuetext",
  "title",
  "alt",
  "placeholder",
];
/** Call on static application-owned markup before inserting user data. Never observe or rewrite the workspace. */
export function localizeUiFragment(
  root: ParentNode,
  language: string = getUiLocale(),
): void {
  const document = (root as Node).ownerDocument ?? (root as Document);
  if (typeof document.createTreeWalker !== "function") return;
  const walker = document.createTreeWalker(root as Node, 4);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    if (
      !parent ||
      parent.closest("script, style, [data-style-example], [data-ui-content]")
    )
      continue;
    const source = node.textContent || "";
    const trimmed = source.trim();
    if (trimmed in uiCatalogs.en)
      node.textContent = source.replace(trimmed, uiText(trimmed, language));
  }
  for (const element of Array.from(root.querySelectorAll<HTMLElement>("*"))) {
    if (element.closest("[data-ui-content]")) continue;
    for (const attribute of attributes) {
      const value = element.getAttribute(attribute);
      if (value && value in uiCatalogs.en)
        element.setAttribute(attribute, uiText(value, language));
    }
    if (element.tagName === "TEMPLATE")
      localizeUiFragment((element as HTMLTemplateElement).content, language);
  }
}
const initializedUiRoots = new WeakSet<ParentNode>();
export function initializeUiLocale(root: ParentNode): void {
  if (initializedUiRoots.has(root)) return;
  initializedUiRoots.add(root);
  if (typeof document !== "undefined" && document.documentElement)
    document.documentElement.lang = uiLanguageTag();
  localizeUiFragment(root);
  if (typeof document !== "undefined" && document.title) {
    document.title = document.title
      .split(" | ")
      .map((part) => uiText(part))
      .join(" | ");
  }
}
