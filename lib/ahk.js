const EventEmitter = require('events'),
    { spawn } = require("child_process"),
    fs = require("fs");

const repeaterTemplate = 
`#ErrorStdOut
#NoTrayIcon
#MaxHotkeysPerInterval 99999999999999999999
#HotkeyInterval 0

Enabled := true
{START_SUSPENDED}
$~f23::Enabled := false
$~f24::Enabled := true

{SUSPEND_KEY}::Suspend, Toggle

{TRIGGER_KEYS}
    If (WinActive("ahk_pid {TERA_PID}") && Enabled) {
        Hotkey := StrReplace(A_ThisHotkey, "$")
        Hotkey := StrReplace(Hotkey, "~")
        IsShiftHotkey := 0
        IsCtrlHotkey := 0
        IsAltHotkey := 0
        Hotkey := StrReplace(Hotkey, "+", "", IsShiftHotkey)
        Hotkey := StrReplace(Hotkey, "^", "", IsCtrlHotkey)
        Hotkey := StrReplace(Hotkey, "!", "", IsAltHotkey)
        Modifiers := ""
        If (IsShiftHotkey > 0) {
            Modifiers = %Modifiers%+
        }
        If (IsCtrlHotkey > 0) {
            Modifiers = %Modifiers%^
        }
        If (IsAltHotkey > 0) {
            Modifiers = %Modifiers%!
        }
        While GetKeyState(Hotkey, "P") {
            Send, %Modifiers%{%Hotkey%}
            Sleep, 0
        }
    }
    Return
`;
    
const outputTemplate =
`#ErrorStdOut
#NoTrayIcon
#MaxHotkeysPerInterval 99999999999999999999
#HotkeyInterval 0

stdout := FileOpen("*", "w")

{TRIGGER_KEYS}
    If WinActive("ahk_pid {TERA_PID}") {
        StringReplace, Hotkey, A_ThisHotkey, $
        StringReplace, Hotkey, Hotkey, ~
        stdout.Write(Hotkey)
        stdout.Read(0)
    }
    Return
`;

const inputTemplate =
`#NoTrayIcon
stdin  := FileOpen("*", "r \`n")
SetKeyDelay, -1
SetMouseDelay, -1
Loop {
    query := RTrim(stdin.ReadLine(), "\`n")
    If (query == "{f23}" || query == "{f24}") {
        SendLevel, 1
        Send, %query%
        SendLevel, 0
    } Else If WinActive("ahk_pid {TERA_PID}") {
        Send, %query%
    }
}
`

class AHK extends EventEmitter {
    constructor(input, output, repeater) {
        super();
        this.setMaxListeners(0);
        if (input && fs.existsSync(input)) {
            this.spawnInput(input);
        }
        if (output && fs.existsSync(output)) {
            this.spawnOutput(output);
        }
        if (repeater && fs.existsSync(repeater)) {
            this.spawnRepeater(repeater);
        }
    }

    destructor() {
        if (this.inputAhk && !this.inputAhk.exitCode) {
            this.inputAhk.kill();
        }
        if (this.outputAhk && !this.outputAhk.exitCode) {
            this.outputAhk.kill();
        }
        if (this.repeaterAhk && !this.repeaterAhk.exitCode) {
            this.repeaterAhk.kill();
        }
    }

    spawnInput(input) {
        this.inputAhk = spawn(AHK.path, [input]);

        this.inputAhk.on("exit", code => {
            if (code === 0) {
                console.log("[Macro-Maker] Please don't close ahk scripts manually. Restarting script.");
                this.spawnInput(input);
            }
        });
    }

    spawnOutput(output) {
        this.outputAhk = spawn(AHK.path, [output]);
        this.outputAhk.stdout.on("data", data => {
            this.emit("hotkey_press", data.toString());
        });

        this.outputAhk.on("exit", code => {
            if (code === 0) {
                console.log("[Macro-Maker] Please don't close ahk scripts manually. Restarting script.");
                this.spawnOutput(output);
            }
        });
    }

    spawnRepeater(repeater) {
        this.repeaterAhk = spawn(AHK.path, [repeater]);

        this.repeaterAhk.on("exit", code => {
            if (code === 0) {
                console.log("[Macro-Maker] Please don't close ahk scripts manually. Restarting script.");
                this.spawnRepeater(repeater);
            }
        });
    }

    keyTap(key, modifiers, duration = 0) {
        let keyToPress = `${modifiers}{${key}${duration ? " down" : ""}}`;

        this.inputAhk.stdin.write(`${keyToPress}\r\n`);

        if (duration) {
            keyToPress = `${modifiers}{${key} up}`;

            setTimeout(() => {
                if (this.inputAhk.exitCode) return;
                this.inputAhk.stdin.write(`${keyToPress}\r\n`);
            }, duration);
        }
    }

    keyRepeat(key, modifiers, duration, interval, trigger = 0, lastCast = {skill: 0}) {
        if (duration && interval) {
            let timeoutId;

            const intervalId = setInterval(() => {
                if (lastCast.skill !== trigger) {
                    clearInterval(intervalId);
                    clearTimeout(timeoutId);
                    return;
                }
                this.keyTap(key, modifiers);
            }, interval);

            setImmediate(() => {
                if (lastCast.skill !== trigger) return;
                this.keyTap(key, modifiers);
            });

            timeoutId = setTimeout(() => {
                clearInterval(intervalId);
            }, duration);
        }
    }
}

module.exports = AHK;

module.exports.init = (ahkPath) => {
    if (fs.existsSync(ahkPath)) {
        AHK.path = ahkPath;
    } else {
        throw new Error(`${ahkPath} not found.`);
    }
}

function validateAhk(ahkPath, resolve, reject) {
    const validateAhkProcess = spawn(AHK.path, [ahkPath]);

    setTimeout(() => {
        if (!validateAhkProcess.exitCode) {
            validateAhkProcess.kill();
        }
    }, 5000);

    validateAhkProcess.stderr.on("data", data => reject(data.toString()));

    validateAhkProcess.on("error", err => {
        if (err.errno === "ENOENT") {
            reject("Couldn't find AutoHotkey.exe.");
        } else {
            reject(err);
        }
    });

    validateAhkProcess.on("exit", code => {
        if (code === 2) {
            reject("Script exited with code 2.");
        } else {
            resolve();
        }
    });
}

module.exports.compileOutputAhk = (dest, pid, keys) => {
    return new Promise((resolve, reject) => {
        if (!keys.length) return reject("No keys specified.");
        
        let compiledCode = outputTemplate.replace("{TRIGGER_KEYS}", keys.map(key => `$~${key}::`).join("\r\n"));
        compiledCode = compiledCode.replace("{TERA_PID}", pid);
        
        fs.writeFileSync(dest, compiledCode);

        validateAhk(dest, resolve, reject);
    });
}

module.exports.compileRepeaterAhk = (dest, pid, keys, suspendKey, startSuspended = false) => {
    return new Promise((resolve, reject) => {
        if (!keys.length) return reject("No keys specified.");

        let compiledCode = repeaterTemplate.replace("{TRIGGER_KEYS}", keys.map(key => `$~${key}::`).join("\r\n"));
        compiledCode = compiledCode.replace("{SUSPEND_KEY}", suspendKey);
        compiledCode = compiledCode.replace("{START_SUSPENDED}", startSuspended ? "Suspend, On\n" : "");
        compiledCode = compiledCode.replace("{TERA_PID}", pid);

        fs.writeFileSync(dest, compiledCode);

        validateAhk(dest, resolve, reject);
    });
}

module.exports.compileInputAhk = (dest, pid) => {
    return new Promise((resolve, reject) => {
        let compiledCode = compiledCode.replace("{TERA_PID}", pid);

        fs.writeFileSync(dest, compiledCode);

        validateAhk(dest, resolve, reject);
    });
}
