package com.maestrorecorder.agent

import android.accessibilityservice.AccessibilityServiceInfo
import android.app.UiAutomation
import android.graphics.Rect
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import org.json.JSONObject
import java.io.PipedInputStream
import java.io.PipedOutputStream
import java.util.concurrent.ConcurrentLinkedQueue

class EventCollector(private val uiAutomation: UiAutomation) {
    companion object {
        private const val TAG = "EventCollector"
    }

    private val eventQueue = ConcurrentLinkedQueue<String>()
    private var streaming = false

    // Pipe for chunked HTTP streaming
    private var pipedOut: PipedOutputStream? = null
    private var pipedIn: PipedInputStream? = null

    // Hold strong reference to prevent GC
    private val listener = UiAutomation.OnAccessibilityEventListener { event ->
        onAccessibilityEvent(event)
    }

    fun start() {
        Log.i(TAG, "Starting accessibility event listener")

        // Configure to receive all event types
        val info = uiAutomation.serviceInfo
        info.eventTypes = AccessibilityEvent.TYPES_ALL_MASK
        info.feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
        info.flags = info.flags or
            AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS or
            AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS or
            AccessibilityServiceInfo.FLAG_REQUEST_TOUCH_EXPLORATION_MODE.inv() // don't enable touch exploration
        info.notificationTimeout = 0
        uiAutomation.serviceInfo = info

        uiAutomation.setOnAccessibilityEventListener(listener)
        Log.i(TAG, "Listener registered, serviceInfo eventTypes=${info.eventTypes}")
    }

    private fun onAccessibilityEvent(event: AccessibilityEvent) {
        try {
            val json = convertEvent(event) ?: return
            val line = json.toString() + "\n"

            // Write to pipe for streaming
            pipedOut?.let { out ->
                try {
                    out.write(line.toByteArray())
                    out.flush()
                } catch (e: Exception) {
                    Log.w(TAG, "Pipe write failed: ${e.message}")
                }
            }

            // Also queue for polling
            eventQueue.add(json.toString())
            // Keep queue bounded
            while (eventQueue.size > 200) eventQueue.poll()

        } catch (e: Exception) {
            Log.e(TAG, "Error processing event", e)
        }
    }

    fun stop() {
        uiAutomation.setOnAccessibilityEventListener(null)
        closePipe()
    }

    /** Create a new pipe and return the input stream for HTTP chunked response */
    fun createStream(): PipedInputStream {
        closePipe()
        pipedOut = PipedOutputStream()
        pipedIn = PipedInputStream(pipedOut!!, 65536)
        streaming = true
        return pipedIn!!
    }

    /** Close the streaming pipe */
    fun closePipe() {
        streaming = false
        try { pipedOut?.close() } catch (_: Exception) {}
        try { pipedIn?.close() } catch (_: Exception) {}
        pipedOut = null
        pipedIn = null
    }

    /** Drain queued events (for polling fallback) */
    fun drainEvents(): List<String> {
        val result = mutableListOf<String>()
        while (true) {
            val event = eventQueue.poll() ?: break
            result.add(event)
        }
        return result
    }

    private fun convertEvent(event: AccessibilityEvent): JSONObject? {
        val type = when (event.eventType) {
            AccessibilityEvent.TYPE_VIEW_CLICKED -> "click"
            AccessibilityEvent.TYPE_VIEW_LONG_CLICKED -> "longClick"
            AccessibilityEvent.TYPE_VIEW_SCROLLED -> "scroll"
            AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED -> "textChanged"
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> "windowChanged"
            else -> return null // Skip other event types
        }

        val json = JSONObject()
        json.put("type", type)
        json.put("timestamp", event.eventTime)

        // Element info from the event source
        val source = event.source
        if (source != null) {
            json.put("text", source.text?.toString() ?: event.text?.joinToString("") ?: "")
            json.put("resourceId", source.viewIdResourceName ?: "")
            json.put("contentDescription", source.contentDescription?.toString() ?: "")
            json.put("className", source.className?.toString() ?: event.className?.toString() ?: "")

            val bounds = Rect()
            source.getBoundsInScreen(bounds)
            json.put("bounds", JSONObject()
                .put("left", bounds.left)
                .put("top", bounds.top)
                .put("right", bounds.right)
                .put("bottom", bounds.bottom))

            json.put("clickable", source.isClickable)
            json.put("enabled", source.isEnabled)
            json.put("focused", source.isFocused)

            source.recycle()
        } else {
            // Fallback to event-level data
            json.put("text", event.text?.joinToString("") ?: "")
            json.put("className", event.className?.toString() ?: "")
        }

        // Extra data for specific event types
        if (type == "textChanged") {
            json.put("beforeText", event.beforeText?.toString() ?: "")
        }

        if (type == "scroll") {
            json.put("scrollX", event.scrollX)
            json.put("scrollY", event.scrollY)
            json.put("maxScrollX", event.maxScrollX)
            json.put("maxScrollY", event.maxScrollY)
        }

        if (type == "windowChanged") {
            json.put("packageName", event.packageName?.toString() ?: "")
        }

        Log.d(TAG, "Event: $type - ${json.optString("text", "")}")
        return json
    }
}
