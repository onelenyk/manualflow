package com.maestrorecorder.shared.models

sealed class MaestroCommand {

    data object LaunchApp : MaestroCommand()

    data class TapOn(val selector: TapOnSelector) : MaestroCommand()

    data class InputText(val text: String) : MaestroCommand()
}

sealed class TapOnSelector {

    data class ById(val id: String) : TapOnSelector()

    data class ByText(val text: String) : TapOnSelector()

    data class ByContentDescription(val description: String) : TapOnSelector()

    data class ByPoint(val x: Int, val y: Int) : TapOnSelector()
}
