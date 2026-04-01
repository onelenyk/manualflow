package com.maestrorecorder.dashboard

import com.maestrorecorder.dashboard.plugins.configureCors
import com.maestrorecorder.dashboard.plugins.configureRouting
import com.maestrorecorder.dashboard.plugins.configureSerialization
import com.maestrorecorder.dashboard.plugins.configureWebSockets
import com.maestrorecorder.dashboard.session.DashboardState
import io.ktor.server.application.*

fun Application.dashboardModule() {
    val state = DashboardState()

    configureSerialization()
    configureWebSockets()
    configureCors()
    configureRouting(state)

    monitor.subscribe(ApplicationStopped) {
        state.cleanup()
    }
}
