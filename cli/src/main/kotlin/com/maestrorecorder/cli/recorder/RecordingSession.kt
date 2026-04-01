package com.maestrorecorder.cli.recorder

import com.maestrorecorder.cli.adb.AdbBridge
import com.maestrorecorder.cli.adb.DeviceManager
import com.maestrorecorder.cli.adb.InputDeviceDiscovery
import com.maestrorecorder.cli.generator.YamlGenerator
import com.maestrorecorder.cli.grpc.AgentClient
import com.maestrorecorder.cli.merger.EventMerger
import com.maestrorecorder.cli.parser.CoordinateConverter
import com.maestrorecorder.cli.parser.GeteventParser
import com.maestrorecorder.shared.models.MaestroCommand
import com.maestrorecorder.shared.models.TapOnSelector
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.io.path.writeText

class RecordingSession(private val config: SessionConfig) {

    private val adb = AdbBridge()
    private val deviceManager = DeviceManager(adb)
    private val running = AtomicBoolean(true)

    suspend fun start() {
        // 1. Device discovery
        val deviceSerial = config.deviceSerial ?: deviceManager.getConnectedDevice()
        printStatus("Connected to device: $deviceSerial")

        // 2. Get screen size
        val (screenWidth, screenHeight) = deviceManager.getScreenSize()
        printStatus("Screen size: ${screenWidth}x${screenHeight}")

        // 3. Discover touchscreen input device and ranges
        val inputDevice = InputDeviceDiscovery.discover(adb)
        printStatus("Touchscreen: ${inputDevice.devicePath} (max: ${inputDevice.maxX}x${inputDevice.maxY})")

        // 4. Set up port forwarding
        deviceManager.forwardPort(config.grpcPort, config.grpcPort)
        printStatus("Forwarding port: adb forward tcp:${config.grpcPort} tcp:${config.grpcPort}")

        // 5. Wait for GRPC agent to be ready
        val client = waitForAgent()
        printStatus("GRPC agent connected")

        // 6. Determine app ID
        val appId = config.appId ?: detectForegroundApp()
        printStatus("Target app: $appId")

        // 7. Create coordinate converter
        val converter = CoordinateConverter(
            inputMaxX = inputDevice.maxX,
            inputMaxY = inputDevice.maxY,
            screenWidth = screenWidth,
            screenHeight = screenHeight
        )

        // 8. Start getevent stream
        val (geteventFlow, geteventProcess) = adb.stream("shell", "getevent", "-lt", inputDevice.devicePath)

        // 9. Set up shutdown hook
        Runtime.getRuntime().addShutdownHook(Thread {
            running.set(false)
            geteventProcess.destroy()
        })

        // 10. Set up pipeline
        val parser = GeteventParser(converter, deviceFilter = inputDevice.devicePath)
        val merger = EventMerger(client)
        val commands = mutableListOf<MaestroCommand>(MaestroCommand.LaunchApp)

        printStatus("Recording... (press Ctrl+C to stop)\n")

        // 11. Collect merged commands
        try {
            merger.merge(parser.parse(geteventFlow)).collect { command ->
                commands.add(command)
                printAction(command)
            }
        } catch (_: CancellationException) {
            // Normal shutdown
        } catch (_: Exception) {
            // Stream ended (process destroyed)
        }

        // 12. Generate YAML
        val generator = YamlGenerator()
        val yaml = generator.generate(appId, commands)
        config.outputFile.writeText(yaml)

        // 13. Cleanup
        client.close()
        geteventProcess.destroy()
        deviceManager.removePortForward(config.grpcPort)

        printStatus("\nRecording stopped. ${commands.size} actions captured.")
        printStatus("Generated: ${config.outputFile}")
        printStatus("Run with: maestro test ${config.outputFile}")
    }

    private suspend fun waitForAgent(): AgentClient {
        repeat(10) { attempt ->
            try {
                val client = AgentClient(port = config.grpcPort)
                client.getDeviceInfo() // probe call
                return client
            } catch (_: Exception) {
                if (attempt < 9) {
                    delay(500)
                }
            }
        }
        throw IllegalStateException("Agent GRPC server did not start within 5 seconds. Make sure the agent is running.")
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

    private fun printAction(command: MaestroCommand) {
        val desc = when (command) {
            is MaestroCommand.LaunchApp -> "LAUNCH"
            is MaestroCommand.TapOn -> when (val s = command.selector) {
                is TapOnSelector.ById -> "TAP → id:${s.id}"
                is TapOnSelector.ByText -> "TAP → \"${s.text}\""
                is TapOnSelector.ByContentDescription -> "TAP → [${s.description}]"
                is TapOnSelector.ByPoint -> "TAP → (${s.x}, ${s.y})"
            }
            is MaestroCommand.InputText -> "INPUT → \"${command.text}\""
        }
        System.err.println("  $desc")
    }

    private fun printStatus(message: String) {
        System.err.println("▶ $message")
    }
}
