package com.maestrorecorder.dashboard.session

import com.maestrorecorder.cli.adb.AdbBridge
import kotlinx.coroutines.*
import java.io.InputStream
import java.io.OutputStream
import java.net.Socket

class ScrcpyProxy(
    private val adb: AdbBridge,
    private val deviceSerial: String? = null
) {
    companion object {
        private const val SCRCPY_SERVER_PATH = "/data/local/tmp/scrcpy-server.jar"
        private const val SCRCPY_VERSION = "3.1"
        private const val LOCAL_PORT = 27183
        private const val DEVICE_SOCKET_NAME = "scrcpy"
    }

    private var serverProcess: Process? = null
    private var videoSocket: Socket? = null
    private var controlSocket: Socket? = null

    val videoInput: InputStream? get() = videoSocket?.getInputStream()
    val controlInput: InputStream? get() = controlSocket?.getInputStream()
    val controlOutput: OutputStream? get() = controlSocket?.getOutputStream()

    var deviceName: String = "unknown"
        private set
    var screenWidth: Int = 0
        private set
    var screenHeight: Int = 0
        private set

    suspend fun start(
        maxSize: Int = 1024,
        bitRate: Int = 4_000_000,
        maxFps: Int = 30
    ) = withContext(Dispatchers.IO) {
        pushServer()
        setupPortForward()
        startServer(maxSize, bitRate, maxFps)

        // scrcpy-server opens a local socket; give it time to start
        delay(1000)

        connectSockets()
        readDeviceInfoAsync()
    }

    fun stop() {
        runCatching { videoSocket?.close() }
        runCatching { controlSocket?.close() }
        runCatching { serverProcess?.destroy() }
        runCatching {
            // Remove port forward
            adb.startProcess(*adbArgs("forward", "--remove", "tcp:$LOCAL_PORT")).waitFor()
        }
        videoSocket = null
        controlSocket = null
        serverProcess = null
    }

    private suspend fun pushServer() {
        val jarStream = javaClass.classLoader.getResourceAsStream("scrcpy-server.jar")
            ?: throw IllegalStateException("scrcpy-server.jar not found in resources")

        val tmpFile = kotlin.io.path.createTempFile("scrcpy-server", ".jar").toFile()
        try {
            tmpFile.outputStream().use { out -> jarStream.copyTo(out) }
            adb.exec(*adbArgs("push", tmpFile.absolutePath, SCRCPY_SERVER_PATH))
        } finally {
            tmpFile.delete()
        }
    }

    private suspend fun setupPortForward() {
        adb.exec(*adbArgs("forward", "tcp:$LOCAL_PORT", "localabstract:$DEVICE_SOCKET_NAME"))
    }

    private fun startServer(maxSize: Int, bitRate: Int, maxFps: Int) {
        serverProcess = adb.startProcess(
            *adbArgs(
                "shell",
                "CLASSPATH=$SCRCPY_SERVER_PATH",
                "app_process", "/",
                "com.genymobile.scrcpy.Server",
                SCRCPY_VERSION,
                "tunnel_forward=true",
                "video=true",
                "audio=false",
                "control=true",
                "max_size=$maxSize",
                "video_bit_rate=$bitRate",
                "max_fps=$maxFps",
                "video_codec=h264",
                "send_frame_meta=true"
            )
        )
    }

    private fun connectSockets() {
        // scrcpy protocol: first connection = video, second = control
        videoSocket = Socket("127.0.0.1", LOCAL_PORT).apply {
            tcpNoDelay = true
        }
        controlSocket = Socket("127.0.0.1", LOCAL_PORT).apply {
            tcpNoDelay = true
        }
    }

    private suspend fun readDeviceInfoAsync() = withContext(Dispatchers.IO) {
        val input = videoSocket?.getInputStream() ?: return@withContext

        // scrcpy sends a dummy byte first on the video socket
        input.read()

        // Then 64 bytes of device name (UTF-8, null-padded)
        val nameBytes = ByteArray(64)
        var read = 0
        while (read < 64) {
            val n = input.read(nameBytes, read, 64 - read)
            if (n < 0) break
            read += n
        }
        deviceName = String(nameBytes).trimEnd('\u0000')

        // Get screen dimensions from device via ADB
        try {
            val output = adb.exec(*adbArgs("shell", "wm", "size")).trim()
            // Output format: "Physical size: 1080x1920" or just "1080x1920"
            val regex = """(\d+)x(\d+)""".toRegex()
            val match = regex.find(output)
            if (match != null) {
                screenWidth = match.groupValues[1].toInt()
                screenHeight = match.groupValues[2].toInt()
            }
        } catch (e: Exception) {
            // Fallback to defaults
            screenWidth = 1080
            screenHeight = 1920
        }

        // Then video stream begins (with send_frame_meta enabled, each frame has metadata prefix)
    }

    /**
     * Build ADB args with optional -s serial prefix.
     * These are passed to AdbBridge which internally prepends the adb binary path.
     */
    private fun adbArgs(vararg args: String): Array<String> {
        return if (deviceSerial != null) {
            arrayOf("-s", deviceSerial, *args)
        } else {
            arrayOf(*args)
        }
    }
}
