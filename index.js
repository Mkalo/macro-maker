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
    AHK.init(config.ahkPath.replace(/%(.+?)%/g, (_, match) => process.env[match] || _));
    mod.game.initialize("me.abnormalities");

    const teraPid = mod.clientInterface.info.pid,
        selfPid = process.pid;

    let ahk = null,
        macroFile = null,
        macroConfig = null,
        hotkeyActions = {},
        skillActions = {},
        reloading = false,
        loading = false,
        cooldowns = {},
        lastCast = {},
        emulatedSkills = {},
        enterGameEvent = null,
        leaveGameEvent = null,
        enterCombatEvent = null,
        leaveCombatEvent = null,
        enabled = true,
        debugMode = false,
        abnormalDebug = false,
        lastSkill,
        lastTime,
        lastSpeed,
        useOutput,
        useRepeater,
        useInput,
        compiled;

    let regexOut;
    fs.readdirSync(path.join(__dirname, "ahk"))
    .filter(x => path.extname(x) === '.ahk' && (!(regexOut = /[a-z]+_(\d+)_\d+/g.exec(path.basename(x))) || regexOut[1] != selfPid))
    .forEach(file => {
        try {
            fs.unlinkSync(path.join(__dirname, "ahk", file));
        } catch (e) { }
    });
    
    mod.setTimeout(() => {
        if (mod.game.isIngame && !reloading && !macroFile) {
            let currentPath;
            if (fs.existsSync(currentPath = path.join(__dirname, "macros", `${mod.game.me.name}-${mod.game.me.serverId}.js`)) || fs.existsSync(currentPath = path.join(__dirname, "macros", `${mod.game.me.name}.js`)) || fs.existsSync(currentPath = path.join(__dirname, "macros", `${DataCenter_ClassNames[mod.game.me.class]}.js`))) {
                macroFile = currentPath;
                compileAndRunMacro();
            }
        }
    }, 1000);

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
            emulatedSkills = {};
        }
    });

    if (config.repeaterOnlyInCombat) {
        mod.game.me.on('enter_combat', enterCombatEvent = () => {
            if (ahk) {
                ahk.keyTap("f24", "");
            }
        });

        mod.game.me.on('leave_combat', leaveCombatEvent = () => {
            if (ahk) {
                ahk.keyTap("f23", "");
            }
        });
    }

    command.add("macro", {
        debug(type) {
            if (!type) {
                debugMode = !debugMode;
                command.message(`Debug mode is now ${debugMode ? 'en' : 'dis'}abled.`);
            } else {
                switch (type.toLowerCase()) {
                    case "abnormal": {
                        abnormalDebug = !abnormalDebug;
                        command.message(`Abnormal debug is now ${abnormalDebug ? 'en' : 'dis'}abled.`);
                        break;
                    }
                    default: {
                        command.message(`Unknown debug type ${type}.`);
                        break;
                    }
                }
            }
        },
        async $default() {
            enabled = !enabled;
            if (enabled) {
                if (compiled) {
                    runAhk(useInput, useOutput, useRepeater);
                } else {
                    await compileAndRunMacro();
                }
            } else if (ahk) {
                ahk.destructor();
                ahk = null;
            }

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
        macroConfig = require(macroFile);
        if (!macroConfig.enabled) return;

        const keys = new Set();
        const repeaterKeys = new Set();

        useOutput = false;
        useRepeater = false;
        useInput = false;

        if (macroConfig.hotkeys) {
            // Parse Hotkeys
            for (let [key, hotkey] of Object.entries(macroConfig.hotkeys)) {
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
        }

        if (macroConfig.skills) {
            // Parse Skills
            for (let [skill, hotkey] of Object.entries(macroConfig.skills)) {
                if (typeof hotkey !== "object" || hotkey.enabled !== true) continue;

                if (typeof hotkey.key === "string") {
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
                }

                const onCast = (typeof hotkey.onCast === "object" && !Array.isArray(hotkey.onCast)) ? [hotkey.onCast] : hotkey.onCast;
                if (Array.isArray(onCast) && onCast.length) {
                    useInput = true;
                    if (skillActions[skill]) {
                        skillActions[skill] = skillActions[skill].concat(onCast);
                    } else {
                        skillActions[skill] = onCast;
                    }
                }
            }
        }

        const compilerPromises = [];

        if (keys.size) {
            useOutput = true;
            compilerPromises.push(AHK.compileOutputAhk(path.join(__dirname, "ahk", `output_${selfPid}_${teraPid}.ahk`), teraPid, [...keys]));
        }

        if (repeaterKeys.size) {
            useRepeater = true;
            compilerPromises.push(AHK.compileRepeaterAhk(path.join(__dirname, "ahk", `repeater_${selfPid}_${teraPid}.ahk`), teraPid, [...repeaterKeys], macroConfig.toggleRepeaterKey ? getModifiersAndKey(macroConfig.toggleRepeaterKey).join("") : "\\", config.repeaterStartSuspended));
        }

        if (useInput || config.repeaterOnlyInCombat) {
            useInput = true;
            compilerPromises.push(AHK.compileInputAhk(path.join(__dirname, "ahk", `input_${selfPid}_${teraPid}.ahk`), teraPid));
        }

        const promise = Promise.all(compilerPromises);
        promise.then(() => {
            runAhk(useInput, useOutput, useRepeater);
            compiled = true;
        })
        .catch(err => {
            mod.error(err);
            compiled = false;
        });

        return promise;
    }

    function handleAction(action, trigger) {
        let delay = (action.delay || 0) / (action.fixedDelay === true ? 1 : Math.max(player.aspd, trigger ? trigger.speed : 0));

        if (action.enableIfSkillCooldown) {
            const skills = (Array.isArray(action.enableIfSkillCooldown) ? action.enableIfSkillCooldown : [action.enableIfSkillCooldown]).map(x => parseInt(x)).filter(x => !isNaN(x));

            for (const skill of skills) {
                if (!cooldowns[skill] || Date.now() - cooldowns[skill].start >= cooldowns[skill].cooldown - delay) {
                    return;
                }
            }
        }

        if (action.disableIfSkillCooldown) {
            const skills = (Array.isArray(action.disableIfSkillCooldown) ? action.disableIfSkillCooldown : [action.disableIfSkillCooldown]).map(x => parseInt(x)).filter(x => !isNaN(x));

            for (const skill of skills) {
                if (cooldowns[skill] && Date.now() - cooldowns[skill].start < cooldowns[skill].cooldown - delay) {
                    return;
                }
            }
        }

        if (action.enableIfAbnormality) {
            const abnormalities = (Array.isArray(action.enableIfAbnormality) ? action.enableIfAbnormality : [action.enableIfAbnormality]).map(x => parseInt(x)).filter(x => !isNaN(x));

            for (const abnormalityId of abnormalities) {
                const abnormality = mod.game.me.abnormalities[abnormalityId];
                if (!abnormality) return;
                
                if (abnormality.remaining < delay) {
                    return;
                }
            }
        }

        if (action.disableIfAbnormality) {
            const abnormalities = (Array.isArray(action.disableIfAbnormality) ? action.disableIfAbnormality : [action.disableIfAbnormality]).map(x => parseInt(x)).filter(x => !isNaN(x));

            for (const abnormalityId of abnormalities) {
                const abnormality = mod.game.me.abnormalities[abnormalityId];
                if (!abnormality) continue;
                
                if (abnormality.remaining >= delay) {
                    return;
                }
            }
        }

        if (typeof action.inCombat === "boolean" && action.inCombat !== mod.game.me.inCombat) {
            return;
        }

        const skillSubIds = (!Array.isArray(action.skillSubId) ? [action.skillSubId] : action.skillSubId).filter(x => !isNaN(x)).map(x => parseInt(x));

        if (trigger && skillSubIds.length > 0 && !skillSubIds.includes(trigger.skill.id % 100)) {
            return;
        }

        const skillBaseId = trigger ? Math.floor(trigger.skill.id / 1e4) : 0;
        const actionKey = action.skill ? macroConfig.skills[action.skill].key : action.key;

        switch (action.action.toLowerCase()) {
            case "keytap": {
                if (!actionKey) return;
                mod.setTimeout(() => {
                    ahk.keyTap(...getModifiersAndKey(actionKey).reverse(), action.holdDuration);
                }, delay);
                break;
            }
            case "keyrepeat": {
                if (!actionKey) return;
                mod.setTimeout(() => {
                    ahk.keyRepeat(...getModifiersAndKey(actionKey).reverse(), action.duration, action.interval, (action.stopOnNextCast && trigger) ? skillBaseId : 0, (action.stopOnNextCast && trigger) ? lastCast : {skill: 0});
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

        ahk = new AHK(useInput ? path.join(__dirname, "ahk", `input_${selfPid}_${teraPid}.ahk`) : false, useOutput ? path.join(__dirname, "ahk", `output_${selfPid}_${teraPid}.ahk`) : false, useRepeater ? path.join(__dirname, "ahk", `repeater_${selfPid}_${teraPid}.ahk`) : false);

        if (useOutput) {
            ahk.on("hotkey_press", hotkey => {
                if (!enabled) return;

                if (hotkeyActions[hotkey]) {
                    hotkeyActions[hotkey].forEach(action => handleAction(action));
                }
            });
        }
    }

    mod.hook("S_ACTION_STAGE", 9, { order: -Infinity, filter: { fake: null }}, (event, fake) => {
        if (event.gameId !== mod.game.me.gameId) return;

        if (!(event.skill.id in emulatedSkills)) {
            emulatedSkills[event.skill.id] = fake;
        } else if (emulatedSkills[event.skill.id] !== fake) {
            return;
        }
        
        const skillBaseId = Math.floor(event.skill.id / 1e4);
        const skillSubId = event.skill.id % 100;

        if (debugMode && event.stage === 0) {
            command.message(`skillId: ${skillBaseId} subId: ${skillSubId} (${Math.ceil((Date.now() - lastTime) * lastSpeed)}ms)`);
            lastSkill = event.skill.id;
            lastTime = Date.now();
            lastSpeed = Math.max(player.aspd, event.speed);
        }

        if (!enabled || !ahk || event.stage !== 0) return;

        lastCast.skill = skillBaseId;
        if (skillActions[skillBaseId]) {
            skillActions[skillBaseId].forEach(action => handleAction(action, event));
        }
    });

    mod.hook('S_START_COOLTIME_SKILL', 3, { order: Infinity }, event => {
        const skillBaseId = Math.floor(event.skill.id / 1e4);
        cooldowns[skillBaseId] = { start: Date.now(), cooldown: event.cooldown };
    });

    mod.hook('S_DECREASE_COOLTIME_SKILL', 3, { order: Infinity }, event => {
        const skillBaseId = Math.floor(event.skill.id / 1e4);
        cooldowns[skillBaseId] = { start: Date.now(), cooldown: event.cooldown };
    });

    mod.hook('S_ABNORMALITY_BEGIN', 4, { order: Infinity, filter: { fake: null } }, event => {
        if (!abnormalDebug || event.target !== mod.game.me.gameId || !(event.id in mod.game.me.abnormalities)) return;
        const abnormality = mod.game.me.abnormalities[event.id];
        command.message(`${abnormality.data.name || "Unnamed"} (ID: ${abnormality.id} duration: ${abnormality.data.time})`);
    });

    this.saveState = () => {
        reloading = true;
        command.message("Reloading and recompiling macros. Please wait until it's finished reloading.");
        return { macroFile };
    }

    this.loadState = state => {
        loading = true;
        macroFile = state.macroFile;
        const promise = compileAndRunMacro();
        if (promise) {
            promise.then(() => {
                loading = false;
                command.message("Finished reloading.");
            })
            .catch(() => {
                loading = false;
                command.message("Failed to compile macro while reloading.");
            });
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
        if (enterCombatEvent) mod.game.me.off("enter_combat", enterCombatEvent);
        if (leaveCombatEvent) mod.game.me.off("leave_combat", leaveCombatEvent);
        command.remove(['macro']);
    }
}
