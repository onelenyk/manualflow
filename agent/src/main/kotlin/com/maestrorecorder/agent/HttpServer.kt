package com.maestrorecorder.agent

import android.util.Log
import com.google.gson.Gson
import com.google.gson.GsonBuilder
import com.maestrorecorder.agent.uiautomator.Bounds
import com.maestrorecorder.agent.uiautomator.DeviceInfo
import com.maestrorecorder.agent.uiautomator.DeviceInfoProvider
import com.maestrorecorder.agent.uiautomator.ElementResolver
import com.maestrorecorder.agent.uiautomator.UiElement
import fi.iki.elonen.NanoHTTPD

/**
 * HTTP server for MaestroRecorder agent using NanoHTTPD.
 *
 * Endpoints:
 *   GET /device-info  -> {screenWidth, screenHeight, density}
 *   POST /element-at  -> {x, y} -> {className, text, resourceId, ...}
 */
class HttpServer(private val port: Int) : NanoHTTPD(port) {
    companion object {
        private const val TAG = "MaestroHttpServer"
    }

    private val elementResolver = ElementResolver()
    private val deviceInfoProvider = DeviceInfoProvider()
    private val gson: Gson = GsonBuilder().disableHtmlEscaping().create()

    override fun serve(session: IHTTPSession): Response {
        return try {
            Log.d(TAG, "Request: ${session.method} ${session.uri}")

            when {
                session.uri == "/device-info" && session.method == Method.GET -> {
                    handleDeviceInfo()
                }
                session.uri == "/element-at" && session.method == Method.POST -> {
                    handleElementAt(session)
                }
                else -> {
                    newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "Not found")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error handling request", e)
            newFixedLengthResponse(
                Response.Status.INTERNAL_ERROR,
                "application/json",
                gson.toJson(mapOf("error" to (e.message ?: "Unknown error")))
            )
        }
    }

    private fun handleDeviceInfo(): Response {
        val info = deviceInfoProvider.getInfo()
        val json = gson.toJson(info)
        Log.d(TAG, "Device info: $json")
        return newFixedLengthResponse(Response.Status.OK, "application/json", json)
    }

    private fun handleElementAt(session: IHTTPSession): Response {
        // Parse request body
        val bodyBytes = session.inputStream.readBytes()
        val bodyJson = String(bodyBytes, Charsets.UTF_8)
        Log.d(TAG, "Element request: $bodyJson")

        val request = gson.fromJson(bodyJson, ElementAtRequest::class.java)
        val element = elementResolver.findElementAt(request.x, request.y)
        val response = ElementAtResponse(
            className = element.className,
            text = element.text,
            resourceId = element.resourceId,
            contentDescription = element.contentDescription,
            bounds = element.bounds?.let { BoundsJson(it.left, it.top, it.right, it.bottom) },
            clickable = element.clickable,
            enabled = element.enabled,
            focused = element.focused
        )
        val json = gson.toJson(response)
        Log.d(TAG, "Element response: $json")

        return newFixedLengthResponse(Response.Status.OK, "application/json", json)
    }

    override fun start() {
        super.start()
        Log.i(TAG, "MaestroRecorder HTTP server started on port $port")
    }

    override fun stop() {
        super.stop()
        Log.i(TAG, "MaestroRecorder HTTP server stopped")
    }
}

data class ElementAtRequest(val x: Int, val y: Int)

data class ElementAtResponse(
    val className: String?,
    val text: String?,
    val resourceId: String?,
    val contentDescription: String?,
    val bounds: BoundsJson?,
    val clickable: Boolean,
    val enabled: Boolean,
    val focused: Boolean
)

data class BoundsJson(
    val left: Int,
    val top: Int,
    val right: Int,
    val bottom: Int
)
