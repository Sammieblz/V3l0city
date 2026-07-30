"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { Speedometer } from "@/components/shared/speedometer";
import { NativeDownloads } from "@/components/marketing/native-downloads";

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    const hero = ref.current;
    if (!hero || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !window.matchMedia("(pointer: fine)").matches) return;
    let frame = 0;
    const onPointerMove = (event: PointerEvent) => {
      const rect = hero.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - .5;
      const y = (event.clientY - rect.top) / rect.height - .5;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        hero.style.setProperty("--parallax-x", `${x * 12}px`);
        hero.style.setProperty("--parallax-y", `${y * 10}px`);
      });
    };
    const reset = () => { hero.style.setProperty("--parallax-x", "0px"); hero.style.setProperty("--parallax-y", "0px"); };
    hero.addEventListener("pointermove", onPointerMove);
    hero.addEventListener("pointerleave", reset);
    return () => { cancelAnimationFrame(frame); hero.removeEventListener("pointermove", onPointerMove); hero.removeEventListener("pointerleave", reset); };
  }, []);

  return (
    <section className="hero" ref={ref}>
      <div className="hero-grid" aria-hidden="true" />
      <div className="hero-orbit hero-orbit-one" aria-hidden="true" />
      <div className="hero-orbit hero-orbit-two" aria-hidden="true" />
      <div className="container hero-content">
        <motion.div
          className="hero-copy"
          initial={reduceMotion ? false : { opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.58, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className="eyebrow">Driving data, without the noise</span>
          <h1 className="display heading-xl">Keep the road <span className="accent">in focus.</span></h1>
          <p className="copy">V3l0city turns your own driving data into a calm, glanceable dashboard. Start manually on your phone, review your trips anywhere, and choose exactly what you share.</p>
          <div className="button-row">
            <Link className="button button-primary" href="/demo">Explore the live demo</Link>
            <Link className="button button-secondary" href="/how-it-works">How it works</Link>
          </div>
          <div className="hero-native-downloads">
            <span>Want the full native experience?</span>
            <NativeDownloads compact />
          </div>
          <p className="hero-fineprint">Browser recording is foreground-only. Keep your phone open and unlocked while recording.</p>
        </motion.div>
        <motion.div
          className="hero-instrument"
          aria-label="Illustration of the V3l0city speedometer dashboard"
          initial={reduceMotion ? false : { opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.72, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="instrument-glow" aria-hidden="true" />
          <div className="hero-native-dashboard">
            <Speedometer speed={47} label="Native dashboard preview" size={396} />
            <div className="native-speed-stats" aria-label="Example trip statistics">
              <div><span>AVG</span><strong>34</strong><small>MPH</small></div>
              <div><span>MAX</span><strong>58</strong><small>MPH</small></div>
              <div><span>DIST</span><strong>12.4</strong><small>MI</small></div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
