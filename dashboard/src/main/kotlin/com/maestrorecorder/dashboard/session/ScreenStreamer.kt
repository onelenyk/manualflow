package com.maestrorecorder.dashboard.session

import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import java.awt.image.BufferedImage
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import javax.imageio.IIOImage
import javax.imageio.ImageIO
import javax.imageio.ImageWriteParam

class ScreenStreamer(
    private val adbPath: String = "adb",
    private val intervalMs: Long = 250
) {
    private val _frames = MutableSharedFlow<ByteArray>(replay = 1)
    val frames: SharedFlow<ByteArray> = _frames

    private var job: Job? = null

    fun start(scope: CoroutineScope) {
        job = scope.launch(Dispatchers.IO) {
            while (isActive) {
                try {
                    val frame = captureFrame()
                    if (frame != null) {
                        _frames.emit(frame)
                    }
                } catch (_: Exception) {
                    // Skip frame on error
                }
                delay(intervalMs)
            }
        }
    }

    fun stop() {
        job?.cancel()
        job = null
    }

    private fun captureFrame(): ByteArray? {
        val process = ProcessBuilder(adbPath, "exec-out", "screencap", "-p")
            .redirectErrorStream(false)
            .start()

        val pngBytes = process.inputStream.readBytes()
        process.waitFor()

        if (pngBytes.isEmpty()) return null

        return convertToJpeg(pngBytes)
    }

    private fun convertToJpeg(pngBytes: ByteArray): ByteArray {
        val image: BufferedImage = ImageIO.read(ByteArrayInputStream(pngBytes)) ?: return pngBytes
        val output = ByteArrayOutputStream()

        val writer = ImageIO.getImageWritersByFormatName("jpeg").next()
        val param = writer.defaultWriteParam.apply {
            compressionMode = ImageWriteParam.MODE_EXPLICIT
            compressionQuality = 0.6f
        }

        writer.output = ImageIO.createImageOutputStream(output)
        writer.write(null, IIOImage(image, null, null), param)
        writer.dispose()

        return output.toByteArray()
    }
}
