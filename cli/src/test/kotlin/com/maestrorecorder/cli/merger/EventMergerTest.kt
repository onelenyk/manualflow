package com.maestrorecorder.cli.merger

import com.maestrorecorder.shared.models.ElementBounds
import com.maestrorecorder.shared.models.MaestroCommand
import com.maestrorecorder.shared.models.TapOnSelector
import com.maestrorecorder.shared.models.UiElement
import com.maestrorecorder.shared.models.UserAction
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

class EventMergerTest {

    @Test
    fun `resolves tap to element by id`() = runTest {
        val lookup: suspend (Int, Int) -> UiElement? = { _, _ ->
            UiElement(resourceId = "com.example:id/btn_next", text = "Next")
        }
        val merger = EventMerger(lookup)

        val actions = flowOf(UserAction.Tap(x = 540, y = 1200, timestampMs = 10000))
        val commands = merger.merge(actions).toList()

        assertEquals(1, commands.size)
        val tap = commands[0]
        assertIs<MaestroCommand.TapOn>(tap)
        assertIs<TapOnSelector.ById>(tap.selector)
        assertEquals("btn_next", (tap.selector as TapOnSelector.ById).id)
    }

    @Test
    fun `resolves tap to text when no id`() = runTest {
        val lookup: suspend (Int, Int) -> UiElement? = { _, _ ->
            UiElement(text = "Sign In")
        }
        val merger = EventMerger(lookup)

        val actions = flowOf(UserAction.Tap(x = 540, y = 1200, timestampMs = 10000))
        val commands = merger.merge(actions).toList()

        assertEquals(1, commands.size)
        assertIs<MaestroCommand.TapOn>(commands[0])
        assertIs<TapOnSelector.ByText>((commands[0] as MaestroCommand.TapOn).selector)
    }

    @Test
    fun `falls back to coordinates when lookup fails`() = runTest {
        val lookup: suspend (Int, Int) -> UiElement? = { _, _ -> null }
        val merger = EventMerger(lookup)

        val actions = flowOf(UserAction.Tap(x = 100, y = 200, timestampMs = 10000))
        val commands = merger.merge(actions).toList()

        assertEquals(1, commands.size)
        val tap = commands[0] as MaestroCommand.TapOn
        assertIs<TapOnSelector.ByPoint>(tap.selector)
        assertEquals(100, (tap.selector as TapOnSelector.ByPoint).x)
        assertEquals(200, (tap.selector as TapOnSelector.ByPoint).y)
    }

    @Test
    fun `preserves order of multiple taps`() = runTest {
        val lookup: suspend (Int, Int) -> UiElement? = { x, _ ->
            UiElement(text = "Button at $x")
        }
        val merger = EventMerger(lookup)

        val actions = flowOf(
            UserAction.Tap(x = 100, y = 100, timestampMs = 10000),
            UserAction.Tap(x = 200, y = 200, timestampMs = 11000),
            UserAction.Tap(x = 300, y = 300, timestampMs = 12000)
        )
        val commands = merger.merge(actions).toList()

        // Filter to TapOn commands only (text input detection may add extras)
        val taps = commands.filterIsInstance<MaestroCommand.TapOn>()
        assertEquals(3, taps.size)
        val texts = taps.map { (it.selector as TapOnSelector.ByText).text }
        assertEquals("Button at 100", texts[0])
        assertEquals("Button at 200", texts[1])
        assertEquals("Button at 300", texts[2])
    }
}
