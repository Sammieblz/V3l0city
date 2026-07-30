import Link from "next/link";

import { DemoSimulator } from "@/components/marketing/demo-simulator";
import { Footer } from "@/components/shared/footer";
import { PublicNav } from "@/components/shared/public-nav";
import { publicMetadata } from "@/lib/seo";

export const metadata = publicMetadata({ title: "Product demo", description: "Explore the V3l0city instrument dashboard without location access or an account.", path: "/demo" });

export default function DemoPage() {
  return <div className="site-shell marketing-theme-shell"><PublicNav /><main id="main-content"><section className="demo-hero"><div className="container"><span className="eyebrow">No account. No location.</span><h1 className="display heading-xl">The instrument,<br /><span className="accent">uninterrupted.</span></h1><p className="copy">A contained product demonstration—not a trip recorder. Take a look at the information hierarchy before you decide whether V3l0city fits.</p></div></section><section className="section demo-section"><div className="container"><DemoSimulator /></div></section><section className="section-tight"><div className="container notice"><span aria-hidden="true">!</span><div><strong>Real browser recordings are manual and foreground-only.</strong> Keep the page open, visible, and unlocked; never interact with the dashboard while operating a vehicle. <Link href="/safety">Read the safety guidance.</Link></div></div></section><section className="section-tight"><div className="container center-callout"><h2 className="display heading-md">Ready to make the dashboard yours?</h2><Link className="button button-primary" href="/auth/sign-up">Create an account</Link></div></section></main><Footer /></div>;
}
