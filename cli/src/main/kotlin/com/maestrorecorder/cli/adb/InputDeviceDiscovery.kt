package com.maestrorecorder.cli.adb

data class InputDeviceInfo(
    val devicePath: String,
    val maxX: Int,
    val maxY: Int
)

object InputDeviceDiscovery {

    suspend fun discover(adb: AdbBridge): InputDeviceInfo {
        val output = adb.exec("shell", "getevent", "-lp")
        return parseGeteventLp(output)
    }

    internal fun parseGeteventLp(output: String): InputDeviceInfo {
        var currentDevice: String? = null
        var hasPositionX = false
        var maxX = 0
        var maxY = 0

        val deviceRegex = Regex("""add device \d+:\s+(/dev/input/event\d+)""")
        val absRegex = Regex("""(ABS_MT_POSITION_[XY])\s*.*max\s+(\d+)""")

        for (line in output.lines()) {
            val deviceMatch = deviceRegex.find(line)
            if (deviceMatch != null) {
                // If previous device had touch, return it
                if (hasPositionX && currentDevice != null) {
                    return InputDeviceInfo(currentDevice, maxX, maxY)
                }
                currentDevice = deviceMatch.groupValues[1]
                hasPositionX = false
                maxX = 0
                maxY = 0
                continue
            }

            val absMatch = absRegex.find(line)
            if (absMatch != null && currentDevice != null) {
                val code = absMatch.groupValues[1]
                val max = absMatch.groupValues[2].toInt()
                when (code) {
                    "ABS_MT_POSITION_X" -> {
                        hasPositionX = true
                        maxX = max
                    }
                    "ABS_MT_POSITION_Y" -> {
                        maxY = max
                    }
                }
            }
        }

        // Check last device
        if (hasPositionX && currentDevice != null) {
            return InputDeviceInfo(currentDevice, maxX, maxY)
        }

        throw AdbException("No touchscreen input device found")
    }
}
