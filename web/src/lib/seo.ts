import type { Metadata } from "next";

import { appConfig } from "@/lib/config";

const shareImage = "/opengraph-image";

export function publicMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  const url = path || "/";
  const shareTitle = title === "V3l0city" ? "V3l0city — Drive data, in focus" : `${title} | V3l0city`;

  return {
    title: title === "V3l0city" ? { absolute: shareTitle } : title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      siteName: "V3l0city",
      title: shareTitle,
      description,
      images: [{ url: shareImage, width: 1200, height: 630, alt: "V3l0city driving dashboard" }],
    },
    twitter: {
      card: "summary_large_image",
      title: shareTitle,
      description,
      images: [shareImage],
    },
  };
}

export const noIndexMetadata: Metadata = {
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export const siteOrganizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "V3l0city",
  url: appConfig.siteUrl,
  logo: `${appConfig.siteUrl}/brand/brand-mark.png`,
};
