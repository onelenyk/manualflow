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

class ElementResolver(
    private val uiAutomation: UiAutomation,
    private val onTreeAccess: (() -> Unit)? = null, // callback to re-apply service flags
) {

    companion object {
        private const val TAG = "ElementResolver"
    }

    fun findElementAt(x: Int, y: Int): UiElement {
        val rootNode = uiAutomation.rootInActiveWindow
        if (rootNode == null) {
            Log.w(TAG, "rootInActiveWindow is null")
            return UiElement()
        }

        // Collect ALL nodes at this point, pick the most meaningful one
        val candidates = mutableListOf<Pair<AccessibilityNodeInfo, Int>>() // node + score
        collectScoredNodesAt(rootNode, x, y, candidates)

        val best = candidates.maxByOrNull { it.second }
        val element = best?.first?.toUiElement() ?: UiElement()

        Log.d(TAG, "At ($x,$y): ${candidates.size} candidates, best=${element.text ?: element.resourceId ?: element.className} score=${best?.second}")

        candidates.forEach { it.first.recycle() }
        rootNode.recycle()
        onTreeAccess?.invoke()
        return element
    }

    private fun collectScoredNodesAt(node: AccessibilityNodeInfo, x: Int, y: Int, results: MutableList<Pair<AccessibilityNodeInfo, Int>>) {
        val bounds = Rect()
        node.getBoundsInScreen(bounds)
        if (!bounds.contains(x, y)) return

        results.add(Pair(AccessibilityNodeInfo.obtain(node), nodeScore(node)))

        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            collectScoredNodesAt(child, x, y, results)
            child.recycle()
        }
    }

    /** Walk the full tree and return all elements (for debugging) */
    fun dumpTree(): List<UiElement> {
        val rootNode = uiAutomation.rootInActiveWindow ?: return emptyList()
        val elements = mutableListOf<UiElement>()
        collectNodes(rootNode, elements, maxDepth = 30)
        rootNode.recycle()
        onTreeAccess?.invoke()
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

        // Collect ALL matching children (not just first)
        var bestChild: AccessibilityNodeInfo? = null

        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            val childResult = findDeepestNodeAt(child, x, y)
            if (childResult != null) {
                // Prefer nodes that have meaningful data
                if (bestChild == null || isBetterNode(childResult, bestChild)) {
                    bestChild?.recycle()
                    bestChild = childResult
                } else {
                    childResult.recycle()
                }
            } else {
                child.recycle()
            }
        }

        if (bestChild != null) return bestChild

        return node
    }

    /** Prefer nodes with text, resourceId, editable, or clickable over empty wrappers */
    private fun isBetterNode(a: AccessibilityNodeInfo, b: AccessibilityNodeInfo): Boolean {
        val aScore = nodeScore(a)
        val bScore = nodeScore(b)
        return aScore >= bScore
    }

    private fun nodeScore(node: AccessibilityNodeInfo): Int {
        var score = 0
        if (!node.text.isNullOrEmpty()) score += 10
        if (!node.viewIdResourceName.isNullOrEmpty()) score += 8
        if (!node.contentDescription.isNullOrEmpty()) score += 6
        if (node.isEditable) score += 15  // strong preference for editable
        if (node.isClickable) score += 5
        if (node.isFocused) score += 5
        // Penalize generic containers
        val cls = node.className?.toString() ?: ""
        if (cls == "android.view.View" || cls == "android.widget.FrameLayout") score -= 2
        return score
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
