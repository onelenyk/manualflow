package com.maestrorecorder.dashboard

import io.ktor.server.engine.*
import io.ktor.server.netty.*

fun main() {
    val port = System.getenv("PORT")?.toIntOrNull() ?: 9090
    embeddedServer(Netty, port = port, module = { dashboardModule() })
        .start(wait = true)
}
