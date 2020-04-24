stdin  := FileOpen("*", "r `n")
SetKeyDelay, -1
SetMouseDelay, -1
Loop {
    query := RTrim(stdin.ReadLine(), "`n")
    if WinActive("ahk_exe TERA.exe") {
        Send, %query%
    }
}
