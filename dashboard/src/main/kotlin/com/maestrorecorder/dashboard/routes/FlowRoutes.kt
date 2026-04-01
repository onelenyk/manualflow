package com.maestrorecorder.dashboard.routes

import com.maestrorecorder.dashboard.model.*
import com.maestrorecorder.dashboard.session.DashboardState
import com.maestrorecorder.dashboard.storage.FlowStorage
import io.ktor.http.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

fun Route.flowRoutes(state: DashboardState) {
    val storage = FlowStorage()

    route("/flows") {
        get {
            call.respond(storage.listFlows())
        }

        post {
            val request = call.receive<FlowSaveRequest>()
            val flow = storage.saveFlow(request.name, request.yaml)
            call.respond(HttpStatusCode.Created, flow)
        }

        get("/{id}") {
            val id = call.parameters["id"]
                ?: return@get call.respond(HttpStatusCode.BadRequest, ErrorResponse("Missing ID"))
            val flow = storage.getFlow(id)
                ?: return@get call.respond(HttpStatusCode.NotFound, ErrorResponse("Flow not found"))
            call.respond(flow)
        }

        put("/{id}") {
            val id = call.parameters["id"]
                ?: return@put call.respond(HttpStatusCode.BadRequest, ErrorResponse("Missing ID"))
            val request = call.receive<FlowUpdateRequest>()
            val updated = storage.updateFlow(id, request.name, request.yaml)
                ?: return@put call.respond(HttpStatusCode.NotFound, ErrorResponse("Flow not found"))
            call.respond(updated)
        }

        delete("/{id}") {
            val id = call.parameters["id"]
                ?: return@delete call.respond(HttpStatusCode.BadRequest, ErrorResponse("Missing ID"))
            storage.deleteFlow(id)
            call.respond(HttpStatusCode.NoContent)
        }

        post("/{id}/duplicate") {
            val id = call.parameters["id"]
                ?: return@post call.respond(HttpStatusCode.BadRequest, ErrorResponse("Missing ID"))
            val request = call.receive<FlowSaveRequest>()
            val original = storage.getFlow(id)
                ?: return@post call.respond(HttpStatusCode.NotFound, ErrorResponse("Flow not found"))
            val duplicate = storage.saveFlow(request.name, original.yaml)
            call.respond(HttpStatusCode.Created, duplicate)
        }
    }
}
