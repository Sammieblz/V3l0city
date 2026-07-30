"use client";

import { useEffect, useRef, useState } from "react";

import { Speedometer } from "@/components/shared/speedometer";

const sequence = [0, 8, 19, 32, 47, 55, 49, 39, 27, 16, 0];

export function DemoSimulator() {
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!running) return;
    timer.current = setInterval(() => setStep((current) => (current + 1) % sequence.length), 900);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [running]);
  const speed = sequence[step];
  return (
    <div className="simulator panel">
      <div className="simulator-gauge"><Speedometer speed={speed} label="DEMO ONLY" size={410} active={running} /></div>
      <div className="simulator-details">
        <span className="eyebrow">Interactive simulator</span>
        <h2 className="display heading-md">A deliberate interface for the moments you can safely glance.</h2>
        <p className="copy">This simulated drive never requests location and sends no trip data. It demonstrates the calm visual hierarchy of the browser dashboard.</p>
        <dl className="demo-readouts"><div><dt>Distance</dt><dd>{(2.8 + step * .14).toFixed(1)} <small>MI</small></dd></div><div><dt>Drive time</dt><dd>08<small>:42</small></dd></div><div><dt>Trip mode</dt><dd>{running ? "ACTIVE" : "READY"}</dd></div></dl>
        <div className="button-row"><button className="button button-primary" onClick={() => setRunning((value) => !value)}>{running ? "Pause simulation" : "Start simulation"}</button><button className="button button-secondary" onClick={() => { setRunning(false); setStep(0); }}>Reset</button></div>
        <p className="simulator-note">The real mobile browser dashboard requires you to manually Start and Stop each trip, and to keep the page open, visible, and unlocked.</p>
      </div>
    </div>
  );
}
