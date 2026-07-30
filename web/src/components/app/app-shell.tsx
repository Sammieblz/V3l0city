"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useApp } from "@/components/app/app-provider";
import { Brand } from "@/components/shared/brand";

const navigation = [
  ["/dashboard", "Dashboard"],
  ["/drive", "Drive"],
  ["/history", "History"],
  ["/insights", "Insights"],
  ["/friends", "Friends"],
  ["/leaderboards", "Leaders"],
  ["/account", "Account"],
] as const;

function LegalGate() {
  const { acceptTerms } = useApp();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return <main className="app-main"><div className="container"><div className="gate panel"><span className="eyebrow">One more step</span><h1 className="display heading-md">Review the current terms.</h1><p className="copy">Accept the current Terms of Service and acknowledge the Privacy Notice to continue using the web dashboard. Your privacy controls remain available after acceptance.</p><div className="button-row"><Link className="button button-secondary" href="/terms" target="_blank">Read Terms</Link><Link className="button button-secondary" href="/privacy" target="_blank">Read Privacy Notice</Link><button className="button button-primary" disabled={pending} onClick={async () => { setPending(true); setError(null); try { await acceptTerms(); } catch (caught) { setError(caught instanceof Error ? caught.message : "We could not save your acceptance."); } finally { setPending(false); } }}>{pending ? "Saving…" : "Accept & continue"}</button></div>{error && <p className="form-error">{error}</p>}</div></div></main>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, loading, legalState, signOut } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!menuOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    firstLinkRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  if (loading) return <div className="app-loading">Preparing your dashboard…</div>;
  if (!user) return <main className="app-loading"><div className="panel signed-out"><Brand /><h1 className="display heading-md">Sign in to open your dashboard.</h1><p className="copy">Your browser library, account controls, social features, and cloud restore are tied to your account.</p><div className="button-row"><Link className="button button-primary" href="/auth/sign-in">Sign in</Link><Link className="button button-secondary" href="/">Back to site</Link></div></div></main>;

  const closeMenu = () => setMenuOpen(false);
  const menuTransition = reduceMotion ? { duration: 0 } : { duration: 0.2, ease: [0.16, 1, 0.3, 1] as const };

  return <div className="app-layout"><header className={`app-header${menuOpen ? " navigation-open" : ""}`}><div className="container app-header-inner"><Brand /><nav className="app-nav desktop-app-nav" aria-label="Dashboard navigation">{navigation.map(([href, label]) => <Link key={href} href={href} data-active={pathname === href} aria-current={pathname === href ? "page" : undefined}>{label}</Link>)}</nav><button className="button button-secondary button-small desktop-sign-out" onClick={() => void signOut()}>Sign out</button><button ref={menuButtonRef} type="button" className="mobile-nav-trigger app-mobile-nav-trigger" aria-expanded={menuOpen} aria-controls="app-mobile-navigation" aria-label={menuOpen ? "Close dashboard navigation" : "Open dashboard navigation"} onClick={() => setMenuOpen((current) => !current)}><span aria-hidden="true" className="mobile-nav-icon"><i /><i /><i /></span></button></div></header><AnimatePresence>{menuOpen ? <><motion.button type="button" className="mobile-nav-scrim app-mobile-nav-scrim" aria-label="Close dashboard navigation" onClick={closeMenu} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={menuTransition} /><motion.nav id="app-mobile-navigation" className="mobile-nav-panel app-mobile-nav-panel" aria-label="Dashboard navigation" initial={reduceMotion ? false : { opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -12 }} transition={menuTransition}><p className="mobile-nav-label">Your dashboard</p><ul>{navigation.map(([href, label], index) => <li key={href}><Link ref={index === 0 ? firstLinkRef : undefined} href={href} data-active={pathname === href} aria-current={pathname === href ? "page" : undefined} onClick={closeMenu}>{label}</Link></li>)}</ul><button className="button button-secondary mobile-sign-out" onClick={() => { closeMenu(); void signOut(); }}>Sign out</button></motion.nav></> : null}</AnimatePresence>{legalState === "missing" ? <LegalGate /> : <main id="main-content" className="app-main">{children}</main>}</div>;
}
