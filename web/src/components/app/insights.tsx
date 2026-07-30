"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/app/app-provider";
import { getTripsWithSamples } from "@/lib/database";
import { distanceLabel, durationLabel, speedLabel } from "@/lib/format";
import { tripInsights } from "@/lib/trip/math";
import type { TripWithSamples } from "@/lib/types";

export function Insights() {
  const { user } = useApp(); const [trips, setTrips] = useState<TripWithSamples[]>([]);
  useEffect(() => { if (user) void getTripsWithSamples(user.id).then(setTrips); }, [user]);
  const summary = useMemo(() => tripInsights(trips), [trips]);
  return <div className="container"><div className="page-heading"><div><span className="eyebrow">Review, not a score</span><h1 className="display heading-lg">Your driving insights.</h1><p className="copy">Personal trip summaries for review while parked. These figures are not safety ratings or a prompt to drive faster.</p></div></div><div className="grid three-col"><div className="panel stat-card"><div className="stat-label">Distance</div><div className="stat-value">{distanceLabel(summary.totalDistanceMeters)}</div><div className="stat-meta">Across {summary.tripCount} completed trips</div></div><div className="panel stat-card"><div className="stat-label">Average speed</div><div className="stat-value">{speedLabel(summary.averageSpeedMps)}</div><div className="stat-meta">Distance over recorded time</div></div><div className="panel stat-card"><div className="stat-label">Highest recorded</div><div className="stat-value">{speedLabel(summary.maxSpeedMps)}</div><div className="stat-meta">A trip statistic, not a target</div></div></div><section className="insight-note panel"><h2 className="display heading-md">What this does—and does not—say.</h2><p>V3l0city only summarizes data captured by the browser. Location availability, device hardware, browser suspension, and GPS accuracy can affect the record. Always follow speed limits and road conditions; your vehicle’s controls are authoritative.</p><span>{durationLabel(summary.totalDurationMs)} total recorded time</span></section></div>;
}
