package com.maestrorecorder.dashboard.routes

import com.maestrorecorder.dashboard.model.BoundsDto
import com.maestrorecorder.dashboard.model.ElementDto
import com.maestrorecorder.dashboard.model.InspectorRequest
import com.maestrorecorder.dashboard.model.InspectorResponse
import com.maestrorecorder.dashboard.session.DashboardState
import io.ktor.server.routing.*
import io.ktor.server.websocket.*
import io.ktor.websocket.*
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

fun Route.inspectorRoutes(state: DashboardState) {
    val json = Json { prettyPrint = false }

    webSocket("/inspector") {
        for (frame in incoming) {
            if (frame !is Frame.Text) continue

            val request = try {
                json.decodeFromString<InspectorRequest>(frame.readText())
            } catch (_: Exception) {
                continue
            }

            val client = state.agentClient
            if (client == null) {
                send(json.encodeToString(InspectorResponse(ElementDto())))
                continue
            }

            try {
                val element = client.getElementAt(request.x, request.y)
                val dto = ElementDto(
                    className = element.className,
                    text = element.text,
                    resourceId = element.resourceId,
                    contentDescription = element.contentDescription,
                    bounds = BoundsDto(
                        left = element.bounds.left,
                        top = element.bounds.top,
                        right = element.bounds.right,
                        bottom = element.bounds.bottom
                    ),
                    clickable = element.clickable,
                    enabled = element.enabled,
                    focused = element.focused
                )
                send(json.encodeToString(InspectorResponse(dto)))
            } catch (e: Exception) {
                send(json.encodeToString(InspectorResponse(ElementDto())))
            }
        }
    }
}
