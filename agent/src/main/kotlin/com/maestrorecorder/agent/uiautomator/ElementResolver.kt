package com.maestrorecorder.agent.uiautomator

import android.app.UiAutomation
import android.graphics.Rect
import android.view.accessibility.AccessibilityNodeInfo
import androidx.test.platform.app.InstrumentationRegistry

data class Bounds(
    val left: Int,
    val top: Int,
    val right: Int,
    val bottom: Int
)

data class UiElement(
    val className: String? = null,
    val text: String? = null,
    val resourceId: String? = null,
    val contentDescription: String? = null,
    val bounds: Bounds? = null,
    val clickable: Boolean = false,
    val enabled: Boolean = false,
    val focused: Boolean = false
)

class ElementResolver {

    private val uiAutomation: UiAutomation by lazy {
        InstrumentationRegistry.getInstrumentation().uiAutomation
    }

    fun findElementAt(x: Int, y: Int): UiElement {
        val rootNode = uiAutomation.rootInActiveWindow
            ?: return UiElement()

        val deepest = findDeepestNodeAt(rootNode, x, y)
        val element = deepest?.toUiElement() ?: UiElement()

        rootNode.recycle()
        return element
    }

    private fun findDeepestNodeAt(node: AccessibilityNodeInfo, x: Int, y: Int): AccessibilityNodeInfo? {
        val bounds = Rect()
        node.getBoundsInScreen(bounds)

        if (!bounds.contains(x, y)) return null

        // Check children depth-first — deepest match wins
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            val childResult = findDeepestNodeAt(child, x, y)
            if (childResult != null) return childResult
            child.recycle()
        }

        // No child contains the point — this node is the deepest
        return node
    }

    private fun AccessibilityNodeInfo.toUiElement(): UiElement {
        val bounds = Rect()
        getBoundsInScreen(bounds)

        return UiElement(
            className = className?.toString(),
            text = text?.toString(),
            resourceId = viewIdResourceName,
            contentDescription = contentDescription?.toString(),
            bounds = Bounds(
                left = bounds.left,
                top = bounds.top,
                right = bounds.right,
                bottom = bounds.bottom
            ),
            clickable = isClickable,
            enabled = isEnabled,
            focused = isFocused
        )
    }
}
