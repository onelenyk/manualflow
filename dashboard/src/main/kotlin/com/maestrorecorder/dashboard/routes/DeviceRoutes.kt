package com.maestrorecorder.dashboard.routes

import com.maestrorecorder.dashboard.model.DeviceDto
import com.maestrorecorder.dashboard.model.DeviceInfoDto
import com.maestrorecorder.dashboard.model.ErrorResponse
import com.maestrorecorder.dashboard.session.DashboardState
import io.ktor.http.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.serialization.Serializable

@Serializable
data class SetActiveDeviceRequest(val serial: String)

fun Route.deviceRoutes(state: DashboardState) {
    route("/devices") {
        get {
            try {
                val output = state.adb.exec("devices", "-l")
                val devices = output.lines()
                    .drop(1)
                    .filter { it.contains("\tdevice") }
                    .map { line ->
                        val parts = line.split("\\s+".toRegex())
                        val serial = parts[0]
                        val model = Regex("""model:(\S+)""").find(line)?.groupValues?.get(1)
                        DeviceDto(serial = serial, status = "device", model = model)
                    }
                call.respond(devices)
            } catch (e: Exception) {
                call.respond(HttpStatusCode.InternalServerError, ErrorResponse(e.message ?: "Unknown error"))
            }
        }

        post("/select") {
            val request = call.receive<SetActiveDeviceRequest>()
            state.activeDevice = request.serial
            call.respond(mapOf("status" to "ok", "device" to request.serial))
        }

        get("/{serial}/info") {
            val serial = call.parameters["serial"]
                ?: return@get call.respond(HttpStatusCode.BadRequest, ErrorResponse("Missing serial"))

            try {
                val (width, height) = state.deviceManager.getScreenSize()
                call.respond(DeviceInfoDto(screenWidth = width, screenHeight = height, density = 0))
            } catch (e: Exception) {
                call.respond(HttpStatusCode.InternalServerError, ErrorResponse(e.message ?: "Unknown error"))
            }
        }
    }
}
