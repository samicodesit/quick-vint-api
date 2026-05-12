// @ts-nocheck -- Astro endpoint imports ESM-only integration modules under a CommonJS tsc package boundary.
import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import { BLOG_COPY } from "../../i18n/blog.js";
import { getPostUrl, getPublishedPosts } from "../../utils/blog.js";

export async function GET(context: { site: URL }) {
  const locale = "en";
  const posts = getPublishedPosts(
    await getCollection(
      "blog",
      ({ data }) => data.locale === locale && !data.draft,
    ),
  );

  return rss({
    title: BLOG_COPY[locale].seoTitle,
    description: BLOG_COPY[locale].seoDescription,
    site: context.site,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.publishDate,
      link: getPostUrl(post),
      categories: [post.data.category, ...post.data.tags],
    })),
  });
}
