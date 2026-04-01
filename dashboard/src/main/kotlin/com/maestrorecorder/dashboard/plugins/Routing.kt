package com.maestrorecorder.dashboard.plugins

import com.maestrorecorder.dashboard.routes.*
import com.maestrorecorder.dashboard.session.DashboardState
import io.ktor.server.application.*
import io.ktor.server.http.content.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

fun Application.configureRouting(state: DashboardState) {
    routing {
        // REST API routes
        route("/api") {
            deviceRoutes(state)
            recordingRoutes(state)
            flowRoutes(state)
            runnerRoutes(state)
        }

        // WebSocket routes
        route("/ws") {
            screenRoutes(state)
            inspectorRoutes(state)
        }

        // Serve static frontend files
        staticResources("/", "static") {
            default("index.html")
        }

        // Health check
        get("/health") {
            call.respondText("OK")
        }
    }
}
