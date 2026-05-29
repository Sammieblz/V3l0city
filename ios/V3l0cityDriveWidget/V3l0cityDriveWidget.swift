import SwiftUI
import WidgetKit

#if canImport(ActivityKit)
import ActivityKit
#endif

struct V3l0cityDriveEntry: TimelineEntry {
  let date: Date
  let snapshot: V3l0cityDriveSurfaceSnapshot?
}

struct V3l0cityDriveProvider: TimelineProvider {
  func placeholder(in context: Context) -> V3l0cityDriveEntry {
    V3l0cityDriveEntry(date: Date(), snapshot: sampleSnapshot)
  }

  func getSnapshot(in context: Context, completion: @escaping (V3l0cityDriveEntry) -> Void) {
    completion(V3l0cityDriveEntry(date: Date(), snapshot: v3l0cityDriveSurfaceSnapshotFromDefaults() ?? sampleSnapshot))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<V3l0cityDriveEntry>) -> Void) {
    let entry = V3l0cityDriveEntry(date: Date(), snapshot: v3l0cityDriveSurfaceSnapshotFromDefaults())
    completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(300))))
  }

  private var sampleSnapshot: V3l0cityDriveSurfaceSnapshot {
    V3l0cityDriveSurfaceSnapshot(
      schemaVersion: 1,
      tripId: nil,
      tripActive: false,
      tripPaused: false,
      speedMps: 0,
      speedText: "0",
      units: "MPH",
      distanceMeters: 0,
      distanceText: "0.0 mi",
      averageSpeedMps: 0,
      maxSpeedMps: 0,
      elapsedMs: 0,
      elapsedText: "00:00:00",
      headingDegrees: nil,
      headingText: "--",
      headingSource: "none",
      headingQuality: "poor",
      signalQuality: "medium",
      signalText: "Ready",
      stale: false,
      permissionStatus: "ready",
      updatedAtMs: Date().timeIntervalSince1970 * 1000.0
    )
  }
}

struct V3l0cityDriveWidget: Widget {
  let kind = "V3l0cityDriveWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: V3l0cityDriveProvider()) { entry in
      V3l0cityDriveWidgetView(snapshot: entry.snapshot)
        .v3l0cityWidgetBackground()
    }
    .configurationDisplayName("V3l0city")
    .description("Glance at your current speed and active trip.")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}

extension View {
  @ViewBuilder
  func v3l0cityWidgetBackground() -> some View {
    if #available(iOSApplicationExtension 17.0, *) {
      self.containerBackground(Color(red: 0.06, green: 0.07, blue: 0.08), for: .widget)
    } else {
      self.background(Color(red: 0.06, green: 0.07, blue: 0.08))
    }
  }
}

struct V3l0cityDriveWidgetView: View {
  let snapshot: V3l0cityDriveSurfaceSnapshot?

  var body: some View {
    let usableSnapshot = snapshot
    let isStale = usableSnapshot == nil

    VStack(alignment: .leading, spacing: 8) {
      HStack {
        Text("V3l0city")
          .font(.system(size: 13, weight: .semibold, design: .rounded))
          .foregroundStyle(Color.white.opacity(0.9))
        Spacer()
        Circle()
          .fill(isStale ? Color.yellow : signalColor(usableSnapshot?.signalQuality))
          .frame(width: 8, height: 8)
      }

      Spacer(minLength: 2)

      HStack(alignment: .firstTextBaseline, spacing: 5) {
        Text(usableSnapshot?.speedText ?? "--")
          .font(.system(size: 44, weight: .semibold, design: .rounded))
          .monospacedDigit()
          .foregroundStyle(Color.white)
          .lineLimit(1)
          .minimumScaleFactor(0.55)
        Text(usableSnapshot?.units ?? "")
          .font(.system(size: 13, weight: .medium, design: .rounded))
          .foregroundStyle(Color.white.opacity(0.58))
      }

      HStack(spacing: 10) {
        metric(label: "DIST", value: usableSnapshot?.distanceText ?? "--")
        metric(label: "TIME", value: usableSnapshot?.elapsedText ?? "--")
      }

      Text(isStale ? "Open app to start" : (usableSnapshot?.signalText ?? "Ready"))
        .font(.system(size: 11, weight: .medium, design: .rounded))
        .foregroundStyle(isStale ? Color.yellow : Color(red: 0.0, green: 0.9, blue: 1.0))
        .lineLimit(1)
    }
    .padding(14)
  }

  private func metric(label: String, value: String) -> some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(label)
        .font(.system(size: 9, weight: .bold, design: .rounded))
        .foregroundStyle(Color.white.opacity(0.4))
      Text(value)
        .font(.system(size: 13, weight: .semibold, design: .rounded))
        .foregroundStyle(Color.white.opacity(0.9))
        .lineLimit(1)
        .minimumScaleFactor(0.7)
    }
  }

  private func signalColor(_ quality: String?) -> Color {
    switch quality {
    case "good":
      return Color(red: 0.0, green: 0.9, blue: 1.0)
    case "medium":
      return Color.yellow
    default:
      return Color(red: 1.0, green: 0.3, blue: 0.42)
    }
  }
}

#if canImport(ActivityKit)
@available(iOSApplicationExtension 16.2, *)
struct V3l0cityTripLiveActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: V3l0cityTripActivityAttributes.self) { context in
      V3l0cityLiveActivityView(state: context.state)
        .activityBackgroundTint(Color(red: 0.06, green: 0.07, blue: 0.08))
        .activitySystemActionForegroundColor(Color(red: 0.0, green: 0.9, blue: 1.0))
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Text(context.state.speedText)
            .font(.system(size: 28, weight: .semibold, design: .rounded))
            .monospacedDigit()
        }
        DynamicIslandExpandedRegion(.trailing) {
          Text(context.state.units)
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        DynamicIslandExpandedRegion(.bottom) {
          HStack {
            Text(context.state.distanceText)
            Spacer()
            Text(context.state.elapsedText)
          }
          .font(.caption)
        }
      } compactLeading: {
        Text(context.state.speedText)
          .font(.caption2)
          .monospacedDigit()
      } compactTrailing: {
        Text(context.state.units.prefix(1))
          .font(.caption2)
      } minimal: {
        Image(systemName: "speedometer")
      }
    }
  }
}

@available(iOSApplicationExtension 16.2, *)
struct V3l0cityLiveActivityView: View {
  let state: V3l0cityTripActivityAttributes.ContentState

  var body: some View {
    HStack(spacing: 14) {
      VStack(alignment: .leading, spacing: 2) {
        Text("V3l0city")
          .font(.system(size: 12, weight: .semibold, design: .rounded))
          .foregroundStyle(Color.white.opacity(0.65))
        HStack(alignment: .firstTextBaseline, spacing: 5) {
          Text(state.speedText)
            .font(.system(size: 42, weight: .semibold, design: .rounded))
            .monospacedDigit()
            .foregroundStyle(Color.white)
          Text(state.units)
            .font(.system(size: 13, weight: .medium, design: .rounded))
            .foregroundStyle(Color.white.opacity(0.55))
        }
      }

      Spacer()

      VStack(alignment: .trailing, spacing: 5) {
        Text(state.distanceText)
        Text(state.elapsedText)
        Text(state.signalText)
          .foregroundStyle(state.isStale ? Color.yellow : Color(red: 0.0, green: 0.9, blue: 1.0))
      }
      .font(.system(size: 13, weight: .semibold, design: .rounded))
      .foregroundStyle(Color.white.opacity(0.86))
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 12)
  }
}
#endif
