import type { ReactNode } from "react";

import { Footer } from "@/components/shared/footer";
import { PublicNav } from "@/components/shared/public-nav";
import { appConfig } from "@/lib/config";

export type LegalSection = { title: string; content: ReactNode };

export function LegalPage({ eyebrow = "Legal & privacy", title, intro, sections }: { eyebrow?: string; title: ReactNode; intro: ReactNode; sections: LegalSection[] }) {
  return (
    <div className="site-shell"><PublicNav /><main id="main-content"><section className="legal-hero"><div className="container"><span className="eyebrow">{eyebrow}</span><h1 className="display heading-xl">{title}</h1><p className="copy">{intro}</p><p className="legal-effective">Effective {appConfig.legalEffectiveDate} · Version {appConfig.termsVersion}</p></div></section><section className="section legal-body"><div className="container"><div className="legal-content">{sections.map((section) => <section key={section.title}><h2>{section.title}</h2><div>{section.content}</div></section>)}</div></div></section></main><Footer /></div>
  );
}

export const ContactLine = () => <p>Contact <a href={`mailto:${appConfig.privacyEmail}`}>{appConfig.privacyEmail}</a>, or write to {appConfig.legalEntityName}, {appConfig.legalAddress}.</p>;
