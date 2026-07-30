"use client";

import { useEffect, useRef, useState } from "react";

import { useApp } from "@/components/app/app-provider";
import { Speedometer } from "@/components/shared/speedometer";
import { saveTripWithSamples } from "@/lib/database";
import { canRecordInMobileBrowser } from "@/lib/drive-capability";
import { distanceLabel, durationLabel } from "@/lib/format";
import { derivedSpeed, distanceBetween, type Coordinate } from "@/lib/trip/math";
import { syncPendingTrips } from "@/lib/sync";
import type { SpeedSample, WebTrip } from "@/lib/types";

type RecordingState = "ready" | "requesting" | "recording" | "stopping" | "error";
type LiveData = { speedMps: number; distanceMeters: number; elapsedMs: number; accuracy: number | null };

function quality(accuracy: number | null) {
  if (accuracy === null) return { value: "poor" as const, score: .2, reasons: ["No GPS accuracy reported"] };
  if (accuracy <= 18) return { value: "good" as const, score: .92, reasons: [] };
  if (accuracy <= 45) return { value: "fair" as const, score: .62, reasons: ["GPS accuracy is moderate"] };
  return { value: "poor" as const, score: .25, reasons: ["GPS accuracy is low"] };
}

export function DriveDashboard() {
  const { user, profile } = useApp();
  const [capable, setCapable] = useState<boolean | null>(null);
  const [state, setState] = useState<RecordingState>("ready");
  const [error, setError] = useState<string | null>(null);
  const [pageInterrupted, setPageInterrupted] = useState(false);
  const [live, setLive] = useState<LiveData>({ speedMps: 0, distanceMeters: 0, elapsedMs: 0, accuracy: null });
  const watchId = useRef<number | null>(null);
  const startedAt = useRef<Date | null>(null);
  const tripId = useRef<string | null>(null);
  const lastCoordinate = useRef<Coordinate | null>(null);
  const samples = useRef<SpeedSample[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const update = () => {
      setCapable(canRecordInMobileBrowser({ secureContext: window.isSecureContext, geolocationAvailable: "geolocation" in navigator, finePointer: window.matchMedia("(pointer: fine)").matches, viewportWidth: window.innerWidth }));
    };
    update(); window.addEventListener("resize", update); return () => window.removeEventListener("resize", update);
  }, []);
  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState !== "visible" && state === "recording") setPageInterrupted(true); };
    document.addEventListener("visibilitychange", onVisibility); return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [state]);
  useEffect(() => () => { if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current); if (timer.current) clearInterval(timer.current); }, []);

  const cleanup = () => { if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current); watchId.current = null; if (timer.current) clearInterval(timer.current); timer.current = null; };

  const start = () => {
    if (!user || !capable || state !== "ready") return;
    setError(null); setPageInterrupted(false); setState("requesting");
    const id = crypto.randomUUID(); tripId.current = id; startedAt.current = new Date(); lastCoordinate.current = null; samples.current = []; setLive({ speedMps: 0, distanceMeters: 0, elapsedMs: 0, accuracy: null });
    navigator.geolocation.getCurrentPosition(() => {
      setState("recording");
      timer.current = setInterval(() => { if (startedAt.current) setLive((current) => ({ ...current, elapsedMs: Date.now() - startedAt.current!.getTime() })); }, 1000);
      watchId.current = navigator.geolocation.watchPosition((position) => {
        const now = position.timestamp || Date.now();
        const next: Coordinate = { latitude: position.coords.latitude, longitude: position.coords.longitude, timestamp: now };
        const previous = lastCoordinate.current;
        const accuracy = Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null;
        const distance = previous && (!accuracy || accuracy <= 75) ? Math.min(500, distanceBetween(previous, next)) : 0;
        const speedMps = derivedSpeed(previous, next, position.coords.speed);
        const totalDistanceMeters = (samples.current.at(-1)?.distanceMeters ?? 0) + distance;
        const q = quality(accuracy);
        const elapsedMs = startedAt.current ? now - startedAt.current.getTime() : 0;
        const sample: SpeedSample = { tripId: id, sequence: samples.current.length, recordedAt: new Date(now).toISOString(), elapsedMs, speedMps, distanceMeters: totalDistanceMeters, headingDegrees: Number.isFinite(position.coords.heading) ? position.coords.heading : null, headingSource: Number.isFinite(position.coords.heading) ? "gps" : "none", headingAccuracyDegrees: null, headingQuality: q.value, headingReasons: q.reasons, source: "browser-geolocation", quality: q.value, qualityScore: q.score, qualityReasons: q.reasons, gpsAccuracyMeters: accuracy, fixAgeMs: 0, nativeSpeedUsed: false, isMoving: speedMps > .5, isStopped: speedMps <= .5, stale: false };
        samples.current.push(sample); lastCoordinate.current = next; setLive({ speedMps, distanceMeters: totalDistanceMeters, elapsedMs, accuracy });
      }, (positionError) => { setError(positionError.message || "Location access stopped. Stop this trip once it is safe."); setPageInterrupted(true); }, { enableHighAccuracy: true, maximumAge: 2_000, timeout: 15_000 });
    }, (positionError) => { setError(positionError.message || "Location permission is required to start a trip."); setState("error"); cleanup(); }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 });
  };

  const stop = async () => {
    if (!user || !startedAt.current || !tripId.current || state !== "recording") return;
    setState("stopping"); cleanup();
    const endedAt = new Date(); const recordedSamples = samples.current; const distanceMeters = recordedSamples.at(-1)?.distanceMeters ?? 0;
    const durationSeconds = Math.max(1, (endedAt.getTime() - startedAt.current.getTime()) / 1000);
    const trip: WebTrip = { id: tripId.current, userId: user.id, startedAt: startedAt.current.toISOString(), endedAt: endedAt.toISOString(), totalDistanceMeters: distanceMeters, maxSpeedMps: Math.max(0, ...recordedSamples.map((sample) => sample.speedMps)), averageSpeedMps: distanceMeters / durationSeconds, units: "MPH", mountLabel: null, recordStatus: "completed", localUpdatedAt: endedAt.toISOString(), deletedAt: null, cloudSyncedAt: null, cloudSyncError: null, syncStatus: "pending" };
    try { await saveTripWithSamples(trip, recordedSamples); if (profile?.syncEnabled) await syncPendingTrips(user.id); setState("ready"); setLive({ speedMps: 0, distanceMeters: 0, elapsedMs: 0, accuracy: null }); setPageInterrupted(false); } catch (caught) { setError(caught instanceof Error ? caught.message : "Your trip was saved locally but cloud sync needs another try."); setState("ready"); }
  };

  if (capable === null) return <div className="container"><div className="empty-state panel">Checking whether this browser can record safely…</div></div>;
  if (!capable) return <div className="container"><div className="page-heading"><div><span className="eyebrow">Read-only on desktop</span><h1 className="display heading-lg">Drive stays on your phone.</h1><p className="copy">V3l0city never exposes Start or Stop controls in desktop browsers. Open this page on a compatible mobile browser to manually record a foreground-only trip.</p></div></div><div className="notice"><span>!</span><div><strong>Mobile browser limitation:</strong> the page must stay open, visible, and unlocked during a recording. V3l0city cannot track in the background or after the device locks.</div></div></div>;
  return <div className="container"><div className="page-heading"><div><span className="eyebrow">Mobile recording only</span><h1 className="display heading-lg">Start intentionally. Stop intentionally.</h1><p className="copy">No auto-start, background tracking, widgets, native push setup, mount prompts, or driving-screen social features are available on web.</p></div></div><div className="notice"><span>!</span><div><strong>Keep this page open, visible, and unlocked.</strong> Browser tracking may stop or become unreliable when the page is backgrounded or the device locks. Do not interact with this dashboard while driving.</div></div>{pageInterrupted && <div className="notice notice-danger drive-interrupted"><span>!</span><div><strong>Recording may contain a gap.</strong> This page was hidden or interrupted. Pull over safely before reviewing or stopping the trip.</div></div>}{error && <div className="notice notice-danger drive-interrupted"><span>!</span><div>{error}</div></div>}<section className="drive-surface panel"><Speedometer speed={live.speedMps * 2.236936} label={state === "recording" ? "MANUAL TRIP" : "READY"} active={state === "recording"} size={510} /><div className="drive-readouts"><div><span>Distance</span><strong>{distanceLabel(live.distanceMeters)}</strong></div><div><span>Elapsed</span><strong>{durationLabel(live.elapsedMs)}</strong></div><div><span>GPS</span><strong>{live.accuracy ? `±${Math.round(live.accuracy)}m` : "Waiting"}</strong></div></div><div className="drive-controls">{state === "recording" ? <button className="button button-danger" onClick={() => void stop()}>Stop & save trip</button> : <button className="button button-primary" disabled={state === "requesting" || state === "stopping"} onClick={start}>{state === "requesting" ? "Requesting location…" : state === "stopping" ? "Saving…" : "Start manual trip"}</button>}<p>{state === "recording" ? "Recording is active. Do not touch the page while the vehicle is moving." : "Starting requests your browser location only after you select this button."}</p></div></section></div>;
}
