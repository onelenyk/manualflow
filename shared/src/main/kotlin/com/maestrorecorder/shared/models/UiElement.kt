package com.maestrorecorder.shared.models

data class UiElement(
    val className: String? = null,
    val text: String? = null,
    val resourceId: String? = null,
    val contentDescription: String? = null,
    val bounds: ElementBounds = ElementBounds(),
    val clickable: Boolean = false,
    val enabled: Boolean = false,
    val focused: Boolean = false
)

data class ElementBounds(
    val left: Int = 0,
    val top: Int = 0,
    val right: Int = 0,
    val bottom: Int = 0
) {
    val centerX: Int get() = (left + right) / 2
    val centerY: Int get() = (top + bottom) / 2

    fun contains(x: Int, y: Int): Boolean =
        x in left..right && y in top..bottom
}
