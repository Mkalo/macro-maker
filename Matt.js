module.exports = {
    enabled: true,
    toggleRepeaterKey: "\\",
    skills: {
        // Combo Attack
        "1": {
            enabled: true,
            key: "left-click",
            onPress: [
                { action: "keyTap", key: "right-click", delay: 500, holdDuration: 50 }
            ],
        },

        // Stand Fast
        "2": false,

        // Onslaught
        "3": {
            enabled: true,
            key: "f1",
            repeater: true,
        },

        // Challenging Shout
        "4": {
            enabled: true,
            key: "f2",
            repeater: true,
        },

         // Shield Bash
        "5": {
            enabled: true,
            key: "4",
            onCast: [
                { action: "keyRepeat", key: "f1", duration: 500, interval: 50, delay: 400 }
            ],
            repeater: true,
        },

        // Guardian Shout
        "7": {
            enabled: true,
            key: "5",
            repeater: true,
        },

        // Shield Counter
        "8": {
            enabled: true,
            key: "space",
            onPress: [
                { action: "keyRepeat", key: "0", duration: 500, interval: 25, inCombat: true }
            ]
        },

        // Leash
        "9": {
            enabled: true,
            key: "shift+r",
            repeater: true,
        },

         // Debilitate
        "10": {
            enabled: true,
            key: "f3",
            repeater: true,
        },

        // Retaliate
        "11": false,

        // Infuriate
        "12": {
            enabled: true,
            key: "f9",
            onPress: [
                { action: "keyRepeat", key: "f10", duration: 500, interval: 50, delay: 1000, fixedDelay: true }
            ],
            repeater: true,
        },

        // Spring Attack
        "13": {
            enabled: true,
            key: "3",
            onCast: [
                { action: "keyRepeat", key: "f4", skillSubId: 0, duration: 400, interval: 50, delay: 1850, disableIfSkillCooldown: "25", stopOnNextCast: true },
                { action: "keyRepeat", key: "f4", skillSubId: 30, duration: 400, interval: 50, delay: 940, disableIfSkillCooldown: "25", stopOnNextCast: true },
                { action: "keyRepeat", key: "right-click", skillSubId: 0, duration: 400, interval: 50, delay: 1850, enableIfSkillCooldown: "25", stopOnNextCast: true },
                { action: "keyRepeat", key: "right-click", skillSubId: 30, duration: 400, interval: 50, delay: 940, enableIfSkillCooldown: "25", stopOnNextCast: true },
            ],
            repeater: true,
        },

        // Charging Lunge
        "15": {
            enabled: true,
            key: "6",
            repeater: true,
        },

        // Second Wind
        "16": {
            enabled: true,
            key: "f7",
            repeater: true,
        },

        // Adrenaline Rush
        "17": {
            enabled: true,
            key: "f6",
            onPress: [
                { action: "keyRepeat", key: "f8", duration: 500, interval: 100, delay: 500, fixedDelay: true },
                { action: "keyRepeat", key: "f10", duration: 500, interval: 100, delay: 500, fixedDelay: true },
                { action: "keyRepeat", key: "=", duration: 500, interval: 100, delay: 500, fixedDelay: true }
            ],
            repeater: true,
        },

        // Shield Barrage
        "18": {
            enabled: true,
            key: "2",
            repeater: true,
        },

        // Pledge of Protection
        "19": {
            enabled: true,
            key: "shift+q",
            repeater: true,
        },

        // Lockdown Blow
        "21": {
            enabled: true,
            key: "middle-click",
            repeater: true,
        },

        // Iron Will
        "22": {
            enabled: true,
            key: "r",
            repeater: true,
        },

        // Master's Leash
        "23": false,

        // Chained Leash
        "24": {
            enabled: true,
            key: "7",
            repeater: true,
        },

        // Wallop
        "25": {
            enabled: true,
            key: "f4",
            repeater: true,
        },

        // Backstep
        "26": false,

        // Rallying Cry
        "27": {
            enabled: true,
            key: "shift+e",
            repeater: true,
        },

        // Super Leap
        "28": {
            enabled: true,
            key: "f5",
            repeater: true,
        },

        // Guardian's Barrier
        "29": false,

        // Divine Protection
        "30": {
            enabled: true,
            key: "f12",
            repeater: true,
        },

        // Apex Urgency
        "910": false,
    },
    hotkeys: {
        "f11": {
            enabled: true,
            repeater: true,
        }
    }
}
