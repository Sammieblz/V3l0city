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
      averageSpeedText: "0",
      maxSpeedMps: 0,
      maxSpeedText: "0",
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
      updatedAtMs: Date().timeIntervalSince1970 * 1000.0,
      simulationActive: false
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
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
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
  @Environment(\.widgetFamily) private var family
  let snapshot: V3l0cityDriveSurfaceSnapshot?

  var body: some View {
    let usableSnapshot = snapshot
    let isStale = usableSnapshot == nil

    switch family {
    case .systemLarge:
      largeView(usableSnapshot, isStale: isStale)
    case .systemMedium:
      mediumView(usableSnapshot, isStale: isStale)
    default:
      smallView(usableSnapshot, isStale: isStale)
    }
  }

  private func smallView(_ snapshot: V3l0cityDriveSurfaceSnapshot?, isStale: Bool) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      header(snapshot, isStale: isStale)

      Spacer(minLength: 2)

      HStack(alignment: .firstTextBaseline, spacing: 5) {
        Text(snapshot?.speedText ?? "--")
          .font(.system(size: 44, weight: .semibold, design: .rounded))
          .monospacedDigit()
          .foregroundStyle(Color.white)
          .lineLimit(1)
          .minimumScaleFactor(0.55)
        Text(snapshot?.units ?? "")
          .font(.system(size: 13, weight: .medium, design: .rounded))
          .foregroundStyle(Color.white.opacity(0.58))
      }

      HStack(spacing: 10) {
        metric(label: "DIST", value: snapshot?.distanceText ?? "--")
        metric(label: "TIME", value: snapshot?.elapsedText ?? "--")
      }

      Text(widgetStatus(snapshot, isStale: isStale))
        .font(.system(size: 11, weight: .medium, design: .rounded))
        .foregroundStyle(isStale ? Color.yellow : Color(red: 0.0, green: 0.9, blue: 1.0))
        .lineLimit(1)
    }
    .padding(14)
  }

  private func mediumView(_ snapshot: V3l0cityDriveSurfaceSnapshot?, isStale: Bool) -> some View {
    HStack(spacing: 16) {
      VStack(alignment: .leading, spacing: 8) {
        header(snapshot, isStale: isStale)
        Spacer(minLength: 0)
        HStack(alignment: .firstTextBaseline, spacing: 5) {
          Text(snapshot?.speedText ?? "--")
            .font(.system(size: 50, weight: .semibold, design: .rounded))
            .monospacedDigit()
            .foregroundStyle(Color.white)
            .minimumScaleFactor(0.55)
          Text(snapshot?.units ?? "")
            .font(.system(size: 13, weight: .medium, design: .rounded))
            .foregroundStyle(Color.white.opacity(0.58))
        }
        HStack(spacing: 14) {
          metric(label: "DIST", value: snapshot?.distanceText ?? "--")
          metric(label: "MAX", value: "\(snapshot?.maxSpeedText ?? "--") \(snapshot?.units ?? "")")
        }
      }
      Spacer()
      compass(snapshot?.headingDegrees, headingText: snapshot?.headingText ?? "--", size: 72, dimmed: isStale)
    }
    .padding(14)
  }

  private func largeView(_ snapshot: V3l0cityDriveSurfaceSnapshot?, isStale: Bool) -> some View {
    VStack(spacing: 14) {
      header(snapshot, isStale: isStale)
      speedDial(snapshot, isStale: isStale)
      HStack(spacing: 14) {
        metric(label: "AVG", value: "\(snapshot?.averageSpeedText ?? "--") \(snapshot?.units ?? "")")
        metric(label: "MAX", value: "\(snapshot?.maxSpeedText ?? "--") \(snapshot?.units ?? "")")
        metric(label: "DIST", value: snapshot?.distanceText ?? "--")
      }
      HStack {
        compass(snapshot?.headingDegrees, headingText: snapshot?.headingText ?? "--", size: 82, dimmed: isStale)
        VStack(alignment: .leading, spacing: 4) {
          metric(label: "TIME", value: snapshot?.elapsedText ?? "--")
          Text(widgetStatus(snapshot, isStale: isStale))
            .font(.system(size: 12, weight: .semibold, design: .rounded))
            .foregroundStyle(isStale ? Color.yellow : Color(red: 0.0, green: 0.9, blue: 1.0))
            .lineLimit(2)
        }
        Spacer()
      }
    }
    .padding(16)
  }

  private func header(_ snapshot: V3l0cityDriveSurfaceSnapshot?, isStale: Bool) -> some View {
    HStack {
      Text("V3l0city")
        .font(.system(size: 13, weight: .semibold, design: .rounded))
        .foregroundStyle(Color.white.opacity(0.9))
      Spacer()
      Circle()
        .fill(isStale ? Color.yellow : signalColor(snapshot?.signalQuality))
        .frame(width: 8, height: 8)
    }
  }

  private func widgetStatus(_ snapshot: V3l0cityDriveSurfaceSnapshot?, isStale: Bool) -> String {
    if isStale {
      return "Open V3l0city to start tracking"
    }
    if snapshot?.tripActive == true {
      return "Latest state • use Live Activity"
    }
    return snapshot?.signalText ?? "Ready"
  }

  private func speedDial(_ snapshot: V3l0cityDriveSurfaceSnapshot?, isStale: Bool) -> some View {
    ZStack {
      Circle()
        .trim(from: 0.10, to: 0.90)
        .stroke(Color.white.opacity(0.12), style: StrokeStyle(lineWidth: 8, lineCap: .round))
        .rotationEffect(.degrees(90))
      Circle()
        .trim(from: 0.10, to: min(0.90, 0.10 + CGFloat((snapshot?.speedMps ?? 0) / 45.0) * 0.80))
        .stroke(isStale ? Color.yellow : Color(red: 0.0, green: 0.9, blue: 1.0), style: StrokeStyle(lineWidth: 8, lineCap: .round))
        .rotationEffect(.degrees(90))
      VStack(spacing: 0) {
        Text(snapshot?.speedText ?? "--")
          .font(.system(size: 54, weight: .semibold, design: .rounded))
          .monospacedDigit()
          .foregroundStyle(Color.white)
          .minimumScaleFactor(0.55)
        Text(snapshot?.units ?? "")
          .font(.system(size: 13, weight: .medium, design: .rounded))
          .foregroundStyle(Color.white.opacity(0.55))
      }
    }
    .frame(height: 138)
  }

  private func compass(_ heading: Double?, headingText: String, size: CGFloat, dimmed: Bool) -> some View {
    ZStack {
      Circle()
        .stroke(Color.white.opacity(dimmed ? 0.08 : 0.16), lineWidth: 1)
      ForEach(0..<24) { tick in
        Rectangle()
          .fill(Color.white.opacity(tick % 6 == 0 ? 0.45 : 0.18))
          .frame(width: 1, height: tick % 6 == 0 ? 8 : 4)
          .offset(y: -size / 2 + 7)
          .rotationEffect(.degrees(Double(tick) * 15.0 - (heading ?? 0)))
      }
      Image(systemName: "location.north.fill")
        .font(.system(size: size * 0.34, weight: .bold))
        .foregroundStyle(dimmed ? Color.white.opacity(0.35) : Color(red: 0.0, green: 0.9, blue: 1.0))
      VStack {
        Text("N")
          .font(.system(size: 10, weight: .bold, design: .rounded))
          .foregroundStyle(Color.red)
        Spacer()
      }
      Text(headingText)
        .font(.system(size: 10, weight: .semibold, design: .rounded))
        .foregroundStyle(Color.white.opacity(0.65))
        .offset(y: size / 2 + 8)
    }
    .frame(width: size, height: size)
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
