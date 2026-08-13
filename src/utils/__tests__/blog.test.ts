import { describe, expect, it } from "vitest";
import {
  getBlogEntrancePosts,
  getPublishedPosts,
  getRelatedPosts,
  isHiddenFromBlogEntrances,
  type BlogPost,
} from "../blog";

function makePost(
  translationKey: string,
  overrides: Partial<BlogPost["data"]> = {},
): BlogPost {
  return {
    id: `${overrides.locale || "en"}/${translationKey}`,
    body: "Post body",
    data: {
      title: translationKey,
      description: `${translationKey} description`,
      publishDate: new Date("2026-08-01T00:00:00Z"),
      category: "selling-tips",
      tags: ["selling"],
      author: "AutoLister AI",
      locale: "en",
      translationKey,
      slug: translationKey,
      draft: false,
      ...overrides,
    },
  };
}

describe("blog entrance visibility", () => {
  it("hides batch and multiple-generation posts from blog entrances only", () => {
    const batchPost = makePost("batch-generate-vinted-listings");
    const manyItemsPost = makePost("sell-many-items-at-once");
    const visiblePost = makePost("how-to-sell-on-vinted-beginner-checklist");

    expect(isHiddenFromBlogEntrances(batchPost)).toBe(true);
    expect(isHiddenFromBlogEntrances(manyItemsPost)).toBe(true);
    expect(isHiddenFromBlogEntrances(visiblePost)).toBe(false);

    expect(
      getBlogEntrancePosts([batchPost, manyItemsPost, visiblePost]),
    ).toEqual([visiblePost]);
    expect(
      getPublishedPosts([batchPost, manyItemsPost, visiblePost]),
    ).toHaveLength(3);
  });

  it("does not recommend hidden posts in related post entrances", () => {
    const currentPost = makePost("current-post", {
      tags: ["selling", "batch-listing"],
    });
    const hiddenRelatedPost = makePost("batch-generate-vinted-listings", {
      tags: ["batch-listing"],
    });
    const visibleRelatedPost = makePost("visible-related-post", {
      tags: ["selling"],
    });

    expect(
      getRelatedPosts(currentPost, [
        currentPost,
        hiddenRelatedPost,
        visibleRelatedPost,
      ]),
    ).toEqual([visibleRelatedPost]);
  });
});
