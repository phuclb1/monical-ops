import type { MetadataRoute } from "next";
import { listNews } from "@/lib/news";
import { absoluteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const posts = listNews().map((post) => ({
    url: absoluteUrl(`/tin-tuc/${post.slug}`),
    lastModified: post.updatedAt,
    changeFrequency: "monthly" as const,
    priority: 0.9,
  }));
  return [
    {
      url: absoluteUrl("/tin-tuc"),
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...posts,
  ];
}
