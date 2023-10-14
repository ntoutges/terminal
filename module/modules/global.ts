import { Command, CommandStructure } from "../cmd.js";
import { Terminal } from "../terminal.js";

export const name = "global";

export const module: Record<string, CommandStructure> = {
  "echo": {
    args: {},
    oargs: {
      "e": "The value to echo",
      "l": "Last characters added to the end"
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
}

function echoExecute(command: Command, terminal: Terminal, input:string="") {
  return new Promise<string>((resolve,reject) => {
    command.endText = command.getArg("l","\n");
    let text = (input + command.getArg("e","")).replaceAll("\\r", "\r").replaceAll("\\n", "\n");
    if (command.hasFlag("U")) text = text.toUpperCase();
    else if (command.hasFlag("l")) text = text.toLowerCase();
    
    resolve(text);
  });
}

function delayValidate(command: Command): string {
  const integer = parseFloat(command.getArg("delay", "0"));
  const unit = command.getArg("unit", "ms");

  if (isNaN(integer) || integer < 0) return "Invalid delay value.";
  command.setArg("delay", integer.toString());
  if (!["ms","s","min","h"].includes(unit)) return "Invalid unit";
  return "";
}

function delayExecute(command: Command, terminal: Terminal, input:string="") {
  return new Promise<string>((resolve,reject) => {
    let delay = parseFloat(command.getArg("delay"));
    switch (command.getArg("unit")) {
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
      resolve("");
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
        terminal.print(`\r${end-now}ms`);
      }, 10);
    }
  });
}

function helpValidate(command: Command) {
  const cmd = command.getArg("command");
  if (!this.isCommand(cmd)) return `Invalid command \"${cmd}\"`;
  return "";
}

const helpColors = [ '#88feff', '#88b7ff', '#fff788', '#d288ff', '#88ffb3', '#ff8888', '#b5ff88'];
function helpExecute(command: Command, terminal: Terminal, input:string="") {
  return new Promise<string>((resolve,reject) => {
    const name = command.getArg("command");
    const cmd = this.getCommand(command.getArg("command")) as CommandStructure;

    let finalStr = "";

    const flags = cmd.flags;
    const oargs = cmd.oargs;
    const args = cmd.args;

    let seperator = "";

    let gI = 0;    
    terminal.println(`--- %c{font-weight:bold}${name}%c{} ---`);

    const flagKeys = Object.keys(flags);
    const inlineFlagStr = flagKeys.map((flagName,i) => { return `%c{color:${helpGetColor(0)}}-${flagName}%c{}`; }).join(" ") ?? "None.";
    const flagStr = flagKeys.map((flagName,i) => { return `* %c{color:${helpGetColor(0)}}-${flagName}%c{}: ${flags[flagName]}`; }).join("\n") ?? "";
    gI += flagKeys.length;
    if (inlineFlagStr.length) {
      finalStr += `* Flags: ${inlineFlagStr}\n${flagStr}\n`;
      seperator = "*\n";
    }

    const oargKeys = Object.keys(oargs);
    const inlineOargStr = oargKeys.map((oargName,i) => { return `%c{color:${helpGetColor(1)}}[-${oargName}]%c{}`; }).join(" ");
    const oargStr = oargKeys.map((oargName,i) => { return `* %c{color:${helpGetColor(1)}}-${oargName}%c{}: ${oargs[oargName]}`; }).join("\n");
    gI += oargKeys.length;
    if (inlineOargStr.length) {
      finalStr += `${seperator}* Optional Arguments: ${inlineOargStr}\n${oargStr}\n`;
      seperator = "*\n";
    }
    
    const argKeys = Object.keys(args);
    const inlineArgStr = argKeys.map((argName,i) => { return `%c{text-decoration:underline;color:${helpGetColor(2)}}${argName}%c{}`; }).join(",");
    const argStr = argKeys.map((argName,i) => { return `* %c{color:${helpGetColor(2)}}${argName}%c{}: ${args[argName]}`; }).join("\n");
    if (inlineArgStr.length) {
      finalStr += `${seperator}* Arguments: ${inlineArgStr}\n${argStr}`;
    }

    resolve(finalStr);
  });
}

function helpGetColor(i: number) {
  return helpColors[i % helpColors.length];
}

function listValidate(command: Command) {
  if (command.hasFlag("r")) { // ensure regex works
    try { new RegExp(command.getArg("pattern")); }
    catch(regexErr) { return regexErr.message; }
  }
  else if (command.hasFlag("i")) command.setArg("pattern", command.getArg("pattern", "").toLowerCase()); // lowercase everything in prep for case-insensitive search
  return "";
}

function listExecute(command: Command, terminal: Terminal, input:string="") {
  return new Promise<string>((resolve,reject) => {
    const commandList = this.getCommands();
    const matchingCommands = [];
    const ignoreCase = command.hasFlag("i");

    if (command.hasFlag("r")) {
      const pattern = new RegExp(command.getArg("pattern"), ignoreCase ? "i" : "");
      for (const command of commandList) {
        const matchData = command.match(pattern);
        if (matchData) {
          if (matchData[0].length == 0) matchingCommands.push( `%c{color:#86f785}${command}%c{}` );
          else {
            matchingCommands.push(
              command.replace(
                matchData[0],
                "%c{color:#86f785}$&%c{}"
              )
            );
          }
        }
      }
    }
    else {
      const pattern = command.getArg("pattern");
      for (const command of commandList) { 
        if (command.includes(pattern)) {
          if (pattern.length == 0) matchingCommands.push( `%c{color:#86f785}${command}%c{}` );
          else {
            matchingCommands.push(
              command.replace(
                pattern,
                "%c{color:#86f785}$&%c{}"
              )
            );
          }
        }
      }
    }

    resolve(matchingCommands.join("\n"));
  });
}

function clearExecute(command: Command, terminal: Terminal, input:string="") {
  return new Promise<string>(resolve => {
    terminal.clear(command.hasFlag("h"));
    resolve("");
  });
}
