"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useApp } from "@/components/app/app-provider";
import { getTripsWithSamples } from "@/lib/database";
import { distanceLabel, durationLabel, speedLabel } from "@/lib/format";
import { restoreCloudTrips, syncPendingTrips } from "@/lib/sync";
import { tripInsights } from "@/lib/trip/math";
import type { TripWithSamples } from "@/lib/types";

export function Dashboard() {
  const { user, profile } = useApp();
  const [trips, setTrips] = useState<TripWithSamples[]>([]);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const refresh = async () => { if (user) setTrips(await getTripsWithSamples(user.id)); };
  useEffect(() => {
    if (!user) return;
    let active = true;
    void getTripsWithSamples(user.id).then((items) => { if (active) setTrips(items); });
    return () => { active = false; };
  }, [user]);
  const insights = tripInsights(trips);
  async function sync() { if (!user) return; setSyncing(true); setSyncMessage(null); try { const sent = await syncPendingTrips(user.id); const restored = await restoreCloudTrips(user.id); await refresh(); setSyncMessage(`${sent ? `${sent} trip${sent === 1 ? "" : "s"} synced` : "No pending trips"}${restored ? ` · ${restored} restored` : ""}.`); } catch (caught) { setSyncMessage(caught instanceof Error ? caught.message : "Sync needs another try."); } finally { setSyncing(false); } }
  return <div className="container"><div className="page-heading"><div><span className="eyebrow">Your trip library</span><h1 className="display heading-lg">A quieter view of the drive.</h1><p className="copy">Desktop is intentionally read-only for driving data. Use a supported mobile browser for manual, foreground-only recording.</p></div><div className="sync-box"><span>{profile?.syncEnabled ? "Cloud backup on" : "Cloud backup off"}</span>{profile?.syncEnabled ? <button className="button button-secondary button-small" disabled={syncing} onClick={() => void sync()}>{syncing ? "Syncing…" : "Restore & sync"}</button> : <Link className="button button-secondary button-small" href="/account">Manage backup</Link>}</div></div>{syncMessage && <div className="notice notice-info"><span>i</span><div>{syncMessage}</div></div>}<div className="grid three-col dashboard-stats"><div className="panel stat-card"><div className="stat-label">Total distance</div><div className="stat-value">{distanceLabel(insights.totalDistanceMeters)}</div><div className="stat-meta">From this browser library</div></div><div className="panel stat-card"><div className="stat-label">Trips</div><div className="stat-value">{insights.tripCount}</div><div className="stat-meta">Completed manual records</div></div><div className="panel stat-card"><div className="stat-label">Average</div><div className="stat-value">{speedLabel(insights.averageSpeedMps)}</div><div className="stat-meta">{durationLabel(insights.totalDurationMs)} total drive time</div></div></div><section className="dashboard-section"><div className="section-title"><div><h2 className="display heading-md">Recent trips</h2><p>Stored locally in this browser, with cloud status shown below.</p></div><Link href="/history">View full history →</Link></div>{trips.length ? <div className="list">{trips.slice(0, 5).map((trip) => <div className="list-row" key={trip.id}><div><div className="list-row-title">{new Date(trip.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</div><div className="list-row-meta">{durationLabel(new Date(trip.endedAt).getTime() - new Date(trip.startedAt).getTime())} · {trip.syncStatus === "synced" ? "Cloud synced" : "Stored locally"}</div></div><strong className="trip-distance">{distanceLabel(trip.totalDistanceMeters, trip.units)}</strong></div>)}</div> : <div className="empty-state panel"><h3 className="display">No trips in this browser yet.</h3><p>On a phone, use Drive to manually start a foreground-only trip. Or turn on cloud backup and restore an existing library.</p><Link className="button button-primary" href="/drive">Open Drive</Link></div>}</section></div>;
}
