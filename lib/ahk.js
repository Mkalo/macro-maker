const EventEmitter = require('events'),
    { spawn } = require("child_process"),
    fs = require("fs");

const repeaterTemplate = 
`#ErrorStdOut
#NoTrayIcon
#MaxHotkeysPerInterval 99999999999999999999
#HotkeyInterval 0

{SUSPEND_KEY}::Suspend, Toggle

{TRIGGER_KEYS}
    if WinActive("ahk_exe TERA.exe") {
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
    if WinActive("ahk_exe TERA.exe") {
        StringReplace, Hotkey, A_ThisHotkey, $
        StringReplace, Hotkey, Hotkey, ~
        stdout.Write(Hotkey)
        stdout.Read(0)
    }
    Return
`;

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

module.exports.compileOutputAhk = (keys, dest) => {
    return new Promise((resolve, reject) => {
        if (!keys.length) return reject("No keys specified.");
        const compiledCode = outputTemplate.replace("{TRIGGER_KEYS}", keys.map(key => `$~${key}::`).join("\r\n"));

        fs.writeFileSync(`${dest}.tmp`, compiledCode);
        
        const validateAhkProcess = spawn(AHK.path, [`${dest}.tmp`]);

        const rejectFunction = reason => {
            fs.unlinkSync(`${dest}.tmp`);
            return reject(reason);
        }

        const resolveFunction = reason => {
            fs.renameSync(`${dest}.tmp`, dest);
            return resolve(reason);
        }

        setTimeout(() => {
            if (!validateAhkProcess.exitCode) {
                validateAhkProcess.kill();
            }
        }, 5000);

        validateAhkProcess.stderr.on("data", data => {
            rejectFunction(data.toString());
        });

        validateAhkProcess.on("error", err => {
            if (err.errno === "ENOENT") {
                rejectFunction("Couldn't find AutoHotkey.exe.");
            } else {
                rejectFunction(err);
            }
        });

        validateAhkProcess.on("exit", code => {
            if (code === 2) {
                rejectFunction("Script exited with code 2.");
            } else {
                resolveFunction();
            }
        })
    });
}

module.exports.compileRepeaterAhk = (keys, suspendKey, dest) => {
    return new Promise((resolve, reject) => {
        if (!keys.length) return reject("No keys specified.");

        let compiledCode = repeaterTemplate.replace("{TRIGGER_KEYS}", keys.map(key => `$~${key}::`).join("\r\n"));
        compiledCode = compiledCode.replace("{SUSPEND_KEY}", suspendKey);

        fs.writeFileSync(`${dest}.tmp`, compiledCode);
        
        const validateAhkProcess = spawn(AHK.path, [`${dest}.tmp`]);

        const rejectFunction = reason => {
            fs.unlinkSync(`${dest}.tmp`);
            return reject(reason);
        }

        const resolveFunction = reason => {
            fs.renameSync(`${dest}.tmp`, dest);
            return resolve(reason);
        }

        setTimeout(() => {
            if (!validateAhkProcess.exitCode) {
                validateAhkProcess.kill();
            }
        }, 5000);

        validateAhkProcess.stderr.on("data", data => {
            rejectFunction(data.toString());
        });

        validateAhkProcess.on("error", err => {
            if (err.errno === "ENOENT") {
                rejectFunction("Couldn't find AutoHotkey.exe.");
            } else {
                rejectFunction(err);
            }
        });

        validateAhkProcess.on("exit", code => {
            if (code === 2) {
                rejectFunction("Script exited with code 2.");
            } else {
                resolveFunction();
            }
        })
    });
}
