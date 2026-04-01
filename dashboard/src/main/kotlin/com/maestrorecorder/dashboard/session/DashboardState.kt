package com.maestrorecorder.dashboard.session

import com.maestrorecorder.cli.adb.AdbBridge
import com.maestrorecorder.cli.adb.DeviceManager
import com.maestrorecorder.cli.grpc.AgentClient

class DashboardState {
    val adb = AdbBridge()
    val deviceManager = DeviceManager(adb)

    var activeDevice: String? = null
    var recordingSession: DashboardRecordingSession? = null
    var screenStreamer: ScreenStreamer? = null
    var scrcpyProxy: ScrcpyProxy? = null
    var agentClient: AgentClient? = null

    fun cleanup() {
        recordingSession?.stop()
        screenStreamer?.stop()
        scrcpyProxy?.stop()
        agentClient?.close()
    }
}
