package com.maestrorecorder.cli.merger

import com.maestrorecorder.shared.models.ElementBounds
import com.maestrorecorder.shared.models.TapOnSelector
import com.maestrorecorder.shared.models.UiElement
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

class ElementSelectorTest {

    @Test
    fun `prefers resource-id over text`() {
        val element = UiElement(
            resourceId = "com.example.app:id/btn_next",
            text = "Next",
            contentDescription = "Go next"
        )
        val selector = ElementSelector.selectBest(element)
        assertIs<TapOnSelector.ById>(selector)
        assertEquals("btn_next", selector.id)
    }

    @Test
    fun `strips package prefix from resource-id`() {
        val element = UiElement(resourceId = "com.vanongo.app:id/email_field")
        val selector = ElementSelector.selectBest(element)
        assertIs<TapOnSelector.ById>(selector)
        assertEquals("email_field", selector.id)
    }

    @Test
    fun `keeps resource-id without package prefix`() {
        val element = UiElement(resourceId = "simple_id")
        val selector = ElementSelector.selectBest(element)
        assertIs<TapOnSelector.ById>(selector)
        assertEquals("simple_id", selector.id)
    }

    @Test
    fun `falls back to text when no resource-id`() {
        val element = UiElement(
            text = "Sign In",
            contentDescription = "Sign in button"
        )
        val selector = ElementSelector.selectBest(element)
        assertIs<TapOnSelector.ByText>(selector)
        assertEquals("Sign In", selector.text)
    }

    @Test
    fun `falls back to content description when no id or text`() {
        val element = UiElement(
            contentDescription = "Navigate up"
        )
        val selector = ElementSelector.selectBest(element)
        assertIs<TapOnSelector.ByContentDescription>(selector)
        assertEquals("Navigate up", selector.description)
    }

    @Test
    fun `falls back to coordinates when nothing else available`() {
        val element = UiElement(
            bounds = ElementBounds(left = 100, top = 200, right = 300, bottom = 400)
        )
        val selector = ElementSelector.selectBest(element)
        assertIs<TapOnSelector.ByPoint>(selector)
        assertEquals(200, selector.x) // centerX = (100+300)/2
        assertEquals(300, selector.y) // centerY = (200+400)/2
    }

    @Test
    fun `ignores blank resource-id`() {
        val element = UiElement(
            resourceId = "",
            text = "Submit"
        )
        val selector = ElementSelector.selectBest(element)
        assertIs<TapOnSelector.ByText>(selector)
    }
}
