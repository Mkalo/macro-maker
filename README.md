## Macro Maker

TERA Toolbox module to help you making macros for your classes and characters. It uses no native dependency other than AutoHotkey, so make sure you have it installed. You can download AutoHotkey from [here](https://www.autohotkey.com/).

---

## How does it work?

The module works by transpiling the config that is inside the macros folder to AHK. The module will look for 3 kinds of file inside macros in this order: Name-ServerId.js, Name.js, Class.js. It's gonna use the first file it finds, that way you can have individual macro settings for each class or for each character individually or even for each character in different servers/regions.

---

## Config

In the config.json file, you have to put the path to where your AutoHotkey.exe is installed. Also you should change **skill-prediction** to false in case you don't use any kind of module that is "skill-prediction like" (any module that simulate your skills with fake skill packets).  

---

## Commands

| Command                    | Description         |
| -------------------------- |-------------------- |
| !macro                     | Toggles macro on and off |
| !macro debug               | Toggles skill debug on and off |
| !proxy reload macro-maker  | Reloads macro and recompile it. **Don't reload again while it's reloading.** |

---

## Debugging

For the skill debug, every time you cast a skill it will tell you in proxy chat:
```
skillId: XX subId: YY (ZZms)
```
The skillId and subId are the ids of the skill that you just casted and the time in ms from your last casted skill adjusted for your attackspeed. This should make it easier for you to setup delays in your macros for each skill.
**Keep in mind there is always a small overhead for each keypress, make your macros with this in mind**

---

## Configurating the Macro.js file

So I will explain and breakdown what each field inside the Macro.js file does. I advise you to use a text editor that has syntax highlight like [Visual Studio Code](https://code.visualstudio.com/) to edit the file, so you can easily spot any missing comma or bracket.

* enabled: **true|false** - Enables or disables the entire macro.
* toggleRepeaterKey: **key** - Key that will be used to toggle the key repeater on and off. (More on the repeater down below)
* skills: *MacroSkillConfig*
* hotkeys: *MacroHotkeysConfig*

The list of keys can be found [here](https://www.autohotkey.com/docs/KeyList.htm). Keep in mind that to make it easier to configurate combo keys, you can use something like: **Ctrl+Shift+E** or **Shift+Alt+Z**. The valid modifiers are **Ctrl, Shift and Alt**, and the key can be any key from that list. There is also the key values of **left-click, right-click and middle-click** but you could also use the codes from the list like **LButton, RButton and MButton**.

#### MacroSkillConfig

Each key is a base skill id, and the value is the configuration for that skill, the config looks like this:

* skillBaseId: {
    * enabled: **true|false** - Enables this one macro
    * key: **key** - Key that will be used for this macro, only used if onPress or repeater is present
    * repeater: **true|false** - If this is set to true, whenever you have this key pressed down, it will spam it until you release it
    * onPress: *MacroAction|[MacroActions]* - Actions to take on key press
    * onCast: *MacroAction|[MacroActions]* - Actions to take on skill cast

#### MacroHotkeysConfig

Each key is the hotkey that is being configured.

* key: {
    * enabled: **true|false** - Enables this one macro
    * repeater: **true|false** - If this is set to true, whenever you have this key pressed down, it will spam it until you release it
    * onPress: *MacroAction|[MacroActions]* - Actions to take on key press

#### MacroActions

This is where most of the configuration is done.
Array of actions that are going to be processed. You can have multiple actions per macro. One action looks like this:

* action: **keyTap|keyRepeat** - Either tap the specified key once or repeat it for given **duration** every **interval** ms
* delay: **delay** - Will delay this action for **delay** ms, scales with attack speed unless fixedDelay is set to true.
* key: **key** - Key that will be used for this action
* holdDuration: **duration** - Only used if action is a keyTap, will hold the key for the given duration instead of instantly releasing
* fixedDelay: **true|false** - If set to true, action will be delayed for **delay** ms without attack speed scaling.
* duration: **duration** - Required if action is a keyRepeat, will repeat key presses for **duration** ms
* interval: **interval** - Required if action is a keyRepeat, will repeat key pesses every **interval** ms
* inCombat: **true|false** - If set, action only happens if inCombat state equals to this value
* skillSubId: **subId** - Used on onCast only, specify which skill sub id to trigger action
* stopOnNextCast: **true|false** - Used on onCast only if action type **keyRepeat**, stops key presses after casting a skill
* enableIfSkillCooldown: **skill|[skills]** - This action is only executed if these skill(s) are on cooldown
* disableIfSkillCooldown: **skill|[skills]** - This action is only executed if these skill(s) are not on cooldown

#### Example

Spring Attack -> Wallop only if Wallop is not on cooldown, block cancel it otherwise.

```JavaScript
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
}
```
For most chained skills, you will need different delay times, you can do that by using the skillSubId as I used. 

You can see more examples here [Matt.js](https://github.com/Mkalo/macro-maker/blob/master/Matt.js).

## Known Issues

Dual client not supported, and it will bug out.
XButton1 and XButton2 are not working properly.
