package com.maestrorecorder.cli.merger

import com.maestrorecorder.shared.models.TapOnSelector
import com.maestrorecorder.shared.models.UiElement

object ElementSelector {

    fun selectBest(element: UiElement): TapOnSelector {
        val resourceId = element.resourceId
        val text = element.text
        val contentDescription = element.contentDescription

        // Priority 1: resource-id (strip package prefix for cleaner YAML)
        if (!resourceId.isNullOrBlank()) {
            val idSuffix = resourceId.substringAfter(":id/", "")
            val shortId = if (idSuffix.isNotEmpty()) idSuffix else resourceId
            return TapOnSelector.ById(shortId)
        }

        // Priority 2: visible text
        if (!text.isNullOrBlank()) {
            return TapOnSelector.ByText(text)
        }

        // Priority 3: content description
        if (!contentDescription.isNullOrBlank()) {
            return TapOnSelector.ByContentDescription(contentDescription)
        }

        // Priority 4: coordinate fallback
        return TapOnSelector.ByPoint(element.bounds.centerX, element.bounds.centerY)
    }
}
