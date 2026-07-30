import type { MetadataRoute } from "next";
import { appConfig } from "@/lib/config";

export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: "/", disallow: ["/dashboard", "/drive", "/history", "/insights", "/friends", "/leaderboards", "/account", "/auth", "/report"] }], sitemap: `${appConfig.siteUrl}/sitemap.xml` };
}
