package com.maestrorecorder.dashboard.routes

import com.maestrorecorder.dashboard.session.DashboardState
import com.maestrorecorder.dashboard.session.ScrcpyProxy
import io.ktor.server.routing.*
import io.ktor.server.websocket.*
import io.ktor.websocket.*
import kotlinx.coroutines.*
import java.nio.ByteBuffer

/**
 * WebSocket-based screen mirroring using scrcpy protocol.
 *
 * Binary message format (both directions):
 *   bytes 0-3: channel ID as Int32BE (0 = video, 1 = control)
 *   bytes 4+:  payload
 *
 * Video frames (server → client): H.264 NAL units with frame metadata.
 * Control messages (client → server): scrcpy binary control messages (touch, key, etc).
 */
fun Route.screenRoutes(state: DashboardState) {

    webSocket("/mirror") {
        val deviceSerial = state.activeDevice

        val proxy = ScrcpyProxy(state.adb, deviceSerial)
        state.scrcpyProxy = proxy

        try {
            proxy.start()
        } catch (e: Exception) {
            close(CloseReason(CloseReason.Codes.INTERNAL_ERROR, "Failed to start scrcpy: ${e.message}"))
            return@webSocket
        }

        try {
            // Send device info as first text message
            send(Frame.Text("""{"device":"${proxy.deviceName}","width":${proxy.screenWidth},"height":${proxy.screenHeight}}"""))

            // Forward video stream → WebSocket (channel 0)
            val videoJob = launch(Dispatchers.IO) {
                val input = proxy.videoInput ?: return@launch
                val buf = ByteArray(65536)
                try {
                    while (isActive) {
                        val n = input.read(buf)
                        if (n < 0) break

                        val msg = ByteBuffer.allocate(4 + n)
                        msg.putInt(0) // channel 0 = video
                        msg.put(buf, 0, n)
                        msg.flip()

                        send(Frame.Binary(true, msg))
                    }
                } catch (_: Exception) {
                    // Stream ended
                }
            }

            // Forward control responses from device → WebSocket (channel 1)
            val controlReadJob = launch(Dispatchers.IO) {
                val input = proxy.controlInput ?: return@launch
                val buf = ByteArray(4096)
                try {
                    while (isActive) {
                        val n = input.read(buf)
                        if (n < 0) break

                        val msg = ByteBuffer.allocate(4 + n)
                        msg.putInt(1) // channel 1 = control
                        msg.put(buf, 0, n)
                        msg.flip()

                        send(Frame.Binary(true, msg))
                    }
                } catch (_: Exception) {
                    // Stream ended
                }
            }

            // Receive control messages from WebSocket → device
            for (frame in incoming) {
                if (frame is Frame.Binary) {
                    val data = frame.readBytes()
                    if (data.size < 4) continue

                    val channel = ByteBuffer.wrap(data, 0, 4).int
                    val payload = data.copyOfRange(4, data.size)

                    when (channel) {
                        1 -> {
                            // Control message → forward to device
                            proxy.controlOutput?.apply {
                                write(payload)
                                flush()
                            }
                        }
                    }
                }
            }

            videoJob.cancel()
            controlReadJob.cancel()
        } finally {
            proxy.stop()
            state.scrcpyProxy = null
        }
    }
}
