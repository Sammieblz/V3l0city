package com.v3l0city.speedengine

import android.content.Context
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val SPEED_UPDATE_EVENT = "speedUpdate"
private const val SPEED_ERROR_EVENT = "speedError"

class V3l0citySpeedEngineModule : Module() {
  private lateinit var context: Context

  private val bridgeListener = object : LiveDriveSessionListener {
    override fun onSpeedUpdate(state: Map<String, Any?>) {
      sendEvent(SPEED_UPDATE_EVENT, state)
    }

    override fun onSpeedError(code: String, message: String, recoverable: Boolean) {
      sendEvent(
        SPEED_ERROR_EVENT,
        mapOf(
          "code" to code,
          "message" to message,
          "recoverable" to recoverable
        )
      )
    }
  }

  override fun definition() = ModuleDefinition {
    Name("V3l0citySpeedEngine")

    Events(SPEED_UPDATE_EVENT, SPEED_ERROR_EVENT)

    OnCreate {
      context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      LiveDriveSessionManager.ensureInitialized(context)
    }

    AsyncFunction("start") { options: Map<String, Any?> ->
      LiveDriveSessionManager.startDashboard(context, options, bridgeListener)
    }

    AsyncFunction("stop") {
      LiveDriveSessionManager.stopDashboard(bridgeListener)
    }

    AsyncFunction("reset") {
      LiveDriveSessionManager.reset(bridgeListener)
    }

    AsyncFunction("setTripAccumulation") { active: Boolean ->
      LiveDriveSessionManager.setTripAccumulation(active)
    }

    AsyncFunction("setMountOffsetDegrees") { value: Double ->
      LiveDriveSessionManager.setMountOffsetDegrees(value)
    }

    AsyncFunction("writeDriveSurfaceSnapshot") { snapshot: Map<String, Any?> ->
      LiveDriveSessionManager.writeDriveSurfaceSnapshot(context, snapshot)
    }

    AsyncFunction("clearDriveSurfaceSnapshot") {
      LiveDriveSessionManager.clearDriveSurfaceSnapshot(context)
    }

    AsyncFunction("startLiveDriveSession") { snapshot: Map<String, Any?> ->
      LiveDriveSessionManager.startLiveSession(context, snapshot)
    }

    AsyncFunction("updateLiveDriveSession") { snapshot: Map<String, Any?> ->
      LiveDriveSessionManager.updateLiveSession(context, snapshot)
    }

    AsyncFunction("stopLiveDriveSession") { snapshot: Map<String, Any?> ->
      LiveDriveSessionManager.stopLiveSession(context, snapshot)
    }

    AsyncFunction("getLiveDriveSessionStatus") {
      LiveDriveSessionManager.getStatus(context)
    }

    AsyncFunction("startTripLiveActivity") { _: Map<String, Any?> ->
      // iOS-only. Android car-facing surfaces are the widget and active-trip notification.
    }

    AsyncFunction("updateTripLiveActivity") { _: Map<String, Any?> ->
      // iOS-only. Android car-facing surfaces are the widget and active-trip notification.
    }

    AsyncFunction("endTripLiveActivity") { _: Map<String, Any?> ->
      // iOS-only. Android car-facing surfaces are the widget and active-trip notification.
    }

    OnActivityEntersBackground {
      // The native manager and foreground service own active-trip tracking.
      // Backgrounding the React screen must not stop live widgets.
    }

    OnDestroy {
      LiveDriveSessionManager.stopDashboard(bridgeListener)
    }
  }
}
