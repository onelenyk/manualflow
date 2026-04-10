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
    val scrollable: Boolean = false,
    val nearestLabel: String? = null,
    val labelRelation: String? = null, // "below" or "above" — the target is [relation] the label
)

class ElementResolver(
    private val uiAutomation: UiAutomation,
    private val onTreeAccess: (() -> Unit)? = null, // callback to re-apply service flags
) {

    companion object {
        private const val TAG = "ElementResolver"
        /** Expand tap hit area by this many pixels to catch nearby meaningful elements */
        private const val TAP_MARGIN_PX = 24
    }

    fun findElementAt(x: Int, y: Int): UiElement {
        val rootNode = uiAutomation.rootInActiveWindow
        if (rootNode == null) {
            Log.w(TAG, "rootInActiveWindow is null")
            return UiElement()
        }

        // 1. Collect all nodes at the exact tap point
        val candidates = mutableListOf<Pair<AccessibilityNodeInfo, Int>>()
        collectScoredNodesAt(rootNode, x, y, candidates)

        // 2. Pick best: among nodes with meaningful content (text/id/desc),
        //    prefer the SMALLEST (most specific). Fall back to score for others.
        val best = pickBestCandidate(candidates)

        // 3. If the best hit is a generic container (low score), search nearby with margin
        if (best == null || best.second < 5) {
            val nearbyCandidates = mutableListOf<Pair<AccessibilityNodeInfo, Int>>()
            collectScoredNodesNear(rootNode, x, y, TAP_MARGIN_PX, nearbyCandidates)

            val nearbyBest = pickBestCandidate(nearbyCandidates)
            if (nearbyBest != null && nearbyBest.second > (best?.second ?: 0)) {
                val element = nearbyBest.first.toUiElement()
                Log.d(TAG, "At ($x,$y): exact=${candidates.size} (best score=${best?.second}), used nearby: ${element.text ?: element.resourceId ?: element.className} score=${nearbyBest.second}")
                nearbyCandidates.forEach { it.first.recycle() }
                candidates.forEach { it.first.recycle() }
                rootNode.recycle()
                onTreeAccess?.invoke()
                return element
            }
            nearbyCandidates.forEach { it.first.recycle() }
        }

        var element = best?.first?.toUiElement() ?: UiElement()
        Log.d(TAG, "At ($x,$y): ${candidates.size} candidates, best=${element.text ?: element.resourceId ?: element.className} score=${best?.second}")

        // 4. If element has no identifiers, enrich with context
        if (element.text.isNullOrEmpty() && element.resourceId.isNullOrEmpty() && element.contentDescription.isNullOrEmpty()) {
            // First: try to find a labeled child inside this element (e.g., text inside a card)
            val childLabel = best?.first?.let { findFirstChildText(it) }
            if (childLabel != null) {
                // Use "containsChild" style — the element contains this text
                element = element.copy(nearestLabel = childLabel, labelRelation = "containsChild")
                Log.d(TAG, "  child text: \"$childLabel\"")
            } else {
                // Fallback: find nearest labeled neighbor above/below
                val neighbor = findNearestLabel(rootNode, element.bounds)
                if (neighbor != null) {
                    element = element.copy(nearestLabel = neighbor.first, labelRelation = neighbor.second)
                    Log.d(TAG, "  neighbor: \"${neighbor.first}\" (${neighbor.second})")
                }
            }
        }

        candidates.forEach { it.first.recycle() }
        rootNode.recycle()
        onTreeAccess?.invoke()
        return element
    }

    /** Find the first child with meaningful text (for cards/containers with text children) */
    private fun findFirstChildText(node: AccessibilityNodeInfo): String? {
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            val text = child.text?.toString()
            if (!text.isNullOrEmpty() && text.length < 80) {
                child.recycle()
                return text
            }
            // Recurse one more level
            val grandchildText = findFirstChildText(child)
            child.recycle()
            if (grandchildText != null) return grandchildText
        }
        return null
    }

    /** Find the nearest node with text relative to the given bounds */
    private fun findNearestLabel(root: AccessibilityNodeInfo, targetBounds: Bounds?): Pair<String, String>? {
        if (targetBounds == null) return null

        val labeled = mutableListOf<Triple<String, Rect, Int>>() // text, bounds, area
        collectLabeledNodes(root, labeled)

        val targetCenterY = (targetBounds.top + targetBounds.bottom) / 2
        val targetCenterX = (targetBounds.left + targetBounds.right) / 2

        var bestLabel: String? = null
        var bestRelation: String? = null
        var bestDistance = Int.MAX_VALUE

        for ((text, bounds, _) in labeled) {
            val centerY = (bounds.top + bounds.bottom) / 2
            val centerX = (bounds.left + bounds.right) / 2

            // Check if this label is above the target
            if (bounds.bottom <= targetBounds.top + 20) {
                val dist = targetBounds.top - bounds.bottom + Math.abs(targetCenterX - centerX) / 3
                if (dist < bestDistance) {
                    bestDistance = dist
                    bestLabel = text
                    bestRelation = "below" // target is below this label
                }
            }
            // Check if this label is below the target
            else if (bounds.top >= targetBounds.bottom - 20) {
                val dist = bounds.top - targetBounds.bottom + Math.abs(targetCenterX - centerX) / 3
                if (dist < bestDistance) {
                    bestDistance = dist
                    bestLabel = text
                    bestRelation = "above" // target is above this label
                }
            }
        }

        return if (bestLabel != null && bestRelation != null) Pair(bestLabel, bestRelation) else null
    }

    private fun collectLabeledNodes(node: AccessibilityNodeInfo, results: MutableList<Triple<String, Rect, Int>>) {
        val text = node.text?.toString()
        if (!text.isNullOrEmpty() && text.length < 80) {
            val bounds = Rect()
            node.getBoundsInScreen(bounds)
            results.add(Triple(text, bounds, bounds.width() * bounds.height()))
        }
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            collectLabeledNodes(child, results)
            child.recycle()
        }
    }

    /**
     * Among candidates with meaningful content (text, resourceId, contentDescription),
     * prefer the smallest node (most specific). Among others, prefer highest score.
     */
    private val JUNK_IDS = setOf("action_bar_root", "content", "decor_content_parent", "statusBarBackground", "navigationBarBackground")

    private fun isJunkId(node: AccessibilityNodeInfo): Boolean {
        val rid = node.viewIdResourceName ?: return false
        val shortId = if (rid.contains(":id/")) rid.substringAfter(":id/") else rid
        return JUNK_IDS.contains(shortId)
    }

    private fun area(node: AccessibilityNodeInfo): Long {
        val bounds = Rect()
        node.getBoundsInScreen(bounds)
        return bounds.width().toLong() * bounds.height().toLong()
    }

    private fun pickBestCandidate(candidates: List<Pair<AccessibilityNodeInfo, Int>>): Pair<AccessibilityNodeInfo, Int>? {
        if (candidates.isEmpty()) return null

        val nonJunk = candidates.filter { (node, _) -> !isJunkId(node) }

        // Tier 1: clickable/editable elements that also have a usable id or desc
        //   These are the semantic test targets (buttons, inputs) that Compose
        //   may wrap with non-clickable text children whose bounds are slightly
        //   smaller — prefer the actionable parent, smallest wins.
        val actionableWithId = nonJunk.filter { (node, _) ->
            (node.isClickable || node.isEditable) &&
                (!node.viewIdResourceName.isNullOrEmpty() ||
                    !node.contentDescription.isNullOrEmpty())
        }
        if (actionableWithId.isNotEmpty()) {
            return actionableWithId.minByOrNull { (node, _) -> area(node) }
        }

        // Tier 2: any meaningful node (text, id, desc, editable, or clickable)
        //   Smallest wins → most specific leaf.
        val meaningful = nonJunk.filter { (node, _) ->
            !node.text.isNullOrEmpty() ||
                !node.viewIdResourceName.isNullOrEmpty() ||
                !node.contentDescription.isNullOrEmpty() ||
                node.isEditable ||
                node.isClickable
        }
        if (meaningful.isNotEmpty()) {
            return meaningful.minByOrNull { (node, _) -> area(node) }
        }

        // Tier 3: no meaningful candidates — fall back to highest score.
        return nonJunk.maxByOrNull { it.second } ?: candidates.maxByOrNull { it.second }
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

    /** Collect nodes whose bounds are within `margin` pixels of (x,y) — for near-miss taps */
    private fun collectScoredNodesNear(node: AccessibilityNodeInfo, x: Int, y: Int, margin: Int, results: MutableList<Pair<AccessibilityNodeInfo, Int>>) {
        val bounds = Rect()
        node.getBoundsInScreen(bounds)

        // Expand bounds by margin for the containment check
        val expanded = Rect(bounds.left - margin, bounds.top - margin, bounds.right + margin, bounds.bottom + margin)
        if (!expanded.contains(x, y)) return

        // Only add if the node is meaningful (has text, id, or description)
        val score = nodeScore(node)
        if (score >= 5) {
            results.add(Pair(AccessibilityNodeInfo.obtain(node), score))
        }

        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            collectScoredNodesNear(child, x, y, margin, results)
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
