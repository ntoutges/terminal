export const name = "global";
export const module = {
    "echo": {
        args: {},
        oargs: {
            "e": "The value to echo"
        },
        flags: {
            "U": "print all characters in (U)ppercase",
            "l": "print all characters in (l)owercase"
        },
        execute: echoExecute,
    },
    "delay": {
        args: {
            "delay": "The amount of time to delay"
        },
        oargs: {
            "unit": "[u]nit to use when executing delay: ms/s/min/h"
        },
        flags: {
            "c": "show [C]ountdown"
        },
        validate: delayValidate,
        execute: delayExecute,
    },
    "help": {
        args: {
            "command": "The command to receive information on"
        },
        validate: helpValidate,
        execute: helpExecute
    },
    "list": {
        args: {
            "pattern": "string containing text to match"
        },
        flags: {
            "r": "Interpret pattern as RegEx",
            "i": "Ignore case"
        },
        validate: listValidate,
        execute: listExecute
    },
    "clear": {
        args: {},
        flags: {
            "h": "Clear command [h]istory"
        },
        execute: clearExecute
    }
};
function echoExecute(command, terminal, input = "") {
    return new Promise((resolve, reject) => {
        let text = (input + command.getParam("e", "")).replaceAll("\\n", "\n");
        if (command.hasFlag("U"))
            text = text.toUpperCase();
        else if (command.hasFlag("l"))
            text = text.toLowerCase();
        resolve(text);
    });
}
function delayValidate(command) {
    const integer = parseFloat(command.getParam("delay", "0"));
    const unit = command.getParam("unit", "ms");
    if (isNaN(integer) || integer < 0)
        return "Invalid delay value.";
    command.setParam("delay", integer.toString());
    if (!["ms", "s", "min", "h"].includes(unit))
        return "Invalid unit";
    return "";
}
function delayExecute(command, terminal, input = "") {
    return new Promise((resolve, reject) => {
        let delay = parseFloat(command.getParam("delay"));
        switch (command.getParam("unit")) {
            case "s":
                delay *= 1000;
                break;
            case "min":
                delay *= 60000;
                break;
            case "h":
                delay *= 3600000;
                break;
        }
        let interval = undefined;
        const timeout = setTimeout(() => {
            if (interval) {
                clearInterval(interval);
                terminal.print("\r");
            }
            resolve(delay.toString());
        }, delay);
        if (command.hasFlag("c")) {
            const end = (new Date()).getTime() + delay;
            interval = setInterval(() => {
                if (command.isCanceled) {
                    clearInterval(interval);
                    clearTimeout(timeout);
                    return;
                }
                const now = (new Date()).getTime();
                terminal.print(`\r${end - now}ms`);
            }, 10);
        }
    });
}
function helpValidate(command) {
    const cmd = command.getParam("command");
    if (!this.isCommand(cmd))
        return `Invalid command \"${cmd}\"`;
    return "";
}
const helpColors = ['#88feff', '#88b7ff', '#fff788', '#d288ff', '#88ffb3', '#ff8888', '#b5ff88'];
function helpExecute(command, terminal, input = "") {
    return new Promise((resolve, reject) => {
        const name = command.getParam("command");
        const cmd = this.getCommand(command.getParam("command"));
        let finalStr = "";
        const flags = cmd.flags;
        const oargs = cmd.oargs;
        const args = cmd.args;
        let seperator = "";
        let gI = 0;
        terminal.println(`--- %c{font-weight:bold}${name}%c{} ---`);
        const flagKeys = Object.keys(flags);
        const inlineFlagStr = flagKeys.map((flagName, i) => { return `%c{color:${helpGetColor(0)}}-${flagName}%c{}`; }).join(" ") ?? "None.";
        const flagStr = flagKeys.map((flagName, i) => { return `* %c{color:${helpGetColor(0)}}-${flagName}%c{}: ${flags[flagName]}`; }).join("\n") ?? "";
        gI += flagKeys.length;
        if (inlineFlagStr.length) {
            finalStr += `* Flags: ${inlineFlagStr}\n${flagStr}\n`;
            seperator = "*\n";
        }
        const oargKeys = Object.keys(oargs);
        const inlineOargStr = oargKeys.map((oargName, i) => { return `%c{color:${helpGetColor(1)}}[-${oargName}]%c{}`; }).join(" ");
        const oargStr = oargKeys.map((oargName, i) => { return `* %c{color:${helpGetColor(1)}}-${oargName}%c{}: ${oargs[oargName]}`; }).join("\n");
        gI += oargKeys.length;
        if (inlineOargStr.length) {
            finalStr += `${seperator}* Optional Arguments: ${inlineOargStr}\n${oargStr}\n`;
            seperator = "*\n";
        }
        const argKeys = Object.keys(args);
        const inlineArgStr = argKeys.map((argName, i) => { return `%c{text-decoration:underline;color:${helpGetColor(2)}}${argName}%c{}`; }).join(",");
        const argStr = argKeys.map((argName, i) => { return `* %c{color:${helpGetColor(2)}}${argName}%c{}: ${args[argName]}`; }).join("\n");
        if (inlineArgStr.length) {
            finalStr += `${seperator}* Arguments: ${inlineArgStr}\n${argStr}`;
        }
        resolve(finalStr);
    });
}
function helpGetColor(i) {
    return helpColors[i % helpColors.length];
}
function listValidate(command) {
    if (command.hasFlag("r")) { // ensure regex works
        try {
            new RegExp(command.getParam("pattern"));
        }
        catch (regexErr) {
            return regexErr.message;
        }
    }
    else if (command.hasFlag("i"))
        command.setParam("pattern", command.getParam("pattern", "").toLowerCase()); // lowercase everything in prep for case-insensitive search
    return "";
}
function listExecute(command, terminal, input = "") {
    return new Promise((resolve, reject) => {
        const commandList = this.getCommands();
        const matchingCommands = [];
        const ignoreCase = command.hasFlag("i");
        if (command.hasFlag("r")) {
            const pattern = new RegExp(command.getParam("pattern"), ignoreCase ? "i" : "");
            for (const command of commandList) {
                const matchData = command.match(pattern);
                if (matchData) {
                    if (matchData[0].length == 0)
                        matchingCommands.push(`%c{color:#86f785}${command}%c{}`);
                    else {
                        matchingCommands.push(command.replace(matchData[0], "%c{color:#86f785}$&%c{}"));
                    }
                }
            }
        }
        else {
            const pattern = command.getParam("pattern");
            for (const command of commandList) {
                if (command.includes(pattern)) {
                    if (pattern.length == 0)
                        matchingCommands.push(`%c{color:#86f785}${command}%c{}`);
                    else {
                        matchingCommands.push(command.replace(pattern, "%c{color:#86f785}$&%c{}"));
                    }
                }
            }
        }
        resolve(matchingCommands.join("\n"));
    });
}
function clearExecute(command, terminal, input = "") {
    return new Promise(resolve => {
        terminal.clear(command.hasFlag("h"));
        resolve("");
    });
}
//# sourceMappingURL=global.js.map