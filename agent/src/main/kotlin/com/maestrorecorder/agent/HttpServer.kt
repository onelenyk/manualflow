package com.maestrorecorder.agent

import android.util.Log
import com.maestrorecorder.agent.uiautomator.DeviceInfoProvider
import com.maestrorecorder.agent.uiautomator.ElementResolver
import fi.iki.elonen.NanoHTTPD
import org.json.JSONArray
import org.json.JSONObject

class HttpServer(
    private val port: Int,
    private val eventCollector: EventCollector? = null,
) : NanoHTTPD(port) {
    companion object {
        private const val TAG = "MaestroHttpServer"
    }

    private val elementResolver = ElementResolver()
    private val deviceInfoProvider = DeviceInfoProvider()

    override fun serve(session: IHTTPSession): Response {
        return try {
            Log.d(TAG, "Request: ${session.method} ${session.uri}")
            when {
                session.uri == "/device-info" && session.method == Method.GET -> handleDeviceInfo()
                session.uri == "/element-at" && session.method == Method.POST -> handleElementAt(session)
                session.uri == "/events/stream" && session.method == Method.GET -> handleEventStream()
                session.uri == "/events" && session.method == Method.GET -> handleEventsPoll()
                else -> newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "Not found")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error handling request", e)
            val err = JSONObject().put("error", e.message ?: "Unknown error")
            newFixedLengthResponse(Response.Status.INTERNAL_ERROR, "application/json", err.toString())
        }
    }

    private fun handleDeviceInfo(): Response {
        val info = deviceInfoProvider.getInfo()
        val json = JSONObject()
            .put("screenWidth", info.screenWidth)
            .put("screenHeight", info.screenHeight)
            .put("density", info.density)
        return newFixedLengthResponse(Response.Status.OK, "application/json", json.toString())
    }

    private fun handleElementAt(session: IHTTPSession): Response {
        val body = HashMap<String, String>()
        session.parseBody(body)
        val requestJson = JSONObject(body["postData"] ?: "{}")
        val x = requestJson.optInt("x", 0)
        val y = requestJson.optInt("y", 0)

        val element = elementResolver.findElementAt(x, y)
        val bounds = element.bounds?.let {
            JSONObject()
                .put("left", it.left).put("top", it.top)
                .put("right", it.right).put("bottom", it.bottom)
        }

        val json = JSONObject()
            .put("className", element.className)
            .put("text", element.text)
            .put("resourceId", element.resourceId)
            .put("contentDescription", element.contentDescription)
            .put("bounds", bounds)
            .put("clickable", element.clickable)
            .put("enabled", element.enabled)
            .put("focused", element.focused)

        return newFixedLengthResponse(Response.Status.OK, "application/json", json.toString())
    }

    /** Chunked streaming endpoint — keeps connection open, sends JSON lines as events occur */
    private fun handleEventStream(): Response {
        if (eventCollector == null) {
            return newFixedLengthResponse(
                Response.Status.SERVICE_UNAVAILABLE, "text/plain",
                "Event collector not available"
            )
        }

        Log.i(TAG, "Event stream client connected")
        val inputStream = eventCollector.createStream()

        return newChunkedResponse(
            Response.Status.OK,
            "application/x-ndjson",
            inputStream
        )
    }

    /** Polling endpoint — returns and clears queued events */
    private fun handleEventsPoll(): Response {
        if (eventCollector == null) {
            return newFixedLengthResponse(Response.Status.OK, "application/json", "[]")
        }

        val events = eventCollector.drainEvents()
        val json = JSONArray()
        events.forEach { json.put(JSONObject(it)) }

        return newFixedLengthResponse(Response.Status.OK, "application/json", json.toString())
    }
}
