package com.maestrorecorder.testapp.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun HomeScreen(
    onNavigateTagged: () -> Unit,
    onNavigateUntagged: () -> Unit,
    onNavigateCounter: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(
            text = "TestApp Home",
            fontSize = 28.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.semantics { testTag = "home_header" },
        )
        Text(
            text = "Pick a screen to exercise the recorder",
            modifier = Modifier.semantics { testTag = "home_subtitle" },
        )
        Spacer(Modifier.height(16.dp))
        Button(
            onClick = onNavigateTagged,
            modifier = Modifier
                .fillMaxWidth()
                .semantics { testTag = "home_btn_tagged" },
        ) { Text("Tagged screen") }
        Button(
            onClick = onNavigateUntagged,
            modifier = Modifier
                .fillMaxWidth()
                .semantics { testTag = "home_btn_untagged" },
        ) { Text("Untagged screen") }
        Button(
            onClick = onNavigateCounter,
            modifier = Modifier
                .fillMaxWidth()
                .semantics { testTag = "home_btn_counter" },
        ) { Text("Counter screen") }
    }
}
