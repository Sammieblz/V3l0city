import CarPlay
import Expo
import React
import ReactAppDependencyProvider

@UIApplicationMain
public class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?
  var launchOptions: [UIApplication.LaunchOptionsKey: Any]?

  var reactNativeDelegate: ExpoReactNativeFactoryDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    self.launchOptions = launchOptions
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory
    bindReactNativeFactory(factory)

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  public func application(
    _ application: UIApplication,
    configurationForConnecting connectingSceneSession: UISceneSession,
    options: UIScene.ConnectionOptions
  ) -> UISceneConfiguration {
    if connectingSceneSession.role.rawValue == "CPTemplateApplicationSceneSessionRoleApplication" {
      NSLog("[V3l0city][car] selecting CarPlay scene configuration")
      return UISceneConfiguration(
        name: "CarPlay Configuration",
        sessionRole: connectingSceneSession.role)
    }

    return UISceneConfiguration(
      name: "Default Configuration",
      sessionRole: connectingSceneSession.role)
  }

  // Linking API
  public override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)
  }

  // Universal Links
  public override func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    let result = RCTLinkingManager.application(application, continue: userActivity, restorationHandler: restorationHandler)
    return super.application(application, continue: userActivity, restorationHandler: restorationHandler) || result
  }
}

class PhoneSceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard
      let windowScene = scene as? UIWindowScene,
      let appDelegate = UIApplication.shared.delegate as? AppDelegate,
      let factory = appDelegate.reactNativeFactory
    else {
      return
    }

    let window = UIWindow(windowScene: windowScene)
    self.window = window
    appDelegate.window = window
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: appDelegate.launchOptions)
    NSLog("[V3l0city][phone] React Native phone root started")
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    URLContexts.forEach { context in
      _ = RCTLinkingManager.application(
        UIApplication.shared,
        open: context.url,
        options: [:])
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    _ = RCTLinkingManager.application(
      UIApplication.shared,
      continue: userActivity,
      restorationHandler: { _ in })
  }
}

private enum V3l0cityCarSurfaceMode {
  case fullscreen
  case template
  case mapExperimental

  static var current: V3l0cityCarSurfaceMode {
    let configured = (
      Bundle.main.object(forInfoDictionaryKey: "V3l0cityCarSurfaceMode") as? String
        ?? UserDefaults.standard.string(forKey: "V3l0cityCarSurfaceMode")
        ?? ""
    ).lowercased()

    switch configured {
    case "template":
      return .template
    case "map-experimental", "map":
      return .mapExperimental
    case "fullscreen":
      return .fullscreen
    default:
#if DEBUG
      return .fullscreen
#else
      if Bundle.main.object(forInfoDictionaryKey: "V3l0cityRichCarPlayEnabled") as? Bool == true {
        return .fullscreen
      }
      return .template
#endif
    }
  }
}

@available(iOS 14.0, *)
class CarSceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
  private weak var carWindow: CPWindow?
  private var dashboardController: V3l0cityCarDashboardViewController?
  private var informationTemplate: CPInformationTemplate?
  private var listTemplate: CPListTemplate?
  private var updateTimer: Timer?

  func templateApplicationScene(
    _ templateApplicationScene: CPTemplateApplicationScene,
    didConnect interfaceController: CPInterfaceController,
    to window: CPWindow
  ) {
    NSLog("[V3l0city][car] CarPlay scene connected")

    switch V3l0cityCarSurfaceMode.current {
    case .fullscreen:
      startFullscreenDashboard(interfaceController: interfaceController, window: window)
    case .template:
      startInformationTemplate(interfaceController: interfaceController)
    case .mapExperimental:
      NSLog("[V3l0city][car] map-experimental mode requested, but CPMapTemplate remains disabled because it crashes this simulator runtime")
      startFullscreenDashboard(interfaceController: interfaceController, window: window)
    }
  }

  func templateApplicationScene(
    _ templateApplicationScene: CPTemplateApplicationScene,
    didDisconnectInterfaceController interfaceController: CPInterfaceController,
    from window: CPWindow
  ) {
    NSLog("[V3l0city][car] CarPlay scene disconnected")
    stopTemplateUpdates()
    dashboardController = nil
    informationTemplate = nil
    listTemplate = nil
    carWindow = nil
    window.rootViewController = nil
  }

  private func startFullscreenDashboard(
    interfaceController: CPInterfaceController,
    window: CPWindow
  ) {
    stopTemplateUpdates()
    informationTemplate = nil
    listTemplate = nil

    let controller = V3l0cityCarDashboardViewController()
    controller.update(snapshot: V3l0cityCarSnapshot.current())
    carWindow = window
    dashboardController = controller
    window.rootViewController = controller

    guard window.rootViewController === controller else {
      NSLog("[V3l0city][car] fullscreen CPWindow dashboard was rejected; falling back to template")
      dashboardController = nil
      startRichListDashboard(interfaceController: interfaceController)
      return
    }

    NSLog("[V3l0city][car] fullscreen CPWindow dashboard ready")
    startTemplateUpdates()
  }

  private func startRichListDashboard(interfaceController: CPInterfaceController) {
    guard #available(iOS 26.4, *) else {
      startInformationTemplate(interfaceController: interfaceController)
      return
    }

    let snapshot = V3l0cityCarSnapshot.current()
    let rootTemplate = CPListTemplate(
      title: "V3l0city",
      listHeader: makeRichListHeader(snapshot: snapshot),
      sections: richListSections(snapshot: snapshot),
      assistantCellConfiguration: nil)
    listTemplate = rootTemplate

    interfaceController.setRootTemplate(rootTemplate, animated: false) { [weak self] _, error in
      if let error = error {
        NSLog("[V3l0city][car] failed to set rich list template: %@", error.localizedDescription)
        self?.listTemplate = nil
        self?.startInformationTemplate(interfaceController: interfaceController)
      } else {
        NSLog("[V3l0city][car] rich list dashboard template ready")
      }
    }
    startTemplateUpdates()
  }

  private func startInformationTemplate(interfaceController: CPInterfaceController) {
    dashboardController = nil
    let rootTemplate = makeInformationTemplate()
    informationTemplate = rootTemplate
    interfaceController.setRootTemplate(rootTemplate, animated: false) { _, error in
      if let error = error {
        NSLog("[V3l0city][car] failed to set information template: %@", error.localizedDescription)
      } else {
        NSLog("[V3l0city][car] information template ready")
      }
    }
    startTemplateUpdates()
  }

  private func makeInformationTemplate() -> CPInformationTemplate {
    CPInformationTemplate(
      title: "V3l0city",
      layout: .twoColumn,
      items: informationItems(),
      actions: [])
  }

  private func startTemplateUpdates() {
    stopTemplateUpdates()
    updateInformationTemplate()
    updateTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
      self?.updateInformationTemplate()
    }
    NSLog("[V3l0city][car] information template updates started")
  }

  private func stopTemplateUpdates() {
    updateTimer?.invalidate()
    updateTimer = nil
  }

  private func updateInformationTemplate() {
    let snapshot = V3l0cityCarSnapshot.current()
    dashboardController?.update(snapshot: snapshot)
    if #available(iOS 26.4, *) {
      listTemplate?.listHeader = makeRichListHeader(snapshot: snapshot)
      listTemplate?.updateSections(richListSections(snapshot: snapshot))
    }
    informationTemplate?.items = informationItems()
  }

  @available(iOS 26.4, *)
  private func makeRichListHeader(snapshot: V3l0cityCarSnapshot?) -> CPListTemplateDetailsHeader {
    let image = V3l0cityCarHeaderRenderer.render(snapshot: snapshot)
    let subtitle = snapshot == nil
      ? "Open V3l0city to start tracking"
      : "\(snapshot?.speedText ?? "--") \(snapshot?.units ?? "MPH") • \(snapshot?.signalText ?? "Ready")"
    let body = NSAttributedString(
      string: snapshot == nil
        ? "Speed, stats, compass, and signal mirror the phone dashboard during an active trip."
        : "AVG \(snapshot?.averageSpeedText ?? "--") • MAX \(snapshot?.maxSpeedText ?? "--") • \(snapshot?.distanceText ?? "--") • \(snapshot?.headingText ?? "--")",
      attributes: [
        .foregroundColor: V3l0cityCarPalette.textSecondary,
        .font: UIFont.systemFont(ofSize: 16, weight: .semibold)
      ])
    let header = CPListTemplateDetailsHeader(
      thumbnail: CPThumbnailImage(image: image),
      title: "V3l0city Drive",
      subtitle: subtitle,
      bodyVariants: [body],
      actionButtons: [])
    header.wantsAdaptiveBackgroundStyle = true
    return header
  }

  private func richListSections(snapshot: V3l0cityCarSnapshot?) -> [CPListSection] {
    let live = snapshot != nil
    let status = snapshot == nil
      ? "Start a trip on your phone"
      : snapshot?.tripPaused == true
        ? "Paused • \(snapshot?.signalText ?? "Ready")"
        : snapshot?.tripActive == true
          ? "\(snapshot?.simulationActive == true ? "Simulated" : "Live") • \(snapshot?.signalText ?? "Ready")"
          : "Ready • \(snapshot?.signalText ?? "Ready")"

    let driveItems = [
      disabledListItem(
        title: live ? "\(snapshot?.speedText ?? "--") \(snapshot?.units ?? "MPH")" : "--",
        detail: status),
      disabledListItem(title: "Elapsed", detail: snapshot?.elapsedText ?? "--:--:--")
    ]
    let statsItems = [
      disabledListItem(title: "Average", detail: live ? "\(snapshot?.averageSpeedText ?? "--") \(snapshot?.units ?? "MPH")" : "--"),
      disabledListItem(title: "Maximum", detail: live ? "\(snapshot?.maxSpeedText ?? "--") \(snapshot?.units ?? "MPH")" : "--"),
      disabledListItem(title: "Distance", detail: snapshot?.distanceText ?? "--"),
      disabledListItem(title: "Heading", detail: live ? "\(snapshot?.headingText ?? "--") • \(snapshot?.headingSource ?? "none")" : "--")
    ]
    return [
      CPListSection(items: driveItems, header: "Drive", sectionIndexTitle: nil),
      CPListSection(items: statsItems, header: "Stats", sectionIndexTitle: nil)
    ]
  }

  private func disabledListItem(title: String, detail: String) -> CPListItem {
    let item = CPListItem(text: title, detailText: detail)
    if #available(iOS 15.0, *) {
      item.isEnabled = false
    }
    return item
  }

  private func informationItems() -> [CPInformationItem] {
    guard let snapshot = V3l0cityCarSnapshot.current() else {
      return [
        CPInformationItem(title: "Speed", detail: "--"),
        CPInformationItem(title: "Status", detail: "Open V3l0city to start tracking"),
        CPInformationItem(title: "Distance", detail: "--"),
        CPInformationItem(title: "Elapsed", detail: "--:--:--"),
        CPInformationItem(title: "Heading", detail: "--"),
        CPInformationItem(title: "Signal", detail: "No live trip")
      ]
    }

    let tripState = snapshot.tripPaused
      ? "Trip paused"
      : snapshot.tripActive
        ? "Trip active"
        : "Ready"

    return [
      CPInformationItem(title: "Speed", detail: "\(snapshot.speedText) \(snapshot.units)"),
      CPInformationItem(title: "Status", detail: "\(tripState) • \(snapshot.signalText)"),
      CPInformationItem(title: "Average", detail: "\(snapshot.averageSpeedText) \(snapshot.units)"),
      CPInformationItem(title: "Maximum", detail: "\(snapshot.maxSpeedText) \(snapshot.units)"),
      CPInformationItem(title: "Distance", detail: snapshot.distanceText),
      CPInformationItem(title: "Elapsed", detail: snapshot.elapsedText),
      CPInformationItem(title: "Heading", detail: "\(snapshot.headingText) • \(snapshot.headingSource)"),
      CPInformationItem(title: "Signal", detail: snapshot.signalText)
    ]
  }
}

private struct V3l0cityCarSnapshot {
  let tripActive: Bool
  let tripPaused: Bool
  let speedMps: Double
  let speedText: String
  let units: String
  let averageSpeedMps: Double
  let averageSpeedText: String
  let maxSpeedMps: Double
  let maxSpeedText: String
  let distanceMeters: Double
  let distanceText: String
  let elapsedText: String
  let headingText: String
  let headingDegrees: Double?
  let headingSource: String
  let headingQuality: String
  let signalQuality: String
  let signalText: String
  let updatedAtMs: Double
  let simulationActive: Bool

  static func current(now: Date = Date()) -> V3l0cityCarSnapshot? {
    guard
      let defaults = UserDefaults(suiteName: "group.com.v3l0city.app"),
      let json = defaults.string(forKey: "driveSurfaceSnapshot"),
      let data = json.data(using: .utf8),
      let object = try? JSONSerialization.jsonObject(with: data),
      let dictionary = object as? [String: Any]
    else {
      return nil
    }

    let updatedAtMs = number(dictionary, "updatedAtMs") ?? 0
    let stale = bool(dictionary, "stale") ?? true
    if stale || now.timeIntervalSince1970 * 1000.0 - updatedAtMs > 5000.0 {
      return nil
    }

    return V3l0cityCarSnapshot(
      tripActive: bool(dictionary, "tripActive") ?? false,
      tripPaused: bool(dictionary, "tripPaused") ?? false,
      speedMps: number(dictionary, "speedMps") ?? 0,
      speedText: string(dictionary, "speedText", fallback: "--"),
      units: string(dictionary, "units", fallback: "MPH"),
      averageSpeedMps: number(dictionary, "averageSpeedMps") ?? 0,
      averageSpeedText: string(dictionary, "averageSpeedText", fallback: "--"),
      maxSpeedMps: number(dictionary, "maxSpeedMps") ?? 0,
      maxSpeedText: string(dictionary, "maxSpeedText", fallback: "--"),
      distanceMeters: number(dictionary, "distanceMeters") ?? 0,
      distanceText: string(dictionary, "distanceText", fallback: "--"),
      elapsedText: string(dictionary, "elapsedText", fallback: "--:--:--"),
      headingText: string(dictionary, "headingText", fallback: "--"),
      headingDegrees: number(dictionary, "headingDegrees"),
      headingSource: string(dictionary, "headingSource", fallback: "heading"),
      headingQuality: string(dictionary, "headingQuality", fallback: "poor"),
      signalQuality: string(dictionary, "signalQuality", fallback: "poor"),
      signalText: string(dictionary, "signalText", fallback: "Ready"),
      updatedAtMs: updatedAtMs,
      simulationActive: bool(dictionary, "simulationActive") ?? false)
  }

  private static func string(
    _ dictionary: [String: Any],
    _ key: String,
    fallback: String
  ) -> String {
    dictionary[key] as? String ?? fallback
  }

  private static func number(_ dictionary: [String: Any], _ key: String) -> Double? {
    if let number = dictionary[key] as? NSNumber {
      return number.doubleValue
    }
    return dictionary[key] as? Double
  }

  private static func bool(_ dictionary: [String: Any], _ key: String) -> Bool? {
    if let bool = dictionary[key] as? Bool {
      return bool
    }
    return (dictionary[key] as? NSNumber)?.boolValue
  }
}

private enum V3l0cityCarHeaderRenderer {
  static func render(snapshot: V3l0cityCarSnapshot?) -> UIImage {
    let size = CGSize(width: 720, height: 360)
    let view = V3l0cityCarDashboardView(frame: CGRect(origin: .zero, size: size))
    view.apply(snapshot: snapshot)
    view.setNeedsLayout()
    view.layoutIfNeeded()

    let format = UIGraphicsImageRendererFormat()
    format.scale = UIScreen.main.scale
    format.opaque = true

    return UIGraphicsImageRenderer(size: size, format: format).image { _ in
      view.drawHierarchy(in: view.bounds, afterScreenUpdates: true)
    }
  }
}

private enum V3l0cityCarPalette {
  static let background = UIColor(red: 15 / 255, green: 17 / 255, blue: 20 / 255, alpha: 1)
  static let surface = UIColor(red: 18 / 255, green: 25 / 255, blue: 27 / 255, alpha: 1)
  static let surfaceRaised = UIColor(red: 22 / 255, green: 28 / 255, blue: 31 / 255, alpha: 1)
  static let border = UIColor(red: 40 / 255, green: 49 / 255, blue: 55 / 255, alpha: 1)
  static let tick = UIColor(red: 45 / 255, green: 58 / 255, blue: 64 / 255, alpha: 1)
  static let text = UIColor(red: 244 / 255, green: 247 / 255, blue: 250 / 255, alpha: 1)
  static let textSecondary = UIColor(red: 145 / 255, green: 154 / 255, blue: 164 / 255, alpha: 1)
  static let textMuted = UIColor(red: 91 / 255, green: 103 / 255, blue: 112 / 255, alpha: 1)
  static let accent = UIColor(red: 0 / 255, green: 229 / 255, blue: 255 / 255, alpha: 1)
  static let accentDim = UIColor(red: 0 / 255, green: 229 / 255, blue: 255 / 255, alpha: 0.18)
  static let gold = UIColor(red: 255 / 255, green: 210 / 255, blue: 26 / 255, alpha: 1)
  static let north = UIColor(red: 255 / 255, green: 68 / 255, blue: 68 / 255, alpha: 1)
}

private final class V3l0cityCarDashboardViewController: UIViewController {
  private let dashboardView = V3l0cityCarDashboardView()

  override func loadView() {
    view = dashboardView
  }

  func update(snapshot: V3l0cityCarSnapshot?) {
    dashboardView.apply(snapshot: snapshot)
  }
}

private final class V3l0cityCarDashboardView: UIView {
  private let backgroundLayer = CAGradientLayer()
  private let liveDot = UIView()
  private let speedDial = V3l0cityCarSpeedDialView()
  private let statsRow = UIStackView()
  private let averageStat = V3l0cityCarStatView(title: "AVG")
  private let maxStat = V3l0cityCarStatView(title: "MAX")
  private let distanceStat = V3l0cityCarStatView(title: "DIST")
  private let compassView = V3l0cityCarCompassView()
  private let statusTitleLabel = UILabel()
  private let elapsedLabel = UILabel()
  private let statusValueLabel = UILabel()
  private let footerLabel = UILabel()

  override init(frame: CGRect) {
    super.init(frame: frame)
    configureView()
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    configureView()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    backgroundLayer.frame = bounds
    liveDot.layer.cornerRadius = liveDot.bounds.width / 2
  }

  func apply(snapshot: V3l0cityCarSnapshot?) {
    speedDial.apply(snapshot: snapshot)
    compassView.apply(snapshot: snapshot)

    averageStat.value = snapshot?.averageSpeedText ?? "--"
    averageStat.unit = snapshot?.units ?? ""
    maxStat.value = snapshot?.maxSpeedText ?? "--"
    maxStat.unit = snapshot?.units ?? ""
    distanceStat.value = snapshot?.distanceText ?? "--"
    distanceStat.unit = ""

    elapsedLabel.text = snapshot?.elapsedText ?? "--:--:--"
    statusValueLabel.text = statusText(for: snapshot)
    footerLabel.text = footerText(for: snapshot)
    liveDot.backgroundColor = snapshot == nil ? V3l0cityCarPalette.textMuted : V3l0cityCarPalette.accent
    liveDot.alpha = snapshot == nil ? 0.45 : 1
  }

  private func configureView() {
    backgroundColor = V3l0cityCarPalette.background
    backgroundLayer.colors = [
      V3l0cityCarPalette.background.cgColor,
      V3l0cityCarPalette.surface.withAlphaComponent(0.78).cgColor,
      V3l0cityCarPalette.background.cgColor
    ]
    backgroundLayer.startPoint = CGPoint(x: 0, y: 0)
    backgroundLayer.endPoint = CGPoint(x: 1, y: 1)
    layer.insertSublayer(backgroundLayer, at: 0)

    liveDot.translatesAutoresizingMaskIntoConstraints = false
    liveDot.backgroundColor = V3l0cityCarPalette.textMuted

    speedDial.translatesAutoresizingMaskIntoConstraints = false
    compassView.translatesAutoresizingMaskIntoConstraints = false

    averageStat.translatesAutoresizingMaskIntoConstraints = false
    maxStat.translatesAutoresizingMaskIntoConstraints = false
    distanceStat.translatesAutoresizingMaskIntoConstraints = false
    statsRow.axis = .horizontal
    statsRow.distribution = .fillEqually
    statsRow.spacing = 10
    statsRow.translatesAutoresizingMaskIntoConstraints = false
    [averageStat, maxStat, distanceStat].forEach(statsRow.addArrangedSubview)

    let statusPanel = makeStatusPanel()
    let rightColumn = UIStackView(arrangedSubviews: [statsRow, makeCompassBlock(), statusPanel])
    rightColumn.axis = .vertical
    rightColumn.alignment = .fill
    rightColumn.distribution = .fillProportionally
    rightColumn.spacing = 14
    rightColumn.translatesAutoresizingMaskIntoConstraints = false

    let contentStack = UIStackView(arrangedSubviews: [speedDial, rightColumn])
    contentStack.axis = .horizontal
    contentStack.alignment = .center
    contentStack.distribution = .fill
    contentStack.spacing = 24
    contentStack.translatesAutoresizingMaskIntoConstraints = false

    footerLabel.textColor = V3l0cityCarPalette.accent
    footerLabel.font = .monospacedDigitSystemFont(ofSize: 15, weight: .semibold)
    footerLabel.numberOfLines = 1
    footerLabel.textAlignment = .center
    footerLabel.adjustsFontSizeToFitWidth = true
    footerLabel.minimumScaleFactor = 0.72

    addSubview(liveDot)
    addSubview(contentStack)

    let dialHeight = speedDial.heightAnchor.constraint(
      equalTo: contentStack.heightAnchor,
      multiplier: 0.94)
    dialHeight.priority = .defaultHigh

    NSLayoutConstraint.activate([
      liveDot.topAnchor.constraint(equalTo: safeAreaLayoutGuide.topAnchor, constant: 18),
      liveDot.trailingAnchor.constraint(equalTo: safeAreaLayoutGuide.trailingAnchor, constant: -22),
      liveDot.widthAnchor.constraint(equalToConstant: 9),
      liveDot.heightAnchor.constraint(equalToConstant: 9),

      contentStack.topAnchor.constraint(equalTo: safeAreaLayoutGuide.topAnchor, constant: 12),
      contentStack.leadingAnchor.constraint(equalTo: safeAreaLayoutGuide.leadingAnchor, constant: 18),
      contentStack.trailingAnchor.constraint(equalTo: safeAreaLayoutGuide.trailingAnchor, constant: -20),
      contentStack.bottomAnchor.constraint(equalTo: safeAreaLayoutGuide.bottomAnchor, constant: -14),

      dialHeight,
      speedDial.heightAnchor.constraint(equalTo: speedDial.widthAnchor),
      speedDial.widthAnchor.constraint(lessThanOrEqualTo: contentStack.widthAnchor, multiplier: 0.54),

      rightColumn.widthAnchor.constraint(equalTo: contentStack.widthAnchor, multiplier: 0.34),

      compassView.widthAnchor.constraint(equalToConstant: 150),
      compassView.heightAnchor.constraint(equalTo: compassView.widthAnchor),
      statsRow.heightAnchor.constraint(equalToConstant: 82)
    ])
  }

  private func makeStatusPanel() -> UIView {
    let panel = UIView()
    panel.backgroundColor = V3l0cityCarPalette.surfaceRaised.withAlphaComponent(0.48)
    panel.layer.cornerRadius = 16
    panel.layer.borderWidth = 1
    panel.layer.borderColor = V3l0cityCarPalette.border.cgColor
    panel.translatesAutoresizingMaskIntoConstraints = false

    statusTitleLabel.text = "TIME"
    statusTitleLabel.textColor = V3l0cityCarPalette.textMuted
    statusTitleLabel.font = .systemFont(ofSize: 12, weight: .bold)
    statusTitleLabel.translatesAutoresizingMaskIntoConstraints = false

    elapsedLabel.text = "--:--:--"
    elapsedLabel.textColor = V3l0cityCarPalette.text
    elapsedLabel.font = .monospacedDigitSystemFont(ofSize: 23, weight: .semibold)
    elapsedLabel.adjustsFontSizeToFitWidth = true
    elapsedLabel.minimumScaleFactor = 0.7
    elapsedLabel.translatesAutoresizingMaskIntoConstraints = false

    statusValueLabel.text = "Start a trip on your phone"
    statusValueLabel.textColor = V3l0cityCarPalette.accent
    statusValueLabel.font = .systemFont(ofSize: 14, weight: .semibold)
    statusValueLabel.numberOfLines = 2
    statusValueLabel.translatesAutoresizingMaskIntoConstraints = false

    [statusTitleLabel, elapsedLabel, statusValueLabel].forEach(panel.addSubview)
    NSLayoutConstraint.activate([
      statusTitleLabel.topAnchor.constraint(equalTo: panel.topAnchor, constant: 14),
      statusTitleLabel.leadingAnchor.constraint(equalTo: panel.leadingAnchor, constant: 16),
      statusTitleLabel.trailingAnchor.constraint(equalTo: panel.trailingAnchor, constant: -16),

      elapsedLabel.topAnchor.constraint(equalTo: statusTitleLabel.bottomAnchor, constant: 4),
      elapsedLabel.leadingAnchor.constraint(equalTo: statusTitleLabel.leadingAnchor),
      elapsedLabel.trailingAnchor.constraint(equalTo: statusTitleLabel.trailingAnchor),

      statusValueLabel.topAnchor.constraint(equalTo: elapsedLabel.bottomAnchor, constant: 6),
      statusValueLabel.leadingAnchor.constraint(equalTo: statusTitleLabel.leadingAnchor),
      statusValueLabel.trailingAnchor.constraint(equalTo: statusTitleLabel.trailingAnchor),
      statusValueLabel.bottomAnchor.constraint(lessThanOrEqualTo: panel.bottomAnchor, constant: -14),

      panel.heightAnchor.constraint(greaterThanOrEqualToConstant: 104)
    ])
    return panel
  }

  private func makeCompassBlock() -> UIView {
    let block = UIStackView(arrangedSubviews: [compassView, footerLabel])
    block.axis = .vertical
    block.alignment = .center
    block.distribution = .fill
    block.spacing = 2
    block.translatesAutoresizingMaskIntoConstraints = false
    return block
  }

  private func statusText(for snapshot: V3l0cityCarSnapshot?) -> String {
    guard let snapshot else {
      return "Start a trip on your phone"
    }
    if snapshot.tripPaused {
      return "Paused • \(snapshot.signalText)"
    }
    if snapshot.tripActive {
      return "\(snapshot.simulationActive ? "Simulated" : "Live") • \(snapshot.signalText)"
    }
    return "Ready • \(snapshot.signalText)"
  }

  private func footerText(for snapshot: V3l0cityCarSnapshot?) -> String {
    guard let snapshot else {
      return "Open V3l0city to start tracking"
    }
    return "\(snapshot.headingText) \(snapshot.headingSource) • \(snapshot.headingQuality)"
  }
}

private final class V3l0cityCarStatView: UIView {
  private let titleLabel = UILabel()
  private let valueLabel = UILabel()
  private let unitLabel = UILabel()

  var value: String {
    get { valueLabel.text ?? "" }
    set { valueLabel.text = newValue }
  }

  var unit: String {
    get { unitLabel.text ?? "" }
    set { unitLabel.text = newValue }
  }

  init(title: String) {
    super.init(frame: .zero)
    configure(title: title)
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    configure(title: "")
  }

  private func configure(title: String) {
    backgroundColor = V3l0cityCarPalette.surfaceRaised.withAlphaComponent(0.72)
    layer.cornerRadius = 14
    layer.borderWidth = 1
    layer.borderColor = V3l0cityCarPalette.border.cgColor

    titleLabel.text = title
    titleLabel.textColor = V3l0cityCarPalette.textMuted
    titleLabel.font = .systemFont(ofSize: 12, weight: .bold)
    titleLabel.textAlignment = .center

    valueLabel.text = "--"
    valueLabel.textColor = title == "MAX" ? V3l0cityCarPalette.gold : V3l0cityCarPalette.text
    valueLabel.font = .monospacedDigitSystemFont(ofSize: 24, weight: .bold)
    valueLabel.textAlignment = .center
    valueLabel.adjustsFontSizeToFitWidth = true
    valueLabel.minimumScaleFactor = 0.7

    unitLabel.textColor = V3l0cityCarPalette.textSecondary
    unitLabel.font = .systemFont(ofSize: 11, weight: .semibold)
    unitLabel.textAlignment = .center
    unitLabel.adjustsFontSizeToFitWidth = true
    unitLabel.minimumScaleFactor = 0.7

    let stack = UIStackView(arrangedSubviews: [titleLabel, valueLabel, unitLabel])
    stack.axis = .vertical
    stack.alignment = .fill
    stack.distribution = .fill
    stack.spacing = 2
    stack.translatesAutoresizingMaskIntoConstraints = false
    addSubview(stack)

    NSLayoutConstraint.activate([
      stack.centerYAnchor.constraint(equalTo: centerYAnchor),
      stack.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 10),
      stack.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -10)
    ])
  }
}

private final class V3l0cityCarSpeedDialView: UIView {
  private let speedLabel = UILabel()
  private let unitLabel = UILabel()
  private var progress: CGFloat = 0

  override init(frame: CGRect) {
    super.init(frame: frame)
    configure()
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    configure()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let labelHeight = bounds.height * 0.26
    speedLabel.font = .monospacedDigitSystemFont(
      ofSize: min(132, max(72, bounds.height * 0.3)),
      weight: .medium)
    unitLabel.font = .systemFont(
      ofSize: min(24, max(16, bounds.height * 0.06)),
      weight: .semibold)
    speedLabel.frame = CGRect(
      x: bounds.width * 0.12,
      y: bounds.midY - labelHeight * 0.72,
      width: bounds.width * 0.76,
      height: labelHeight)
    unitLabel.frame = CGRect(
      x: bounds.width * 0.12,
      y: speedLabel.frame.maxY - 2,
      width: bounds.width * 0.76,
      height: 28)
  }

  override func draw(_ rect: CGRect) {
    guard let context = UIGraphicsGetCurrentContext() else {
      return
    }

    let center = CGPoint(x: rect.midX, y: rect.midY)
    let radius = min(rect.width, rect.height) * 0.39
    let startAngle = CGFloat.pi * 0.76
    let endAngle = CGFloat.pi * 2.24
    let sweep = endAngle - startAngle

    context.setLineCap(.round)
    context.setLineWidth(9)
    context.setStrokeColor(V3l0cityCarPalette.tick.cgColor)
    context.addArc(center: center, radius: radius, startAngle: startAngle, endAngle: endAngle, clockwise: false)
    context.strokePath()

    context.setStrokeColor(V3l0cityCarPalette.accent.cgColor)
    context.addArc(
      center: center,
      radius: radius,
      startAngle: startAngle,
      endAngle: startAngle + sweep * progress,
      clockwise: false)
    context.strokePath()

    for index in 0...12 {
      let fraction = CGFloat(index) / 12
      let angle = startAngle + sweep * fraction
      let inner = radius - (index % 3 == 0 ? 18 : 10)
      let outer = radius + 8
      let start = CGPoint(x: center.x + cos(angle) * inner, y: center.y + sin(angle) * inner)
      let end = CGPoint(x: center.x + cos(angle) * outer, y: center.y + sin(angle) * outer)
      context.setLineWidth(index % 3 == 0 ? 3 : 1.4)
      context.setStrokeColor(V3l0cityCarPalette.tick.cgColor)
      context.move(to: start)
      context.addLine(to: end)
      context.strokePath()
    }
  }

  func apply(snapshot: V3l0cityCarSnapshot?) {
    let speedValue = Double(snapshot?.speedText ?? "") ?? 0
    let dialMax = snapshot?.units == "km/h" ? 260.0 : 160.0
    progress = CGFloat(max(0, min(speedValue / dialMax, 1)))
    speedLabel.text = snapshot?.speedText ?? "--"
    unitLabel.text = snapshot?.units ?? "MPH"
    alpha = snapshot == nil ? 0.58 : 1
    setNeedsDisplay()
  }

  private func configure() {
    backgroundColor = .clear
    isOpaque = false

    speedLabel.text = "--"
    speedLabel.textColor = V3l0cityCarPalette.text
    speedLabel.font = .monospacedDigitSystemFont(ofSize: 84, weight: .medium)
    speedLabel.textAlignment = .center
    speedLabel.adjustsFontSizeToFitWidth = true
    speedLabel.minimumScaleFactor = 0.45

    unitLabel.text = "MPH"
    unitLabel.textColor = V3l0cityCarPalette.textSecondary
    unitLabel.font = .systemFont(ofSize: 18, weight: .semibold)
    unitLabel.textAlignment = .center

    addSubview(speedLabel)
    addSubview(unitLabel)
  }
}

private final class V3l0cityCarCompassView: UIView {
  private var headingDegrees: Double?
  private var headingText = "--"

  override init(frame: CGRect) {
    super.init(frame: frame)
    configure()
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    configure()
  }

  override func draw(_ rect: CGRect) {
    guard let context = UIGraphicsGetCurrentContext() else {
      return
    }

    let center = CGPoint(x: rect.midX, y: rect.midY - 6)
    let radius = min(rect.width, rect.height) * 0.38
    let heading = headingDegrees ?? 0
    let available = headingDegrees != nil

    context.setStrokeColor(V3l0cityCarPalette.border.cgColor)
    context.setLineWidth(1)
    context.addEllipse(in: CGRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2))
    context.strokePath()

    for index in 0..<40 {
      let cardinal = Double(index) * 9
      let angle = CGFloat((cardinal - heading - 90) * .pi / 180)
      let major = index % 10 == 0
      let inner = radius - (major ? 10 : 5)
      let outer = radius
      let start = CGPoint(x: center.x + cos(angle) * inner, y: center.y + sin(angle) * inner)
      let end = CGPoint(x: center.x + cos(angle) * outer, y: center.y + sin(angle) * outer)
      context.setLineWidth(major ? 1.4 : 0.7)
      context.setStrokeColor(available ? V3l0cityCarPalette.tick.cgColor : V3l0cityCarPalette.textMuted.withAlphaComponent(0.35).cgColor)
      context.move(to: start)
      context.addLine(to: end)
      context.strokePath()
    }

    drawCardinals(center: center, radius: radius, heading: heading, available: available)
    drawNeedle(center: center, radius: radius, available: available)
    drawHeadingLabel(rect: rect, available: available)
  }

  func apply(snapshot: V3l0cityCarSnapshot?) {
    headingDegrees = snapshot?.headingDegrees
    headingText = snapshot?.headingText ?? "--"
    alpha = snapshot == nil ? 0.62 : 1
    setNeedsDisplay()
  }

  private func configure() {
    backgroundColor = .clear
    isOpaque = false
  }

  private func drawCardinals(center: CGPoint, radius: CGFloat, heading: Double, available: Bool) {
    let labels = [(0.0, "N"), (90.0, "E"), (180.0, "S"), (270.0, "W")]
    for (cardinal, label) in labels {
      let angle = CGFloat((cardinal - heading - 90) * .pi / 180)
      let point = CGPoint(x: center.x + cos(angle) * radius * 0.7, y: center.y + sin(angle) * radius * 0.7)
      let color = label == "N" ? V3l0cityCarPalette.north : V3l0cityCarPalette.textSecondary
      let attributes: [NSAttributedString.Key: Any] = [
        .font: UIFont.systemFont(ofSize: 12, weight: .bold),
        .foregroundColor: available ? color : V3l0cityCarPalette.textMuted
      ]
      let size = label.size(withAttributes: attributes)
      label.draw(
        at: CGPoint(x: point.x - size.width / 2, y: point.y - size.height / 2),
        withAttributes: attributes)
    }
  }

  private func drawNeedle(center: CGPoint, radius: CGFloat, available: Bool) {
    let needleColor = available ? V3l0cityCarPalette.accent : V3l0cityCarPalette.textMuted
    let path = UIBezierPath()
    path.move(to: CGPoint(x: center.x, y: center.y - radius * 0.78))
    path.addLine(to: CGPoint(x: center.x - 12, y: center.y + 8))
    path.addLine(to: CGPoint(x: center.x, y: center.y + 2))
    path.addLine(to: CGPoint(x: center.x + 12, y: center.y + 8))
    path.close()
    needleColor.setFill()
    path.fill()

    V3l0cityCarPalette.background.setFill()
    UIBezierPath(ovalIn: CGRect(x: center.x - 8, y: center.y - 8, width: 16, height: 16)).fill()
    needleColor.setStroke()
    let ring = UIBezierPath(ovalIn: CGRect(x: center.x - 8, y: center.y - 8, width: 16, height: 16))
    ring.lineWidth = 3
    ring.stroke()
  }

  private func drawHeadingLabel(rect: CGRect, available: Bool) {
    let attributes: [NSAttributedString.Key: Any] = [
      .font: UIFont.monospacedDigitSystemFont(ofSize: 14, weight: .semibold),
      .foregroundColor: available ? V3l0cityCarPalette.text : V3l0cityCarPalette.textMuted
    ]
    let size = headingText.size(withAttributes: attributes)
    headingText.draw(
      at: CGPoint(x: rect.midX - size.width / 2, y: rect.maxY - size.height - 4),
      withAttributes: attributes)
  }
}

class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {
  // Extension point for config-plugins

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    // needed to return the correct URL for expo-dev-client.
    bridge.bundleURL ?? bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    return RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: ".expo/.virtual-metro-entry")
#else
    return Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
