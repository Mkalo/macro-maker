const fs = require("fs"),
    path = require("path"),
    AHK = require("./lib/ahk.js");

const DataCenter_ClassNames = {
    "warrior": "Warrior",
    "lancer": "Lancer",
    "slayer": "Slayer",
    "berserker": "Berserker",
    "sorcerer": "Sorcerer",
    "archer": "Archer",
    "priest": "Priest",
    "elementalist": "Mystic",
    "soulless": "Reaper",
    "engineer": "Gunner",
    "fighter": "Brawler",
    "assassin": "Ninja",
    "glaiver": "Valkyrie"
};

module.exports = function MacroMaker(mod) {
    const { player } = mod.require.library,
        { command } = mod;

    const config = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json")));
    if (!config.enabled) return;
    AHK.init(config.ahkPath);

    let ahk = null,
        macroFile = null,
        hotkeyActions = {},
        skillActions = {},
        reloading = false,
        cooldowns = {},
        lastCast = {},
        enterGameEvent = null,
        leaveGameEvent = null,
        enabled = true,
        debugMode = false,
        lastSkill,
        lastTime;

    mod.game.on('enter_game', enterGameEvent = () => {
        let currentPath;
        if (ahk) {
            ahk.destructor();
            ahk = null;
        }
        if (fs.existsSync(currentPath = path.join(__dirname, "macros", `${mod.game.me.name}-${mod.game.me.serverId}.js`)) || fs.existsSync(currentPath = path.join(__dirname, "macros", `${mod.game.me.name}.js`)) || fs.existsSync(currentPath = path.join(__dirname, "macros", `${DataCenter_ClassNames[mod.game.me.class]}.js`))) {
            macroFile = currentPath;
            compileAndRunMacro();
        }
    });

    mod.game.on("leave_game", leaveGameEvent = () => {
        if (ahk) {
            ahk.destructor();
            ahk = null;
            hotkeyActions = {};
            skillActions = {};
            lastCast = {};
            cooldowns = {};
        }
    });

    command.add("macro", {
        debug() {
            debugMode = !debugMode;
            command.message(`Debug mode is now ${debugMode ? 'en' : 'dis'}abled.`);
        },
        $default() {
            enabled = !enabled;
            command.message(`Macros are now ${enabled ? 'en' : 'dis'}abled.`);
        }
    });

    function getModifiersAndKey(hotkey) {
        const [key, ...modifiers] = hotkey.toLowerCase().split('+').reverse();
        return [`${modifiers.map(x => x.trim())
            .filter(x => ['shift', 'ctrl', 'alt'].includes(x))
            .map(x => { return {'shift': '+', 'ctrl': '^', 'alt': '!'}[x] })
            .join("")}`, `${{"left-click": "LButton", "right-click": "RButton", "middle-click": "MButton"}[key] || key}`];
    }

    function compileAndRunMacro() {
        if (!macroFile) return;
        const macro = require(macroFile);
        if (!macro.enabled) return;

        const keys = new Set();
        const repeaterKeys = new Set();

        let useOutput,
            useRepeater,
            useInput;

        // Parse Hotkeys
        for (let [key, hotkey] of Object.entries(macro.hotkeys)) {
            if (typeof hotkey !== "object" || hotkey.enabled !== true) continue;
            key = getModifiersAndKey(key).join("");

            if (hotkey.repeater) {
                repeaterKeys.add(key);
            }

            const onPress = (typeof hotkey.onPress === "object" && !Array.isArray(hotkey.onPress)) ? [hotkey.onPress] : hotkey.onPress;
            if (Array.isArray(onPress) && onPress.length) {
                useInput = true;
                if (hotkeyActions[key]) {
                    hotkeyActions[key] = hotkeyActions[key].concat(onPress);
                } else {
                    hotkeyActions[key] = onPress;
                }
                keys.add(key);
            }
        }

        // Parse Skills
        for (let [skill, hotkey] of Object.entries(macro.skills)) {
            if (typeof hotkey !== "object" || hotkey.enabled !== true) continue;
            const key = getModifiersAndKey(hotkey.key).join("");

            if (hotkey.repeater) {
                repeaterKeys.add(key);
            }

            const onPress = (typeof hotkey.onPress === "object" && !Array.isArray(hotkey.onPress)) ? [hotkey.onPress] : hotkey.onPress;
            if (Array.isArray(onPress) && onPress.length) {
                useInput = true;
                if (hotkeyActions[key]) {
                    hotkeyActions[key] = hotkeyActions[key].concat(onPress);
                } else {
                    hotkeyActions[key] = onPress;
                }
                keys.add(key);
            }

            const onCast = (typeof hotkey.onCast === "object" && !Array.isArray(hotkey.onCast)) ? [hotkey.onCast] : hotkey.onCast;
            if (Array.isArray(onCast) && onCast.length) {
                if (skillActions[skill]) {
                    skillActions[skill] = skillActions[skill].concat(onCast);
                } else {
                    skillActions[skill] = onCast;
                }
            }
        }

        const compilerPromises = [];

        if (keys.size) {
            useOutput = true;
            compilerPromises.push(AHK.compileOutputAhk([...keys], path.join(__dirname, "ahk", "output.ahk")));
        } else if (fs.existsSync(path.join(__dirname, "ahk", "output.ahk"))) {
            fs.unlinkSync(path.join(__dirname, "ahk", "output.ahk"));
        }

        if (repeaterKeys.size) {
            useRepeater = true;
            compilerPromises.push(AHK.compileRepeaterAhk([...repeaterKeys], macro.toggleRepeaterKey ? getModifiersAndKey(macro.toggleRepeaterKey).join("") : "\\", path.join(__dirname, "ahk", "repeater.ahk")));
        } else if (fs.existsSync(path.join(__dirname, "ahk", "repeater.ahk"))) {
            fs.unlinkSync(path.join(__dirname, "ahk", "repeater.ahk"));
        }

        const promise = Promise.all(compilerPromises);
        promise.then(() => {
            runAhk(useInput, useOutput, useRepeater);
        })
        .catch(err => {
            mod.error(err);
        });

        return promise;
    }

    function handleAction(action, trigger) {
        let delay = (action.delay || 0) / (action.fixedDelay === true ? 1 : player.aspd);

        if (action.enableIfSkillCooldown) {
            const skills = (Array.isArray(action.enableIfSkillCooldown) ? action.enableIfSkillCooldown : [action.enableIfSkillCooldown]).map(x => parseInt(x)).filter(x => !isNaN(x));

            for (const skill of skills) {
                if (!cooldowns[skill] || Date.now() - cooldowns[skill].start >= cooldowns[skill].cooldown - delay) {
                    return;
                }
            }
        }

        if (action.disableIfSkillCooldown) {
            const skills = (Array.isArray(action.enableIfSkillCooldown) ? action.enableIfSkillCooldown : [action.enableIfSkillCooldown]).map(x => parseInt(x)).filter(x => !isNaN(x));

            for (const skill of skills) {
                if (cooldowns[skill] && Date.now() - cooldowns[skill].start < cooldowns[skill].cooldown - delay) {
                    return;
                }
            }
        }

        if (typeof action.inCombat === "boolean" && action.inCombat !== mod.game.me.inCombat) {
            return;
        }

        if (typeof action.skillSubId === "number" && trigger && trigger.skill.id % 100 !== action.skillSubId) {
            return;
        }

        const skillBaseId = trigger ? Math.floor(trigger.skill.id / 1e4) : 0;

        switch (action.action.toLowerCase()) {
            case "keytap": {
                mod.setTimeout(() => {
                    ahk.keyTap(...getModifiersAndKey(action.key).reverse(), action.holdDuration);
                }, delay);
                break;
            }
            case "keyrepeat": {
                mod.setTimeout(() => {
                    ahk.keyRepeat(...getModifiersAndKey(action.key).reverse(), action.duration, action.interval, (action.stopOnNextCast && trigger) ? skillBaseId : 0, (action.stopOnNextCast && trigger) ? lastCast : {skill: 0});
                }, delay);
                break;
            }
            default: {
                mod.warn(`Unknown action ${action.action}`);
                break;
            }
        }
    }

    function runAhk(useInput, useOutput, useRepeater) {
        if (reloading || ahk) return;

        ahk = new AHK(useInput ? path.join(__dirname, "ahk", "input.ahk") : false, useOutput ? path.join(__dirname, "ahk", "output.ahk") : false, useRepeater ? path.join(__dirname, "ahk", "repeater.ahk") : false);

        if (useInput) {
            ahk.on("hotkey_press", hotkey => {
                if (!enabled) return;

                if (hotkeyActions[hotkey]) {
                    hotkeyActions[hotkey].forEach(action => handleAction(action));
                }
            });
        }
    }

    mod.hook("S_ACTION_STAGE", 9, { order: -Infinity, filter: { fake: !!config["skill-prediction"] }}, event => {
        if (event.gameId !== mod.game.me.gameId) return;
        const skillBaseId = Math.floor(event.skill.id / 1e4);
        const skillSubId = event.skill.id % 100;

        if (debugMode && event.stage === 0) {
            command.message(`skillId: ${skillBaseId} subId: ${skillSubId} (${Math.ceil((Date.now() - lastTime) * player.aspd)}ms)`);
            lastSkill = event.skill.id;
            lastTime = Date.now();
        }

        if (!enabled || !ahk) return;

        lastCast.skill = skillBaseId;
        if (skillActions[skillBaseId]) {
            skillActions[skillBaseId].forEach(action => handleAction(action, event));
        }
    });

    mod.hook('S_START_COOLTIME_SKILL', 3, { order: Infinity }, event => {
        const skillBaseId = Math.floor(event.skill.id / 1e4);
        cooldowns[skillBaseId] = { start: Date.now(), cooldown: event.cooldown };
    });

    this.saveState = () => {
        reloading = true;
        command.message("Reloading and recompiling macros. Please wait until it's finished reloading.");
        return { macroFile };
    }

    this.loadState = state => {
        macroFile = state.macroFile;
        const promise = compileAndRunMacro();
        if (promise) {
            promise.then(() => command.message("Finished reloading."));
        } else {
            command.message("Finished reloading.");
        }
    }

    this.destructor = () => {
        if (ahk) {
            ahk.destructor();
        }
        if (enterGameEvent) mod.game.off("enter_game", enterGameEvent);
        if (leaveGameEvent) mod.game.off("leave_game", leaveGameEvent);
        command.remove(['macro']);
    }
}
