import {
  confirmedFactsSchema,
  listingLocaleSchema,
  type ConfirmedFacts,
} from "../../../src/ops/contracts/listings";
import { templates, type TemplateLabels } from "./templates";

export type ListingTemplate = {
  locale: "en" | "nl" | "fr" | "de" | "pl" | "es" | "it";
  labels?: TemplateLabels;
  prefix?: string;
  suffix?: string;
};

export function renderListing(
  confirmedFacts: ConfirmedFacts,
  template: ListingTemplate,
  humanDescriptionOverride: string | null = null,
) {
  const facts = confirmedFactsSchema.parse(confirmedFacts);
  const locale = listingLocaleSchema.parse(template.locale);
  const labels = template.labels ?? templates[locale];
  const title = [facts.brand, facts.model, facts.category, facts.size]
    .filter(Boolean)
    .join(" ")
    .slice(0, 100);
  const lines: string[] = [];
  if (template.prefix) lines.push(template.prefix);
  for (const [label, value] of [
    [labels.brand, facts.brand],
    [labels.size, facts.size],
    [labels.colour, facts.colour],
    [labels.material, facts.material],
    [labels.condition, facts.condition],
  ])
    if (value !== null) lines.push(`${label}: ${value}`);
  if (facts.measurements.length)
    lines.push(
      `${labels.measurements}: ${facts.measurements.map((m) => `${m.label} ${m.value} ${m.unit}`).join(", ")}`,
    );
  if (facts.defects.length)
    lines.push(`${labels.defects}: ${facts.defects.join("; ")}`);
  if (template.suffix) lines.push(template.suffix);
  const description = humanDescriptionOverride ?? lines.join("\n");
  return { title, description };
}

export function listingIssues(input: {
  facts: ConfirmedFacts;
  title: string;
  description: string;
  priceMinor: number;
  currency: string;
}) {
  const issues: string[] = [];
  if (!input.facts.category) issues.push("Confirm a category");
  if (!input.facts.condition) issues.push("Confirm the condition");
  if (!input.title.trim()) issues.push("Add a title");
  if (!input.description.trim()) issues.push("Add a description");
  if (
    !Number.isSafeInteger(input.priceMinor) ||
    input.priceMinor <= 0 ||
    !/^[A-Z]{3}$/.test(input.currency)
  )
    issues.push("Set a valid price");
  return issues;
}
