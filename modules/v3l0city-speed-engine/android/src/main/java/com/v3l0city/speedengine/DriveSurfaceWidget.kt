package com.v3l0city.speedengine

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject

private const val DRIVE_SURFACE_PREFS = "v3l0city_drive_surface"
private const val DRIVE_SURFACE_SNAPSHOT_KEY = "driveSurfaceSnapshot"
private const val DRIVE_SURFACE_STALE_AFTER_MS = 5000L
private const val DRIVE_NOTIFICATION_CHANNEL_ID = "v3l0city_drive_surface"
private const val DRIVE_NOTIFICATION_ID = 3007

internal object DriveSurfaceStore {
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
      .apply()

    V3l0cityDriveWidgetRenderer.updateAll(context)
    DriveSurfaceNotification.cancel(context)
  }

  fun read(context: Context): JSONObject? {
    val value = context.getSharedPreferences(DRIVE_SURFACE_PREFS, Context.MODE_PRIVATE)
      .getString(DRIVE_SURFACE_SNAPSHOT_KEY, null)
      ?: return null

    return runCatching { JSONObject(value) }.getOrNull()
  }
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
    val views = RemoteViews(context.packageName, R.layout.v3l0city_drive_widget)

    views.setTextViewText(R.id.driveWidgetSpeed, if (isStale) "--" else snapshot?.optString("speedText", "--"))
    views.setTextViewText(R.id.driveWidgetUnits, if (isStale) "" else snapshot?.optString("units", "MPH"))
    views.setTextViewText(R.id.driveWidgetDistance, if (isStale) "--" else snapshot?.optString("distanceText", "--"))
    views.setTextViewText(R.id.driveWidgetElapsed, if (isStale) "--" else snapshot?.optString("elapsedText", "--"))
    views.setTextViewText(
      R.id.driveWidgetStatus,
      if (isStale) "Open V3l0city to start tracking" else statusText(snapshot)
    )
    views.setTextColor(R.id.driveWidgetSignalDot, signalColor(snapshot, isStale))
    launchIntent(context)?.let { views.setOnClickPendingIntent(R.id.driveWidgetRoot, it) }

    manager.updateAppWidget(widgetId, views)
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
    val notification = NotificationCompat.Builder(context, DRIVE_NOTIFICATION_CHANNEL_ID)
      .setSmallIcon(notificationIcon(context))
      .setContentTitle("V3l0city active trip")
      .setContentText(
        "${snapshot.optString("speedText", "--")} ${snapshot.optString("units", "")} • " +
          "${snapshot.optString("distanceText", "--")} • ${snapshot.optString("elapsedText", "--")}"
      )
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setColor(0xFF00E5FF.toInt())
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setContentIntent(launchIntent(context))
      .build()

    NotificationManagerCompat.from(context).notify(DRIVE_NOTIFICATION_ID, notification)
  }

  fun cancel(context: Context) {
    NotificationManagerCompat.from(context).cancel(DRIVE_NOTIFICATION_ID)
  }

  private fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val channel = NotificationChannel(
      DRIVE_NOTIFICATION_CHANNEL_ID,
      "Active trip",
      NotificationManager.IMPORTANCE_LOW
    )
    channel.description = "Shows active V3l0city trip speed while the app is running."
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
