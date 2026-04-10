package com.maestrorecorder.testapp.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun CounterScreen(onBack: () -> Unit) {
    var count by remember { mutableIntStateOf(0) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            TextButton(
                onClick = onBack,
                modifier = Modifier.semantics { testTag = "counter_back" },
            ) { Text("\u2190 Back") }
            Text(
                text = "Counter",
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.semantics { testTag = "counter_header" },
            )
        }
        Text(
            text = "Count: $count",
            fontSize = 32.sp,
            modifier = Modifier.semantics { testTag = "counter_value" },
        )
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Button(
                onClick = { count-- },
                modifier = Modifier.semantics { testTag = "counter_decrement" },
            ) { Text("\u2212") }
            Button(
                onClick = { count++ },
                modifier = Modifier.semantics { testTag = "counter_increment" },
            ) { Text("+") }
            Button(
                onClick = { count = 0 },
                modifier = Modifier.semantics { testTag = "counter_reset" },
            ) { Text("Reset") }
        }
    }
}
