package com.maestrorecorder.agent

import android.app.UiAutomation
import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.maestrorecorder.agent.uiautomator.ElementResolver
import org.junit.Test
import org.junit.runner.RunWith

private const val TAG = "RecorderInstr"

@RunWith(AndroidJUnit4::class)
class RecorderInstrumentation {

    @Test
    fun startServer() {
        Log.i(TAG, "step=getUiAutomation begin")
        val uiAutomation = InstrumentationRegistry.getInstrumentation()
            .getUiAutomation(UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES)
        Log.i(TAG, "step=getUiAutomation done")

        Log.i(TAG, "step=eventCollector.start begin")
        val eventCollector = EventCollector(uiAutomation)
        eventCollector.start()
        Log.i(TAG, "step=eventCollector.start done")

        Log.i(TAG, "step=elementResolver begin")
        val elementResolver = ElementResolver(uiAutomation) { eventCollector.applyServiceFlags() }
        Log.i(TAG, "step=elementResolver done")

        Log.i(TAG, "step=httpServer.start begin")
        val server = HttpServer(
            port = 50051,
            eventCollector = eventCollector,
            elementResolver = elementResolver,
        )
        server.start()
        Log.i(TAG, "step=httpServer.start done port=50051")
        println("MaestroRecorder agent started on port 50051")

        // Keep server running
        try {
            Thread.sleep(Long.MAX_VALUE)
        } catch (e: InterruptedException) {
            Log.i(TAG, "step=interrupted, stopping")
            eventCollector.stop()
            server.stop()
        }
    }
}
