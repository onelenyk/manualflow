package com.maestrorecorder.dashboard.session

import com.maestrorecorder.cli.adb.AdbBridge
import com.maestrorecorder.cli.adb.DeviceManager
import com.maestrorecorder.cli.adb.InputDeviceDiscovery
import com.maestrorecorder.cli.generator.YamlGenerator
import com.maestrorecorder.cli.grpc.AgentClient
import com.maestrorecorder.cli.merger.EventMerger
import com.maestrorecorder.cli.parser.CoordinateConverter
import com.maestrorecorder.cli.parser.GeteventParser
import com.maestrorecorder.cli.recorder.SessionConfig
import com.maestrorecorder.shared.models.MaestroCommand
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow

class DashboardRecordingSession(
    private val config: SessionConfig,
    private val adb: AdbBridge,
    private val deviceManager: DeviceManager
) {
    private val _commands = MutableSharedFlow<MaestroCommand>(replay = 100)
    val commands: SharedFlow<MaestroCommand> = _commands

    private val _state = MutableStateFlow<SessionState>(SessionState.Idle)
    val state: StateFlow<SessionState> = _state

    private val _collectedCommands = mutableListOf<MaestroCommand>()
    val collectedCommands: List<MaestroCommand> get() = _collectedCommands.toList()

    private var geteventProcess: Process? = null
    private var client: AgentClient? = null
    private var recordingJob: Job? = null
    private var startTimeMs: Long = 0

    val durationMs: Long get() = if (startTimeMs > 0) System.currentTimeMillis() - startTimeMs else 0

    suspend fun start(scope: CoroutineScope) {
        _state.value = SessionState.Recording
        startTimeMs = System.currentTimeMillis()

        // Setup device
        val (screenWidth, screenHeight) = deviceManager.getScreenSize()
        val inputDevice = InputDeviceDiscovery.discover(adb)

        deviceManager.forwardPort(config.grpcPort, config.grpcPort)
        client = AgentClient(port = config.grpcPort)

        val appId = config.appId ?: detectForegroundApp()

        val converter = CoordinateConverter(
            inputMaxX = inputDevice.maxX,
            inputMaxY = inputDevice.maxY,
            screenWidth = screenWidth,
            screenHeight = screenHeight
        )

        // Start getevent stream
        val (geteventFlow, process) = adb.stream("shell", "getevent", "-lt", inputDevice.devicePath)
        geteventProcess = process

        // Pipeline
        val parser = GeteventParser(converter, deviceFilter = inputDevice.devicePath)
        val merger = EventMerger(client!!)

        // Add LaunchApp as first command
        val launchCmd = MaestroCommand.LaunchApp
        _collectedCommands.add(launchCmd)
        _commands.emit(launchCmd)

        // Collect in a coroutine
        recordingJob = scope.launch {
            try {
                merger.merge(parser.parse(geteventFlow)).collect { command ->
                    _collectedCommands.add(command)
                    _commands.emit(command)
                }
            } catch (_: CancellationException) {
                // Normal shutdown
            } catch (_: Exception) {
                // Stream ended
            }
        }
    }

    fun stop(): String {
        _state.value = SessionState.Stopping

        geteventProcess?.destroy()
        recordingJob?.cancel()

        val generator = YamlGenerator()
        val appId = config.appId ?: "com.unknown.app"
        val yaml = generator.generate(appId, _collectedCommands)

        client?.close()
        _state.value = SessionState.Idle

        return yaml
    }

    private suspend fun detectForegroundApp(): String {
        return try {
            val output = adb.exec("shell", "dumpsys", "activity", "activities")
            val regex = Regex("""mResumedActivity.*?(\S+)/""")
            regex.find(output)?.groupValues?.get(1) ?: "com.unknown.app"
        } catch (_: Exception) {
            "com.unknown.app"
        }
    }
}
