import type { MetadataRoute } from "next";
import { appConfig } from "@/lib/config";

const publicPaths = ["", "/demo", "/how-it-works", "/privacy", "/terms", "/cookies", "/safety", "/acceptable-use", "/data-rights"];

export default function sitemap(): MetadataRoute.Sitemap {
  return publicPaths.map((path) => ({ url: `${appConfig.siteUrl}${path}`, lastModified: new Date(), changeFrequency: path === "" ? "weekly" : "monthly", priority: path === "" ? 1 : 0.6 }));
}
