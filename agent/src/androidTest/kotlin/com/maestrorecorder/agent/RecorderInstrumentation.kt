package com.maestrorecorder.agent

import android.app.UiAutomation
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class RecorderInstrumentation {

    @Test
    fun startServer() {
        // Use FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES to receive events
        // even when other accessibility services are running
        val uiAutomation = InstrumentationRegistry.getInstrumentation()
            .getUiAutomation(UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES)

        val eventCollector = EventCollector(uiAutomation)
        eventCollector.start()

        val server = HttpServer(port = 50051, eventCollector = eventCollector)
        server.start()
        println("MaestroRecorder agent started on port 50051 (with event collector)")

        // Keep server running
        try {
            Thread.sleep(Long.MAX_VALUE)
        } catch (e: InterruptedException) {
            eventCollector.stop()
            server.stop()
        }
    }
}
