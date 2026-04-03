package com.maestrorecorder.agent.uiautomator

import android.util.DisplayMetrics
import androidx.test.platform.app.InstrumentationRegistry

data class DeviceInfo(
    val screenWidth: Int,
    val screenHeight: Int,
    val density: Int
)

class DeviceInfoProvider {

    fun getInfo(): DeviceInfo {
        val metrics = InstrumentationRegistry.getInstrumentation()
            .targetContext.resources.displayMetrics

        return DeviceInfo(
            screenWidth = metrics.widthPixels,
            screenHeight = metrics.heightPixels,
            density = metrics.densityDpi
        )
    }
}
