package com.maestrorecorder.agent

import android.app.UiAutomation
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.maestrorecorder.agent.uiautomator.ElementResolver
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class RecorderInstrumentation {

    @Test
    fun startServer() {
        val uiAutomation = InstrumentationRegistry.getInstrumentation()
            .getUiAutomation(UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES)

        val eventCollector = EventCollector(uiAutomation)
        eventCollector.start()

        val elementResolver = ElementResolver(uiAutomation)

        val server = HttpServer(
            port = 50051,
            eventCollector = eventCollector,
            elementResolver = elementResolver,
        )
        server.start()
        println("MaestroRecorder agent started on port 50051")

        // Keep server running
        try {
            Thread.sleep(Long.MAX_VALUE)
        } catch (e: InterruptedException) {
            eventCollector.stop()
            server.stop()
        }
    }
}
