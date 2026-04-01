package com.maestrorecorder.agent.uiautomator

import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.UiDevice

data class DeviceInfo(
    val screenWidth: Int,
    val screenHeight: Int,
    val density: Int
)

class DeviceInfoProvider {

    private val device: UiDevice by lazy {
        UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
    }

    fun getInfo(): DeviceInfo {
        val metrics = InstrumentationRegistry.getInstrumentation()
            .targetContext.resources.displayMetrics

        return DeviceInfo(
            screenWidth = device.displayWidth,
            screenHeight = device.displayHeight,
            density = metrics.densityDpi
        )
    }
}
