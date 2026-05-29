import SwiftUI
import WidgetKit

@main
struct V3l0cityDriveWidgetBundle: WidgetBundle {
  var body: some Widget {
    V3l0cityDriveWidget()
    if #available(iOSApplicationExtension 16.2, *) {
      V3l0cityTripLiveActivityWidget()
    }
  }
}
