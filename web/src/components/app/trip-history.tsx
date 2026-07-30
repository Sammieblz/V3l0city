"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/app/app-provider";
import { getTripsWithSamples } from "@/lib/database";
import { dateLabel, distanceLabel, durationLabel, speedLabel } from "@/lib/format";
import type { TripWithSamples } from "@/lib/types";

export function TripHistory() {
  const { user } = useApp();
  const [trips, setTrips] = useState<TripWithSamples[]>([]);
  useEffect(() => { if (user) void getTripsWithSamples(user.id).then(setTrips); }, [user]);
  return <div className="container"><div className="page-heading"><div><span className="eyebrow">Browser library</span><h1 className="display heading-lg">Trip history.</h1><p className="copy">A read-only review of completed manual trips in this browser. Exact route coordinates are not persisted.</p></div></div>{trips.length ? <div className="table-wrap"><table><thead><tr><th>Date</th><th>Distance</th><th>Average</th><th>Maximum</th><th>Duration</th><th>Storage</th></tr></thead><tbody>{trips.map((trip) => <tr key={trip.id}><td>{dateLabel(trip.startedAt)}</td><td>{distanceLabel(trip.totalDistanceMeters, trip.units)}</td><td>{speedLabel(trip.averageSpeedMps, trip.units)}</td><td>{speedLabel(trip.maxSpeedMps, trip.units)}</td><td>{durationLabel(new Date(trip.endedAt).getTime() - new Date(trip.startedAt).getTime())}</td><td>{trip.syncStatus === "synced" ? "Cloud synced" : trip.syncStatus === "failed" ? "Sync retry needed" : "Local"}</td></tr>)}</tbody></table></div> : <div className="empty-state panel"><h2 className="display heading-md">No completed trips here yet.</h2><p>Cloud restore brings in a saved account library; new trips are manually recorded on a compatible mobile browser.</p></div>}</div>;
}
