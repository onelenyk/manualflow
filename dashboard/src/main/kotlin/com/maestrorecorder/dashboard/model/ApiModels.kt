package com.maestrorecorder.dashboard.model

import kotlinx.serialization.Serializable

@Serializable
data class DeviceDto(
    val serial: String,
    val status: String,
    val model: String? = null
)

@Serializable
data class DeviceInfoDto(
    val screenWidth: Int,
    val screenHeight: Int,
    val density: Int
)

@Serializable
data class RecordingStartRequest(
    val deviceSerial: String? = null,
    val appId: String? = null,
    val grpcPort: Int = 50051
)

@Serializable
data class RecordingStartResponse(
    val status: String,
    val message: String
)

@Serializable
data class RecordingStopResponse(
    val yaml: String,
    val commandCount: Int
)

@Serializable
data class RecordingStatusResponse(
    val state: String,
    val commandCount: Int,
    val durationMs: Long
)

@Serializable
data class FlowDto(
    val id: String,
    val name: String,
    val commandCount: Int,
    val createdAt: Long
)

@Serializable
data class FlowDetailDto(
    val id: String,
    val name: String,
    val yaml: String,
    val commands: List<CommandDto>
)

@Serializable
data class FlowSaveRequest(
    val name: String,
    val yaml: String
)

@Serializable
data class FlowUpdateRequest(
    val name: String? = null,
    val yaml: String? = null
)

@Serializable
data class CommandDto(
    val type: String,
    val selector: SelectorDto? = null,
    val text: String? = null
)

@Serializable
data class SelectorDto(
    val type: String,
    val value: String
)

@Serializable
data class YamlParseRequest(
    val yaml: String
)

@Serializable
data class YamlGenerateRequest(
    val appId: String,
    val commands: List<CommandDto>
)

@Serializable
data class ElementDto(
    val className: String? = null,
    val text: String? = null,
    val resourceId: String? = null,
    val contentDescription: String? = null,
    val bounds: BoundsDto? = null,
    val clickable: Boolean = false,
    val enabled: Boolean = false,
    val focused: Boolean = false
)

@Serializable
data class BoundsDto(
    val left: Int,
    val top: Int,
    val right: Int,
    val bottom: Int
)

@Serializable
data class InspectorRequest(
    val x: Int,
    val y: Int
)

@Serializable
data class InspectorResponse(
    val element: ElementDto
)

@Serializable
data class RunStartResponse(
    val runId: String
)

@Serializable
data class ErrorResponse(
    val error: String
)
