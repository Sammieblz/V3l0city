import Link from "next/link";

import { appConfig } from "@/lib/config";
import { Brand } from "@/components/shared/brand";

export function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <Brand />
            <p className="copy" style={{ fontSize: ".95rem", marginTop: 14 }}>A focused driving dashboard for people who prefer calm, legible data and clear privacy choices.</p>
          </div>
          <div>
            <h2>Product</h2>
            <Link href="/demo">Product demo</Link>
            <Link href="/how-it-works">How it works</Link>
            <Link href="/safety">Driving safety</Link>
            <Link href="/auth/sign-up">Create account</Link>
          </div>
          <div>
            <h2>Legal & privacy</h2>
            <Link href="/privacy">Privacy notice</Link>
            <Link href="/terms">Terms of Service</Link>
            <Link href="/cookies">Cookie notice</Link>
            <Link href="/data-rights">Data rights</Link>
            <Link href="/acceptable-use">Acceptable use</Link>
            <Link href="/report">Report a profile</Link>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} {appConfig.legalEntityName}. All rights reserved.</span>
          <span>Do not interact with V3l0city while operating a vehicle.</span>
        </div>
      </div>
    </footer>
  );
}
