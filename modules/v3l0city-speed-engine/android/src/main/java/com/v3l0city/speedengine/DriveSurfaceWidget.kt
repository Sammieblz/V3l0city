package com.v3l0city.speedengine

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.round
import kotlin.math.sin

private const val DRIVE_SURFACE_PREFS = "v3l0city_drive_surface"
private const val DRIVE_SURFACE_SNAPSHOT_KEY = "driveSurfaceSnapshot"
private const val DRIVE_SURFACE_SESSION_ACTIVE_KEY = "driveSurfaceSessionActive"
private const val DRIVE_SURFACE_STALE_AFTER_MS = 5000L
private const val DRIVE_NOTIFICATION_CHANNEL_ID = "v3l0city_drive_surface"
private const val DRIVE_NOTIFICATION_ID = 3007
private const val DRIVE_SERVICE_ACTION_START = "com.v3l0city.speedengine.START_DRIVE_SURFACE"
private const val DRIVE_SERVICE_ACTION_STOP = "com.v3l0city.speedengine.STOP_DRIVE_SURFACE"

internal object DriveSurfaceStore {
  fun startSession(context: Context, snapshot: Map<String, Any?>) {
    context.getSharedPreferences(DRIVE_SURFACE_PREFS, Context.MODE_PRIVATE)
      .edit()
      .putBoolean(DRIVE_SURFACE_SESSION_ACTIVE_KEY, true)
      .apply()
    write(context, snapshot)
    V3l0cityDriveForegroundService.start(context)
  }

  fun stopSession(context: Context, snapshot: Map<String, Any?>) {
    write(context, snapshot)
    context.getSharedPreferences(DRIVE_SURFACE_PREFS, Context.MODE_PRIVATE)
      .edit()
      .putBoolean(DRIVE_SURFACE_SESSION_ACTIVE_KEY, false)
      .apply()
    clear(context)
    V3l0cityDriveForegroundService.stop(context)
  }

  fun write(context: Context, snapshot: Map<String, Any?>) {
    val json = JSONObject()
    snapshot.forEach { (key, value) ->
      json.put(key, value)
    }
    context.getSharedPreferences(DRIVE_SURFACE_PREFS, Context.MODE_PRIVATE)
      .edit()
      .putString(DRIVE_SURFACE_SNAPSHOT_KEY, json.toString())
      .apply()

    V3l0cityDriveWidgetRenderer.updateAll(context)
    DriveSurfaceNotification.update(context, json)
  }

  fun clear(context: Context) {
    context.getSharedPreferences(DRIVE_SURFACE_PREFS, Context.MODE_PRIVATE)
      .edit()
      .remove(DRIVE_SURFACE_SNAPSHOT_KEY)
      .putBoolean(DRIVE_SURFACE_SESSION_ACTIVE_KEY, false)
      .apply()

    V3l0cityDriveWidgetRenderer.updateAll(context)
    DriveSurfaceNotification.cancel(context)
    V3l0cityDriveForegroundService.stop(context)
  }

  fun read(context: Context): JSONObject? {
    val value = context.getSharedPreferences(DRIVE_SURFACE_PREFS, Context.MODE_PRIVATE)
      .getString(DRIVE_SURFACE_SNAPSHOT_KEY, null)
      ?: return null

    return runCatching { JSONObject(value) }.getOrNull()
  }

  fun isSessionActive(context: Context): Boolean {
    return context.getSharedPreferences(DRIVE_SURFACE_PREFS, Context.MODE_PRIVATE)
      .getBoolean(DRIVE_SURFACE_SESSION_ACTIVE_KEY, false)
  }
}

class V3l0cityDriveForegroundService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == DRIVE_SERVICE_ACTION_STOP) {
      LiveDriveSessionManager.stopLiveSession(
        this,
        DriveSurfaceStore.read(this)?.let(::jsonObjectToMap) ?: emptyMap()
      )
      stopForegroundCompat()
      stopSelf()
      return START_NOT_STICKY
    }

    DriveSurfaceNotification.ensureChannel(this)
    val notification = DriveSurfaceNotification.build(
      this,
      DriveSurfaceStore.read(this),
      forceActive = true
    )
    val serviceType =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION else 0
    ServiceCompat.startForeground(this, DRIVE_NOTIFICATION_ID, notification, serviceType)
    LiveDriveSessionManager.startFromStoredSession(this)
    return START_STICKY
  }

  override fun onDestroy() {
    stopForegroundCompat()
    super.onDestroy()
  }

  private fun stopForegroundCompat() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
  }

  companion object {
    fun start(context: Context) {
      val intent = Intent(context, V3l0cityDriveForegroundService::class.java)
        .setAction(DRIVE_SERVICE_ACTION_START)
      ContextCompat.startForegroundService(context, intent)
    }

    fun stop(context: Context) {
      val intent = Intent(context, V3l0cityDriveForegroundService::class.java)
      context.stopService(intent)
    }
  }
}

private fun jsonObjectToMap(json: JSONObject): Map<String, Any?> {
  val values = mutableMapOf<String, Any?>()
  val keys = json.keys()
  while (keys.hasNext()) {
    val key = keys.next()
    val value = json.opt(key)
    values[key] = if (value == JSONObject.NULL) null else value
  }
  return values
}

class V3l0cityDriveWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray
  ) {
    appWidgetIds.forEach { widgetId ->
      V3l0cityDriveWidgetRenderer.update(context, appWidgetManager, widgetId)
    }
  }

  override fun onAppWidgetOptionsChanged(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetId: Int,
    newOptions: Bundle
  ) {
    V3l0cityDriveWidgetRenderer.update(context, appWidgetManager, appWidgetId)
  }
}

internal object V3l0cityDriveWidgetRenderer {
  fun updateAll(context: Context) {
    val manager = AppWidgetManager.getInstance(context)
    val component = ComponentName(context, V3l0cityDriveWidgetProvider::class.java)
    manager.getAppWidgetIds(component).forEach { widgetId ->
      update(context, manager, widgetId)
    }
  }

  fun update(context: Context, manager: AppWidgetManager, widgetId: Int) {
    val snapshot = DriveSurfaceStore.read(context)
    val isStale = snapshot == null || isStale(snapshot)
    val views = RemoteViews(context.packageName, layoutFor(manager, widgetId))

    views.setTextViewText(R.id.driveWidgetSpeed, if (isStale) "--" else snapshot?.optString("speedText", "--"))
    views.setTextViewText(R.id.driveWidgetUnits, if (isStale) "" else snapshot?.optString("units", "MPH"))
    views.setTextViewText(R.id.driveWidgetDistance, if (isStale) "--" else snapshot?.optString("distanceText", "--"))
    views.setTextViewText(R.id.driveWidgetAverage, if (isStale) "--" else snapshot?.optString("averageSpeedText", "--"))
    views.setTextViewText(R.id.driveWidgetMax, if (isStale) "--" else snapshot?.optString("maxSpeedText", "--"))
    views.setTextViewText(R.id.driveWidgetHeading, if (isStale) "--" else snapshot?.optString("headingText", "--"))
    views.setTextViewText(R.id.driveWidgetElapsed, if (isStale) "--" else snapshot?.optString("elapsedText", "--"))
    val units = snapshot?.optString("units", "MPH") ?: "MPH"
    val progressMax = if (units == "km/h") 260 else 160
    val progressValue = if (isStale) 0 else displaySpeed(snapshot, units).coerceIn(0, progressMax)
    views.setProgressBar(R.id.driveWidgetSpeedProgress, progressMax, progressValue, false)
    views.setImageViewBitmap(
      R.id.driveWidgetSpeedDial,
      speedDialBitmap(context, snapshot, isStale, units, progressMax)
    )
    views.setImageViewBitmap(
      R.id.driveWidgetCompass,
      compassBitmap(context, snapshot, isStale)
    )
    views.setTextViewText(
      R.id.driveWidgetStatus,
      if (isStale) "Open V3l0city to start tracking" else statusText(snapshot)
    )
    views.setTextColor(R.id.driveWidgetSignalDot, signalColor(snapshot, isStale))
    views.setTextColor(R.id.driveWidgetStatus, signalColor(snapshot, isStale))
    launchIntent(context)?.let { views.setOnClickPendingIntent(R.id.driveWidgetRoot, it) }

    manager.updateAppWidget(widgetId, views)
  }

  private fun layoutFor(manager: AppWidgetManager, widgetId: Int): Int {
    val options = manager.getAppWidgetOptions(widgetId)
    val minWidth = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0)
    val minHeight = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0)
    return when {
      minWidth >= 260 && minHeight >= 240 -> R.layout.v3l0city_drive_widget_expanded
      minWidth >= 220 && minHeight >= 150 -> R.layout.v3l0city_drive_widget
      else -> R.layout.v3l0city_drive_widget_compact
    }
  }

  private fun isStale(snapshot: JSONObject): Boolean {
    if (snapshot.optBoolean("stale", false)) {
      return true
    }
    val updatedAtMs = snapshot.optDouble("updatedAtMs", 0.0).toLong()
    return updatedAtMs <= 0L || System.currentTimeMillis() - updatedAtMs > DRIVE_SURFACE_STALE_AFTER_MS
  }

  private fun statusText(snapshot: JSONObject?): String {
    if (snapshot == null) {
      return "Ready"
    }
    if (snapshot.optBoolean("tripPaused", false)) {
      return "Trip paused"
    }
    if (snapshot.optBoolean("tripActive", false)) {
      return snapshot.optString("signalText", "Trip active")
    }
    return snapshot.optString("signalText", "Ready")
  }

  private fun displaySpeed(snapshot: JSONObject?, units: String): Int {
    val speedMps = snapshot?.optDouble("speedMps", 0.0) ?: 0.0
    val display = if (units == "km/h") speedMps * 3.6 else speedMps * 2.2369362921
    return round(max(0.0, display)).toInt()
  }

  private fun signalColor(snapshot: JSONObject?, isStale: Boolean): Int {
    if (isStale) {
      return 0xFFFFD21A.toInt()
    }
    return when (snapshot?.optString("signalQuality")) {
      "good" -> 0xFF00E5FF.toInt()
      "medium" -> 0xFFFFD21A.toInt()
      else -> 0xFFFF4C6B.toInt()
    }
  }

  private fun speedDialBitmap(
    context: Context,
    snapshot: JSONObject?,
    isStale: Boolean,
    units: String,
    progressMax: Int
  ): Bitmap {
    val size = dp(context, 180)
    val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val stroke = dp(context, 10).toFloat()
    val rect = RectF(stroke * 1.4f, stroke * 1.4f, size - stroke * 1.4f, size - stroke * 1.4f)
    val speed = if (isStale) 0 else displaySpeed(snapshot, units)
    val progress = (speed.toFloat() / progressMax.toFloat()).coerceIn(0f, 1f)

    val trackPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.argb(72, 234, 239, 242)
      style = Paint.Style.STROKE
      strokeWidth = stroke
      strokeCap = Paint.Cap.ROUND
    }
    val accentPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = if (isStale) 0xFFFFD21A.toInt() else 0xFF33F7FF.toInt()
      style = Paint.Style.STROKE
      strokeWidth = stroke
      strokeCap = Paint.Cap.ROUND
    }
    val glowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = if (isStale) Color.argb(64, 255, 210, 26) else Color.argb(70, 0, 229, 255)
      style = Paint.Style.STROKE
      strokeWidth = stroke + dp(context, 3)
      strokeCap = Paint.Cap.ROUND
    }

    canvas.drawArc(rect, 132f, 276f, false, trackPaint)
    if (progress > 0f) {
      canvas.drawArc(rect, 132f, 276f * progress, false, glowPaint)
      canvas.drawArc(rect, 132f, 276f * progress, false, accentPaint)
    }
    return bitmap
  }

  private fun compassBitmap(context: Context, snapshot: JSONObject?, isStale: Boolean): Bitmap {
    val size = dp(context, 96)
    val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val center = size / 2f
    val radius = center - dp(context, 6)
    val heading = snapshot?.optDouble("headingDegrees", Double.NaN)?.takeIf { it.isFinite() } ?: 0.0
    val dimAlpha = if (isStale) 84 else 180

    val ringPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.argb(if (isStale) 36 else 58, 234, 239, 242)
      style = Paint.Style.STROKE
      strokeWidth = dp(context, 1).toFloat()
    }
    canvas.drawCircle(center, center, radius, ringPaint)

    val tickPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.argb(dimAlpha, 234, 239, 242)
      strokeWidth = dp(context, 1).toFloat()
      strokeCap = Paint.Cap.ROUND
    }
    for (tick in 0 until 32) {
      val angle = Math.toRadians(tick * 11.25 - heading - 90.0)
      val major = tick % 8 == 0
      val outer = radius - dp(context, 2)
      val inner = outer - if (major) dp(context, 8) else dp(context, 4)
      canvas.drawLine(
        center + cos(angle).toFloat() * inner,
        center + sin(angle).toFloat() * inner,
        center + cos(angle).toFloat() * outer,
        center + sin(angle).toFloat() * outer,
        tickPaint
      )
    }

    val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = if (isStale) Color.argb(116, 234, 239, 242) else Color.RED
      textAlign = Paint.Align.CENTER
      textSize = dp(context, 10).toFloat()
      typeface = android.graphics.Typeface.DEFAULT_BOLD
    }
    val nAngle = Math.toRadians(-heading - 90.0)
    canvas.drawText(
      "N",
      center + cos(nAngle).toFloat() * (radius - dp(context, 18)),
      center + sin(nAngle).toFloat() * (radius - dp(context, 18)) + dp(context, 4),
      labelPaint
    )

    val needlePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = if (isStale) Color.argb(128, 234, 239, 242) else 0xFF33F7FF.toInt()
      style = Paint.Style.FILL
    }
    val shadowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.argb(80, 0, 0, 0)
      style = Paint.Style.FILL
    }
    val needle = Path().apply {
      moveTo(center, center - radius + dp(context, 20))
      lineTo(center - dp(context, 8), center + dp(context, 10))
      lineTo(center, center + dp(context, 4))
      lineTo(center + dp(context, 8), center + dp(context, 10))
      close()
    }
    canvas.drawPath(needle, shadowPaint)
    canvas.drawPath(needle, needlePaint)
    Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.argb(220, 20, 24, 28)
      style = Paint.Style.FILL
    }.also {
      canvas.drawCircle(center, center, dp(context, 5).toFloat(), it)
    }
    Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = if (isStale) Color.argb(160, 234, 239, 242) else 0xFF33F7FF.toInt()
      style = Paint.Style.STROKE
      strokeWidth = dp(context, 2).toFloat()
    }.also {
      canvas.drawCircle(center, center, dp(context, 5).toFloat(), it)
    }
    return bitmap
  }

  private fun dp(context: Context, value: Int): Int =
    (value * context.resources.displayMetrics.density).toInt().coerceAtLeast(1)
}

internal object DriveSurfaceNotification {
  fun update(context: Context, snapshot: JSONObject) {
    if (!snapshot.optBoolean("tripActive", false)) {
      cancel(context)
      return
    }
    if (!canPostNotifications(context)) {
      return
    }

    ensureChannel(context)
    NotificationManagerCompat.from(context).notify(DRIVE_NOTIFICATION_ID, build(context, snapshot))
  }

  fun cancel(context: Context) {
    NotificationManagerCompat.from(context).cancel(DRIVE_NOTIFICATION_ID)
  }

  fun build(context: Context, snapshot: JSONObject?, forceActive: Boolean = false): android.app.Notification {
    val active = forceActive || snapshot?.optBoolean("tripActive", false) == true
    return NotificationCompat.Builder(context, DRIVE_NOTIFICATION_CHANNEL_ID)
      .setSmallIcon(notificationIcon(context))
      .setContentTitle(if (active) "V3l0city active trip" else "V3l0city ready")
      .setContentText(
        "${snapshot?.optString("speedText", "--") ?: "--"} ${snapshot?.optString("units", "") ?: ""} • " +
          "${snapshot?.optString("distanceText", "--") ?: "--"} • ${snapshot?.optString("elapsedText", "--") ?: "--"}"
      )
      .setOngoing(active)
      .setOnlyAlertOnce(true)
      .setColor(0xFF00E5FF.toInt())
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setContentIntent(launchIntent(context))
      .build()
  }

  fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val channel = NotificationChannel(
      DRIVE_NOTIFICATION_CHANNEL_ID,
      "Active trip",
      NotificationManager.IMPORTANCE_LOW
    )
    channel.description = "Shows active V3l0city trip speed and keeps live widgets updating."
    manager.createNotificationChannel(channel)
  }

  private fun canPostNotifications(context: Context): Boolean {
    return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
      ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
      PackageManager.PERMISSION_GRANTED
  }

  private fun notificationIcon(context: Context): Int {
    val icon = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
    return if (icon != 0) icon else android.R.drawable.ic_menu_compass
  }
}

private fun launchIntent(context: Context): PendingIntent? {
  val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
    ?.apply {
      addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
    ?: return null

  val flags = PendingIntent.FLAG_UPDATE_CURRENT or
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
  return PendingIntent.getActivity(context, 3007, intent, flags)
}
