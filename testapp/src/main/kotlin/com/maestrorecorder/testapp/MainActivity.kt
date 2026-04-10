package com.maestrorecorder.testapp

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import com.maestrorecorder.testapp.ui.screens.CounterScreen
import com.maestrorecorder.testapp.ui.screens.HomeScreen
import com.maestrorecorder.testapp.ui.screens.TaggedScreen
import com.maestrorecorder.testapp.ui.screens.UntaggedScreen

enum class Route { HOME, TAGGED, UNTAGGED, COUNTER }

class MainActivity : ComponentActivity() {
    @OptIn(ExperimentalComposeUiApi::class)
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Surface(
                    modifier = Modifier
                        .fillMaxSize()
                        // Exposes Compose testTag values as Android resource-ids on the
                        // accessibility tree so UiAutomator (and Maestro) can see them.
                        .semantics { testTagsAsResourceId = true },
                    color = MaterialTheme.colorScheme.background,
                ) {
                    AppRouter()
                }
            }
        }
    }
}

@Composable
fun AppRouter() {
    var route by rememberSaveable { mutableStateOf(Route.HOME) }

    when (route) {
        Route.HOME -> HomeScreen(
            onNavigateTagged = { route = Route.TAGGED },
            onNavigateUntagged = { route = Route.UNTAGGED },
            onNavigateCounter = { route = Route.COUNTER },
        )
        Route.TAGGED -> TaggedScreen(onBack = { route = Route.HOME })
        Route.UNTAGGED -> UntaggedScreen(onBack = { route = Route.HOME })
        Route.COUNTER -> CounterScreen(onBack = { route = Route.HOME })
    }
}
