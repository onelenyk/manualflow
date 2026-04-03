package com.maestrorecorder.agent.uiautomator

import android.app.UiAutomation
import android.graphics.Rect
import android.util.Log
import android.view.accessibility.AccessibilityNodeInfo

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
    val focused: Boolean = false,
    val checkable: Boolean = false,
    val checked: Boolean = false,
    val editable: Boolean = false,
    val scrollable: Boolean = false
)

class ElementResolver(private val uiAutomation: UiAutomation) {

    companion object {
        private const val TAG = "ElementResolver"
    }

    fun findElementAt(x: Int, y: Int): UiElement {
        val rootNode = uiAutomation.rootInActiveWindow
        if (rootNode == null) {
            Log.w(TAG, "rootInActiveWindow is null")
            return UiElement()
        }

        Log.d(TAG, "Looking up element at ($x, $y), root has ${rootNode.childCount} children")

        val deepest = findDeepestNodeAt(rootNode, x, y)
        val element = deepest?.toUiElement() ?: UiElement()

        if (deepest != null) {
            Log.d(TAG, "Found: ${element.text ?: element.resourceId ?: element.className ?: "(empty)"}")
        } else {
            Log.w(TAG, "No element found at ($x, $y)")
        }

        rootNode.recycle()
        return element
    }

    /** Walk the full tree and return all elements (for debugging) */
    fun dumpTree(): List<UiElement> {
        val rootNode = uiAutomation.rootInActiveWindow ?: return emptyList()
        val elements = mutableListOf<UiElement>()
        collectNodes(rootNode, elements, maxDepth = 10)
        rootNode.recycle()
        return elements
    }

    private fun collectNodes(node: AccessibilityNodeInfo, list: MutableList<UiElement>, depth: Int = 0, maxDepth: Int = 10) {
        if (depth > maxDepth) return
        list.add(node.toUiElement())
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            collectNodes(child, list, depth + 1, maxDepth)
            child.recycle()
        }
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
            focused = isFocused,
            checkable = isCheckable,
            checked = isChecked,
            editable = isEditable,
            scrollable = isScrollable
        )
    }
}
