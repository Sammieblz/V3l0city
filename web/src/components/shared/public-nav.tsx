"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Brand } from "@/components/shared/brand";
import { MarketingThemeToggle } from "@/components/shared/marketing-theme-toggle";

const navigation = [
  ["/how-it-works", "How it works"],
  ["/demo", "Product demo"],
  ["/safety", "Safety"],
] as const;

type PublicNavProps = {
  showThemeToggle?: boolean;
};

export function PublicNav({ showThemeToggle = false }: PublicNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      menuButtonRef.current?.focus();
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    firstLinkRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const close = () => setOpen(false);
  const menuTransition = reduceMotion ? { duration: 0 } : { duration: 0.2, ease: [0.16, 1, 0.3, 1] as const };

  return (
    <div className={`nav-wrap${open ? " navigation-open" : ""}`}>
      <nav className="top-nav container" aria-label="Main navigation">
        <Brand />
        <div className="nav-links desktop-nav-links">
          {navigation.map(([href, label]) => <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}>{label}</Link>)}
        </div>
        <div className="nav-actions desktop-nav-actions">
          {showThemeToggle ? <MarketingThemeToggle /> : null}
          <Link className="button button-secondary button-small" href="/auth/sign-in">Sign in</Link>
          <Link className="button button-primary button-small" href="/auth/sign-up">Create account</Link>
        </div>
        <button
          ref={menuButtonRef}
          type="button"
          className="mobile-nav-trigger"
          aria-expanded={open}
          aria-controls="mobile-navigation"
          aria-label={open ? "Close navigation" : "Open navigation"}
          onClick={() => setOpen((current) => !current)}
        >
          <span aria-hidden="true" className="mobile-nav-icon"><i /><i /><i /></span>
        </button>
      </nav>
      <AnimatePresence>
        {open ? <>
          <motion.button
            type="button"
            className="mobile-nav-scrim"
            aria-label="Close navigation"
            onClick={close}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={menuTransition}
          />
          <motion.nav
            id="mobile-navigation"
            className="mobile-nav-panel"
            aria-label="Mobile navigation"
            initial={reduceMotion ? false : { opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -12 }}
            transition={menuTransition}
          >
            <p className="mobile-nav-label">Explore V3l0city</p>
            <ul>
              {navigation.map(([href, label], index) => (
                <li key={href}>
                  <Link ref={index === 0 ? firstLinkRef : undefined} href={href} aria-current={pathname === href ? "page" : undefined} onClick={close}>{label}</Link>
                </li>
              ))}
            </ul>
            {showThemeToggle ? <div className="mobile-nav-theme"><span>Appearance</span><MarketingThemeToggle /></div> : null}
            <div className="mobile-nav-actions">
              <Link className="button button-secondary" href="/auth/sign-in" onClick={close}>Sign in</Link>
              <Link className="button button-primary" href="/auth/sign-up" onClick={close}>Create account</Link>
            </div>
          </motion.nav>
        </> : null}
      </AnimatePresence>
    </div>
  );
}
