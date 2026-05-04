// @ts-nocheck -- Astro content config imports ESM-only virtual modules that the project's Node16 tsc setup does not resolve.
import { glob } from "astro/loaders";
import { defineCollection, z } from "astro:content";

const BLOG_LOCALES = ["en", "fr", "de", "nl"] as const;
const BLOG_CATEGORIES = [
  "selling-tips",
  "marketplace-guide",
  "tool-comparison",
  "pricing-strategy",
  "success-stories",
] as const;

const blog = defineCollection({
  loader: glob({
    pattern: "**/*.{md,mdx}",
    base: "./src/content/blog",
    generateId: ({ entry }) => entry.replace(/\.(md|mdx)$/, ""),
  }),
  schema: z.object({
    title: z.string().min(10),
    description: z.string().min(50).max(180),
    publishDate: z.date(),
    updatedDate: z.date().optional(),
    category: z.enum(BLOG_CATEGORIES),
    tags: z.array(z.string()).default([]),
    author: z.string().default("AutoLister AI Team"),
    heroImage: z.string().optional(),
    heroImageAlt: z.string().optional(),
    locale: z.enum(BLOG_LOCALES).default("en"),
    translationKey: z.string().min(3),
    slug: z.string().min(3),
    draft: z.boolean().default(false),
    faqItems: z
      .array(
        z.object({
          question: z.string().min(8),
          answer: z.string().min(20),
        }),
      )
      .optional(),
  }),
});

export const collections = { blog };
