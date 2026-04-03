package com.maestrorecorder.agent

import android.accessibilityservice.AccessibilityServiceInfo
import android.app.UiAutomation
import android.graphics.Rect
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONObject
import java.io.PipedInputStream
import java.io.PipedOutputStream
import java.util.concurrent.ConcurrentLinkedQueue

class EventCollector(private val uiAutomation: UiAutomation) {
    companion object {
        private const val TAG = "EventCollector"
    }

    private val eventQueue = ConcurrentLinkedQueue<String>()

    private var pipedOut: PipedOutputStream? = null
    private var pipedIn: PipedInputStream? = null

    // Track scroll positions for direction detection
    private val lastScrollY = mutableMapOf<String, Int>()
    private val lastScrollX = mutableMapOf<String, Int>()

    private val listener = UiAutomation.OnAccessibilityEventListener { event ->
        onAccessibilityEvent(event)
    }

    fun start() {
        Log.i(TAG, "Starting accessibility event listener")
        applyServiceFlags()
        uiAutomation.setOnAccessibilityEventListener(listener)
        Log.i(TAG, "Listener registered")
    }

    /** Re-apply our service flags (call after anything that might reset them, like UiDevice) */
    fun applyServiceFlags() {
        try {
            val info = uiAutomation.serviceInfo
            info.eventTypes = AccessibilityEvent.TYPES_ALL_MASK
            info.feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            info.flags = info.flags or
                AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS or
                AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS
            info.notificationTimeout = 0
            uiAutomation.serviceInfo = info
        } catch (e: Exception) {
            Log.w(TAG, "Failed to apply service flags: ${e.message}")
        }
    }

    fun stop() {
        uiAutomation.setOnAccessibilityEventListener(null)
        closePipe()
    }

    fun createStream(): PipedInputStream {
        closePipe()
        pipedOut = PipedOutputStream()
        pipedIn = PipedInputStream(pipedOut!!, 65536)
        return pipedIn!!
    }

    fun closePipe() {
        try { pipedOut?.close() } catch (_: Exception) {}
        try { pipedIn?.close() } catch (_: Exception) {}
        pipedOut = null
        pipedIn = null
    }

    fun drainEvents(): List<String> {
        val result = mutableListOf<String>()
        while (true) {
            val event = eventQueue.poll() ?: break
            result.add(event)
        }
        return result
    }

    private fun onAccessibilityEvent(event: AccessibilityEvent) {
        try {
            val json = convertEvent(event) ?: return
            val line = json.toString() + "\n"

            pipedOut?.let { out ->
                try {
                    out.write(line.toByteArray())
                    out.flush()
                } catch (e: Exception) {
                    Log.w(TAG, "Pipe write failed, closing pipe: ${e.message}")
                    closePipe() // Auto-close broken pipe, allow reconnection
                }
            }

            eventQueue.add(json.toString())
            while (eventQueue.size > 200) eventQueue.poll()

        } catch (e: Exception) {
            Log.e(TAG, "Error processing event", e)
        }
    }

    private fun convertEvent(event: AccessibilityEvent): JSONObject? {
        val type = when (event.eventType) {
            AccessibilityEvent.TYPE_VIEW_CLICKED -> "click"
            AccessibilityEvent.TYPE_VIEW_LONG_CLICKED -> "longClick"
            AccessibilityEvent.TYPE_VIEW_SCROLLED -> "scroll"
            AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED -> "textChanged"
            AccessibilityEvent.TYPE_VIEW_SELECTED -> "selected"
            AccessibilityEvent.TYPE_VIEW_FOCUSED -> "focused"
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> "windowChanged"
            AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED -> "contentChanged"
            AccessibilityEvent.TYPE_VIEW_TEXT_SELECTION_CHANGED -> "textSelection"
            else -> return null
        }

        // Skip noisy contentChanged events (fires on every frame)
        if (type == "contentChanged") {
            // Only keep if it's a meaningful content change (new text, structure change)
            val contentChangeTypes = event.contentChangeTypes
            if (contentChangeTypes != 0 &&
                contentChangeTypes and AccessibilityEvent.CONTENT_CHANGE_TYPE_TEXT == 0 &&
                contentChangeTypes and AccessibilityEvent.CONTENT_CHANGE_TYPE_SUBTREE == 0) {
                return null
            }
            // Still skip most contentChanged — too noisy
            return null
        }

        // Skip focused events on non-interactive views
        if (type == "focused") {
            val source = event.source
            if (source != null) {
                val isInput = source.className?.toString()?.let {
                    it.contains("EditText") || it.contains("TextField") || it.contains("SearchView")
                } ?: false
                source.recycle()
                if (!isInput) return null
            } else {
                return null
            }
        }

        val json = JSONObject()
        json.put("type", type)
        json.put("timestamp", event.eventTime)
        json.put("packageName", event.packageName?.toString() ?: "")

        val source = event.source
        if (source != null) {
            extractNodeInfo(source, json)
            source.recycle()
        } else {
            json.put("text", event.text?.joinToString("") ?: "")
            json.put("className", event.className?.toString() ?: "")
        }

        // Scroll direction detection
        if (type == "scroll") {
            val scrollKey = json.optString("resourceId", "") + json.optString("className", "")
            val prevY = lastScrollY[scrollKey]
            val prevX = lastScrollX[scrollKey]
            val curY = event.scrollY
            val curX = event.scrollX

            if (prevY != null) {
                val direction = when {
                    curY > prevY -> "down"
                    curY < prevY -> "up"
                    curX > (prevX ?: 0) -> "right"
                    curX < (prevX ?: 0) -> "left"
                    else -> "unknown"
                }
                json.put("direction", direction)
            }

            lastScrollY[scrollKey] = curY
            lastScrollX[scrollKey] = curX
            json.put("scrollX", curX)
            json.put("scrollY", curY)
            json.put("maxScrollX", event.maxScrollX)
            json.put("maxScrollY", event.maxScrollY)
            json.put("fromIndex", event.fromIndex)
            json.put("toIndex", event.toIndex)
            json.put("itemCount", event.itemCount)
        }

        if (type == "textChanged") {
            json.put("beforeText", event.beforeText?.toString() ?: "")
            json.put("addedCount", event.addedCount)
            json.put("removedCount", event.removedCount)
        }

        Log.d(TAG, "Event: $type - ${json.optString("text", "").take(40)}")
        return json
    }

    private fun extractNodeInfo(node: AccessibilityNodeInfo, json: JSONObject) {
        json.put("text", node.text?.toString() ?: "")
        json.put("className", node.className?.toString() ?: "")
        json.put("contentDescription", node.contentDescription?.toString() ?: "")
        json.put("clickable", node.isClickable)
        json.put("enabled", node.isEnabled)
        json.put("focused", node.isFocused)
        json.put("checkable", node.isCheckable)
        json.put("checked", node.isChecked)
        json.put("editable", node.isEditable)
        json.put("scrollable", node.isScrollable)

        // Resource ID (works for Views with android:id and Compose testTag)
        json.put("resourceId", node.viewIdResourceName ?: "")

        // Bounds
        val bounds = Rect()
        node.getBoundsInScreen(bounds)
        json.put("bounds", JSONObject()
            .put("left", bounds.left)
            .put("top", bounds.top)
            .put("right", bounds.right)
            .put("bottom", bounds.bottom))

        // Extras — Compose puts data here (stateDescription, roleDescription, etc.)
        node.extras?.let { extras ->
            if (!extras.isEmpty) {
                val extrasJson = JSONObject()
                for (key in extras.keySet()) {
                    extrasJson.put(key, extras.get(key)?.toString() ?: "")
                }
                json.put("extras", extrasJson)
            }
        }

        // Traverse up to find meaningful parent info if this node has no identifiers
        if (json.optString("resourceId", "").isEmpty() &&
            json.optString("text", "").isEmpty() &&
            json.optString("contentDescription", "").isEmpty()) {
            val parent = node.parent
            if (parent != null) {
                val parentId = parent.viewIdResourceName ?: ""
                val parentText = parent.text?.toString() ?: ""
                val parentDesc = parent.contentDescription?.toString() ?: ""
                if (parentId.isNotEmpty()) json.put("parentResourceId", parentId)
                if (parentText.isNotEmpty()) json.put("parentText", parentText)
                if (parentDesc.isNotEmpty()) json.put("parentContentDescription", parentDesc)
                parent.recycle()
            }
        }
    }
}
