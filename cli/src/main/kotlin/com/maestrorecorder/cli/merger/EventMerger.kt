package com.maestrorecorder.cli.merger

import com.maestrorecorder.cli.grpc.AgentClient
import com.maestrorecorder.shared.models.MaestroCommand
import com.maestrorecorder.shared.models.TapOnSelector
import com.maestrorecorder.shared.models.UiElement
import com.maestrorecorder.shared.models.UserAction
import kotlinx.coroutines.async
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.channelFlow
import kotlinx.coroutines.launch

class EventMerger(private val elementLookup: suspend (Int, Int) -> UiElement?) {

    constructor(agentClient: AgentClient) : this({ x, y ->
        try {
            agentClient.getElementAt(x, y)
        } catch (_: Exception) {
            null
        }
    })

    fun merge(actions: Flow<UserAction>): Flow<MaestroCommand> = channelFlow {
        coroutineScope {
            val pendingResults = Channel<MaestroCommand>(Channel.UNLIMITED)

            launch {
                actions.collect { action ->
                    when (action) {
                        is UserAction.Tap -> {
                            val command = async {
                                resolveTap(action)
                            }
                            pendingResults.send(command.await())

                            // Check if tap was on a text field — attempt text input detection
                            val textCommand = async { detectTextInput(action) }
                            val text = textCommand.await()
                            if (text != null) {
                                pendingResults.send(text)
                            }
                        }
                    }
                }
                pendingResults.close()
            }

            for (command in pendingResults) {
                send(command)
            }
        }
    }

    private suspend fun resolveTap(tap: UserAction.Tap): MaestroCommand {
        val element = elementLookup(tap.x, tap.y)

        val selector = if (element != null) {
            ElementSelector.selectBest(element)
        } else {
            TapOnSelector.ByPoint(tap.x, tap.y)
        }

        return MaestroCommand.TapOn(selector)
    }

    private suspend fun detectTextInput(tap: UserAction.Tap): MaestroCommand? {
        val element = elementLookup(tap.x, tap.y) ?: return null

        val isTextField = element.focused ||
            element.className?.contains("EditText") == true ||
            element.className?.contains("TextField") == true

        if (!isTextField) return null

        // Wait for user to type, then poll the field's text content
        delay(2000)

        val updatedElement = elementLookup(tap.x, tap.y) ?: return null
        val text = updatedElement.text

        if (!text.isNullOrBlank() && text != element.text) {
            return MaestroCommand.InputText(text)
        }

        return null
    }
}
