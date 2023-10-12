;
export class Command {
    type;
    flags = new Set();
    args = new Map();
    constructor({ type, flags, args }) {
        this.type = type;
        for (const flag of flags) {
            this.flags.add(flag);
        }
        for (const arg in args) {
            this.args.set(arg, args[arg]);
        }
    }
    isSet(flag) { return this.flags.has(flag); }
    getParam(arg, fallback = null) {
        if (this.args.has(arg))
            return this.args.get(arg); // return paramater that DOES exist
        else
            return fallback; // return default value if doesn't exist
    }
}
export class SimpleShell {
    terminal;
    commands = new Map();
    constructor(terminal) {
        this.terminal = terminal;
        this.terminal.onCommand(this.onCommand.bind(this));
    }
    onCommand(text) {
        this.terminal.repeatInputText();
        /* TODO:
          - create function to split commands apart by "|", ";", "&&", "||", (and be expandable to other separators with other actions)
          - create function to parse individual commands to determine meaning
            - Create helper for nested operators and whatnot
        */
    }
    splitCommands(text) {
        return;
    }
    addCommand(name, cmdData) {
        this.commands.set(name, cmdData); // completely willing to override old command names
    }
    addCommands(cmdDatas) {
        for (const name in cmdDatas) {
            this.addCommand(name, cmdDatas[name]);
        }
    }
}
//# sourceMappingURL=cmd.js.map