import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/tin-tuc", "/_next/", "/logo.png"],
      disallow: [
        "/api/",
        "/login",
        "/today",
        "/tasks",
        "/rooms",
        "/handover",
        "/more",
        "/reception",
        "/kitchen",
        "/shifts",
        "/forms",
        "/incidents",
        "/reports",
        "/staff",
        "/roster",
        "/notifications",
      ],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
