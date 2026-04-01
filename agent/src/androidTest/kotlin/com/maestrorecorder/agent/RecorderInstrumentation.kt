package com.maestrorecorder.agent

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class RecorderInstrumentation {

    @Test
    fun startServer() {
        val server = HttpServer(port = 50051)
        server.start()
        println("MaestroRecorder agent HTTP server started on port 50051")

        // Keep server running
        try {
            Thread.sleep(Long.MAX_VALUE)
        } catch (e: InterruptedException) {
            server.stop()
        }
    }
}
