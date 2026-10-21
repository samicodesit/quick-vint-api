import copy from "../data/billingCopy.json";
export function getBillingCopy(language = "en") {
  const code = language.toLowerCase().split(/[-_]/)[0].replace(/^cs$/, "cz");
  return copy[code as keyof typeof copy] || copy.en;
}
export function formatPrice(price: number, locale = "en", digits = 2) {
  return new Intl.NumberFormat(locale === "cz" ? "cs" : locale, {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(price);
}
export function formatUnitPrice(
  price: number,
  quantity: number,
  locale = "en",
) {
  const unit = price / quantity;
  return formatPrice(unit, locale, unit < 0.1 ? 3 : 2);
}
