import type { Metadata } from "next";
import Link from "next/link";

import { Hero } from "@/components/marketing/hero";
import { Footer } from "@/components/shared/footer";
import { PublicNav } from "@/components/shared/public-nav";
import { Reveal } from "@/components/shared/reveal";
import { appConfig } from "@/lib/config";
import { publicMetadata, siteOrganizationJsonLd } from "@/lib/seo";

export const metadata: Metadata = publicMetadata({
  title: "V3l0city",
  description: "A focused, privacy-minded driving dashboard for manual trip recording on a phone and calm review everywhere else.",
  path: "/",
});

const faqs = [
  ["Can V3l0city record in the background?", "No. Browser recording is foreground-only. Keep the mobile page open, visible, and unlocked while recording."],
  ["Does V3l0city replace a vehicle speedometer?", "No. It is a personal trip-data tool, not a safety device, regulated instrument, or replacement for your vehicle’s controls."],
  ["What is shared by default?", "Nothing. Cloud backup, leaderboards, and nearby discovery are all off until you choose to enable them."],
];

export default function Home() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      siteOrganizationJsonLd,
      {
        "@type": "WebSite",
        name: "V3l0city",
        url: appConfig.siteUrl,
      },
      {
        "@type": "SoftwareApplication",
        name: "V3l0city",
        applicationCategory: "UtilitiesApplication",
        operatingSystem: "Web, iOS, Android",
        description: "A focused, privacy-minded driving dashboard for manual trip recording and review.",
        url: appConfig.siteUrl,
      },
      {
        "@type": "FAQPage",
        mainEntity: faqs.map(([question, answer]) => ({
          "@type": "Question",
          name: question,
          acceptedAnswer: { "@type": "Answer", text: answer },
        })),
      },
    ],
  };
  return (
    <div className="site-shell marketing-theme-shell">
      <PublicNav showThemeToggle />
      <main id="main-content">
        <Hero />
        <section className="section-tight feature-rail"><Reveal className="container three-col grid"><div><span>01</span><h2>Manual by design</h2><p>Recording only begins and ends when you explicitly choose.</p></div><div><span>02</span><h2>Yours by default</h2><p>Browser storage stays local until you enable cloud backup.</p></div><div><span>03</span><h2>Readable at rest</h2><p>History and insights are designed for review, never for distraction.</p></div></Reveal></section>
        <section className="section"><Reveal className="container story-grid"><div><span className="eyebrow">A browser release with boundaries</span><h2 className="display heading-lg">Useful on the road. <span className="accent">Respectful of it.</span></h2></div><div><p className="copy">The V3l0city browser experience is intentionally narrower than the native app. It records a manually started trip in the foreground on a compatible phone. Desktop is for review, not driving.</p><Link href="/safety" className="text-link">Read driving safety and browser limitations <span>→</span></Link></div></Reveal></section>
        <section className="section section-surface"><Reveal className="container"><div className="section-head"><div><span className="eyebrow">Privacy controls</span><h2 className="display heading-lg">Share on your terms.</h2></div><p className="copy">Your profile, cloud backup, global leaderboards, and coarse nearby discovery each have distinct controls. Nothing social is on by default.</p></div><div className="privacy-board"><div className="privacy-line"><span className="privacy-indicator" /><div><strong>Browser trip library</strong><p>Stored in this browser’s separate local database.</p></div><b>LOCAL</b></div><div className="privacy-line"><span className="privacy-indicator off" /><div><strong>Cloud backup</strong><p>Optional encrypted-in-transit restore and sync for your own account.</p></div><b>OFF BY DEFAULT</b></div><div className="privacy-line"><span className="privacy-indicator off" /><div><strong>Social discovery</strong><p>Optional profiles and coarse nearby area only—not routes or exact location.</p></div><b>OFF BY DEFAULT</b></div></div></Reveal></section>
        <section className="section"><Reveal className="container cta-panel panel"><div><span className="eyebrow">Start with a look</span><h2 className="display heading-lg">See the instrument before you create an account.</h2></div><div><p className="copy">The public simulator is a no-location, no-account preview of the dashboard’s visual language.</p><Link className="button button-primary" href="/demo">Open product demo</Link></div></Reveal></section>
        <section className="section faq-section"><Reveal className="container"><span className="eyebrow">Questions, answered</span><h2 className="display heading-lg">Clear limits are part of the product.</h2><div className="faq-list">{faqs.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></Reveal></section>
      </main>
      <Footer />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    </div>
  );
}
