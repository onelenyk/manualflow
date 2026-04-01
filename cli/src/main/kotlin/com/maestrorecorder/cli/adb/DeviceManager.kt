package com.maestrorecorder.cli.adb

class DeviceManager(private val adb: AdbBridge) {

    suspend fun getConnectedDevice(): String {
        val output = adb.exec("devices")
        val devices = output.lines()
            .drop(1) // skip "List of devices attached" header
            .filter { it.contains("\tdevice") }
            .map { it.split("\t").first() }

        return when {
            devices.isEmpty() -> throw AdbException("No devices connected. Connect a device or start an emulator.")
            devices.size > 1 -> throw AdbException(
                "Multiple devices connected: ${devices.joinToString()}. Use -d to specify a device serial."
            )
            else -> devices.first()
        }
    }

    suspend fun installAgent(apkPath: String) {
        adb.exec("install", "-r", "-t", apkPath)
    }

    fun startInstrumentation(): Process {
        return adb.startProcess(
            "shell", "am", "instrument", "-w",
            "com.maestrorecorder.agent.test/androidx.test.runner.AndroidJUnitRunner"
        )
    }

    suspend fun forwardPort(hostPort: Int = 50051, devicePort: Int = 50051) {
        adb.exec("forward", "tcp:$hostPort", "tcp:$devicePort")
    }

    suspend fun removePortForward(hostPort: Int = 50051) {
        try {
            adb.exec("forward", "--remove", "tcp:$hostPort")
        } catch (_: AdbException) {
            // Ignore if forward was already removed
        }
    }

    suspend fun getScreenSize(): Pair<Int, Int> {
        val output = adb.exec("shell", "wm", "size")
        // Output: "Physical size: 1080x2400"
        val match = Regex("""(\d+)x(\d+)""").find(output)
            ?: throw AdbException("Could not parse screen size from: $output")
        return match.groupValues[1].toInt() to match.groupValues[2].toInt()
    }
}
