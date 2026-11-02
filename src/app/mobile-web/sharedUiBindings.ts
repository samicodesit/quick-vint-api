import shared from "../../data/sharedUiCopy.json";
import billing from "../../data/billingCopy.json";

type SharedId = keyof typeof shared.messages;
type SharedLocale = keyof (typeof shared.messages)[SharedId];
const webBindings: Record<string, SharedId> = {
  "Add photos": "action.addPhotos",
  Back: "action.back",
  Cancel: "action.cancel",
  Close: "action.close",
  Continue: "action.continue",
  Done: "action.done",
  Next: "action.next",
  "Not now": "action.notNow",
  Settings: "action.settings",
  Skip: "action.skip",
  "Try again": "action.tryAgain",
  Short: "listing.short",
  Long: "listing.long",
  Hashtags: "listing.hashtags",
  Emojis: "listing.emojis",
  "Seller note": "listing.sellerNote",
  "Description length": "listing.descriptionLength",
  "Title language": "listing.titleLanguage",
  "Description language": "listing.descriptionLanguage",
  "Smoke-free home. Happy to bundle items.": "listing.sellerNotePlaceholder",
  "Contact support": "support.contact",
  "Continue with a paid option": "paywall.pausedTitle",
  "Paid plans and credit packs let legitimate sellers continue while support reviews duplicate free-trial issues.":
    "paywall.pausedMessage",
  "Secure checkout by Stripe. Contact support if this pause looks wrong.":
    "paywall.pausedTrust",
};
// Fixed consumer keys keep English copy edits independent of lookup identity.
const billingBindings: Record<string, keyof typeof billing.en> = {
  Monthly: "monthly",
  "One-time": "oneTime",
  "per listing": "perListing",
  "Per-listing prices assume full monthly use.": "qualifier",
  "No subscription. Credits never expire.": "terms",
  "{credits} listing credits": "pack",
  "Buy {credits} credits": "buy",
  "Choose a plan or credits": "title",
  "{daily}/day · {monthly}/month": "limits",
  "/month": "perMonth",
  "Buy credits": "buyCredits",
  "You’ve used all {limit} free listings": "freeLimitTitle",
  "Choose a plan or buy one-time credits to continue.": "freeLimitMessage",
  "Continue with {plan}": "continueWith",
  "Opening checkout...": "openingCheckout",
  "Could not open checkout. Please try again.": "checkoutError",
  "Close paid options": "closePaywall",
  "Compare all plans": "comparePlans",
  "Most popular": "popular",
  "Secure checkout by Stripe. Cancel anytime.": "subscriptionTrust",
  "Secure checkout by Stripe. One-time purchase.": "oneTimeTrust",
};
export const sharedWebSources = [
  ...Object.keys(webBindings),
  ...Object.keys(billingBindings),
];
export const isSharedWebSource = (source: string) =>
  sharedWebSources.includes(source);
export function sharedWebCopy(locale: SharedLocale): Record<string, string> {
  return Object.fromEntries([
    ...Object.entries(webBindings).map(([source, id]) => [
      source,
      shared.messages[id][locale],
    ]),
    ...Object.entries(billingBindings).map(([source, id]) => [
      source,
      billing[locale][id],
    ]),
  ]);
}
export function sharedStyleCopy(locale: SharedLocale) {
  return {
    short: shared.messages["listing.short"][locale],
    long: shared.messages["listing.long"][locale],
    hashtags: shared.messages["listing.hashtags"][locale],
    emojis: shared.messages["listing.emojis"][locale],
    note: shared.messages["listing.sellerNote"][locale],
    done: shared.messages["action.done"][locale],
    skip: shared.messages["action.skip"][locale],
  };
}
