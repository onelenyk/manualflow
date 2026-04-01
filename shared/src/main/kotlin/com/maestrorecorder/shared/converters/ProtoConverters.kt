package com.maestrorecorder.shared.converters

import com.maestrorecorder.shared.models.DeviceInfo
import com.maestrorecorder.shared.models.ElementBounds
import com.maestrorecorder.shared.models.UiElement
import com.maestrorecorder.shared.proto.Bounds
import com.maestrorecorder.shared.proto.DeviceInfoResponse
import com.maestrorecorder.shared.proto.UiElementResponse

fun UiElementResponse.toDomain(): UiElement = UiElement(
    className = className.ifBlank { null },
    text = text.ifBlank { null },
    resourceId = resourceId.ifBlank { null },
    contentDescription = contentDescription.ifBlank { null },
    bounds = if (hasBounds()) bounds.toDomain() else ElementBounds(),
    clickable = clickable,
    enabled = enabled,
    focused = focused
)

fun Bounds.toDomain(): ElementBounds = ElementBounds(
    left = left,
    top = top,
    right = right,
    bottom = bottom
)

fun DeviceInfoResponse.toDomain(): DeviceInfo = DeviceInfo(
    screenWidth = screenWidth,
    screenHeight = screenHeight,
    density = density
)

fun UiElement.toProto(): UiElementResponse {
    val boundsProto = Bounds.newBuilder()
        .setLeft(bounds.left)
        .setTop(bounds.top)
        .setRight(bounds.right)
        .setBottom(bounds.bottom)
        .build()
    return UiElementResponse.newBuilder().apply {
        this@toProto.className?.let { setClassName(it) }
        this@toProto.text?.let { setText(it) }
        this@toProto.resourceId?.let { setResourceId(it) }
        this@toProto.contentDescription?.let { setContentDescription(it) }
        setBounds(boundsProto)
        setClickable(this@toProto.clickable)
        setEnabled(this@toProto.enabled)
        setFocused(this@toProto.focused)
    }.build()
}

fun ElementBounds.toProto(): Bounds = Bounds.newBuilder()
    .setLeft(left)
    .setTop(top)
    .setRight(right)
    .setBottom(bottom)
    .build()

fun DeviceInfo.toProto(): DeviceInfoResponse = DeviceInfoResponse.newBuilder()
    .setScreenWidth(screenWidth)
    .setScreenHeight(screenHeight)
    .setDensity(density)
    .build()
