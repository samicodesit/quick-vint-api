import { BLOG_COPY, type BlogCategory, type BlogLocale } from "../i18n/blog.js";

export const CHROME_WEB_STORE_URL =
  "https://chromewebstore.google.com/detail/autolister-ai/mommklhpammnlojjobejddmidmdcalcl";

export type BlogPost = {
  id: string;
  body?: string;
  rendered?: { html?: string };
  data: {
    title: string;
    description: string;
    publishDate: Date;
    updatedDate?: Date;
    category: BlogCategory;
    tags: string[];
    author: string;
    heroImage?: string;
    heroImageAlt?: string;
    locale: BlogLocale;
    translationKey: string;
    slug: string;
    draft: boolean;
    faqItems?: { question: string; answer: string }[];
  };
};

export function getPostUrl(post: BlogPost): string {
  const locale = post.data.locale as BlogLocale;
  return locale === "en"
    ? `/blog/${post.data.slug}`
    : `/${locale}/blog/${post.data.slug}`;
}

export function getCategoryUrl(
  locale: BlogLocale,
  category: BlogCategory,
): string {
  return locale === "en"
    ? `/blog/category/${category}`
    : `/${locale}/blog/category/${category}`;
}

export function getCategoryLabel(
  locale: BlogLocale,
  category: BlogCategory,
): string {
  return BLOG_COPY[locale].categories[category];
}

export function formatBlogDate(date: Date, locale: BlogLocale): string {
  const localeMap: Record<BlogLocale, string> = {
    en: "en-GB",
    fr: "fr-FR",
    de: "de-DE",
    nl: "nl-NL",
  };

  return new Intl.DateTimeFormat(localeMap[locale], {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function estimateReadingTime(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 220));
}

export function sortPostsByDate(posts: BlogPost[]): BlogPost[] {
  return [...posts].sort(
    (a, b) => b.data.publishDate.getTime() - a.data.publishDate.getTime(),
  );
}

export function getPublishedPosts(posts: BlogPost[]): BlogPost[] {
  return sortPostsByDate(posts.filter((post) => !post.data.draft));
}

export function getRelatedPosts(
  currentPost: BlogPost,
  allPosts: BlogPost[],
  limit = 3,
): BlogPost[] {
  return sortPostsByDate(
    allPosts.filter(
      (post) =>
        post.id !== currentPost.id &&
        !post.data.draft &&
        post.data.locale === currentPost.data.locale &&
        (post.data.category === currentPost.data.category ||
          post.data.tags.some((tag: string) =>
            currentPost.data.tags.includes(tag),
          )),
    ),
  ).slice(0, limit);
}
