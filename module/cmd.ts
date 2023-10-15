import { ChainLink, createChain } from "./chaining.js";
import { Terminal } from "./terminal.js";
import { FileSystem } from "./drive.js";
import { Server } from "./vserver/server.js";
import { Client } from "./vserver/client.js";

const splitters = ["||","&&","|",";"];
const encapsulators = { "\"": "\"", "'": "'" };

interface CommandInterface {
  type: string,
  flags: string[],
  args: Record<string, string>
};

export class Command {
  private readonly type: string;
  private readonly flags: Set<string> = new Set<string>();
  private readonly args: Map<string, string> = new Map<string,string>();
  private readonly temps: Map<string,any> = new Map<string,any>(); // used mainly by validate functions--parsing data means they may as well interpret results as well
  private _isCanceled: boolean = false;
  endText: string = "\n";
  constructor({
    type,
    flags,
    args
  }: CommandInterface) {
    this.type = type;

    for (const flag of flags) { this.flags.add(flag); }
    for (const arg in args) { this.args.set(arg, args[arg]); }
  }

  hasFlag(flag: string) { return this.flags.has(flag); }
  getArg(arg: string, fallback: string = null) {
    if (this.args.has(arg)) return this.args.get(arg); // return paramater that DOES exist
    else return fallback; // return default value if doesn't exist
  }
  setArg(arg: string, value: string) { this.args.set(arg, value); }
  hasArg(arg: string) { return this.args.has(arg); }

  getTemp(temp:string, fallback:string = null) {
    if (this.temps.has(temp)) return this.temps.get(temp);
    else return fallback; // return default value if doesn't exist
  }
  setTemp(temp:string, value:any) { this.temps.set(temp,value); }
  hasTemp(temp:string) { return this.temps.has(temp); }

  cancel() { this._isCanceled = true; }
  get isCanceled() { return this._isCanceled; }
}

export type CommandStructure = {
  args?: Record<string,string> // argument name: description
  oargs?: Record<string,string> // (o)ptional arguments; only accessible through -argname argvalue
  flags?: Record<string,string> // flags; like oargs, but these don't get values
  validate?: (command: Command) => string // able to do preprocessing on Command; returns empty string if command data is good, non-empty if invalid
  execute: (command: Command, terminal: Terminal, input: string) => Promise<string>
}

export class SimpleShell {
  protected readonly terminal: Terminal;
  protected readonly commands: Map<string,CommandStructure> = new Map<string,CommandStructure>();
  protected currentCommand: Command = null;
  readonly fs: FileSystem;

  readonly client: Client;
  readonly server: Server 

  private readonly toInit: Array<()=>void> = [];

  constructor(
    terminal: Terminal,
    driveLetter: string = "C"
  ) {
    this.terminal = terminal;
    this.terminal.onCommand(this.onCommand.bind(this));
    this.terminal.onCancel(this.cancelCommand.bind(this));

    this.fs = new FileSystem(driveLetter);
  }

  protected onCommand(text: string) {
    this.terminal.repeatInputText(text, false);
    let chain: ChainLink;
    try { chain = createChain(text, splitters, encapsulators); }
    catch(err) {
      this.terminal.println(`%c{color:var(--console-err)}${err.message}`);
      return;
    }

    this.terminal.disable();
    this.currentCommand = null;
    this.runCommand(
      chain,
      "",
      true
    );
  }

  protected cancelCommand() {
    if (this.currentCommand) {
      this.currentCommand.cancel();
    }
  }

  protected runCommand(
    chain: ChainLink,
    lastOutput: string,
    lastStatus: boolean
  ) {
    if (this.currentCommand?.isCanceled) { // stop everything
      this.currentCommand = null; // reset
      return;
    }

    const cmdData = chain.execute( lastOutput, lastStatus );
    if (cmdData.command == null) { // finished--print output
      if (lastOutput.length > 0) this.terminal.print(lastOutput);
      this.currentCommand = null; // reset
      this.terminal.enable();
      return;
    }
    if (cmdData.output.length > 0) {
      this.terminal.print(cmdData.output); // next command doesn't use this, so print it out
    }

    const parts = this.extractText(cmdData.command);
    const name = parts[0];

    if (this.commands.has(name)) {
      const modifiers = parts.slice(1);
      try {
        const data = this.extractData(
          modifiers,
          this.commands.get(name)
        );

        const command = new Command({
          type: name,
          flags: data.flags,
          args: data.args 
        });
        this.currentCommand = command;

        const cmdObject = this.commands.get(name);

        if ("validate" in cmdObject) {
          let response = cmdObject.validate.call(this,command);
          if (response) throw new Error(response);
        }
        cmdObject.execute.call(this,command, this.terminal, cmdData.input).then((output: string) => {
          if (command.isCanceled) return; // refer to local because global will likely be reassigned
          if (output) output += command.endText;
          this.runCommand(
            chain,
            output,
            true
          );
        }).catch((output:string) => {
          if (command.isCanceled) return; // refer to local because global will likely be reassigned
          if (output) output += command.endText;
          this.runCommand(
            chain,
            "%c{color:var(--command-err)}" + output,
            false
          );  
        });
      }
      catch (err) {
        this.runCommand(
          chain,
          "%c{color:var(--command-err)}" + err.message + "\n",
          false
        );
      }
    }
    else {
      this.runCommand(
        chain,
        `%c{color:var(--command-err)}The command \"${Terminal.encode(name)}\" does not exist.\n`,
        false
      );
    }
  }

  protected extractText(text: string): string[] {
    const strs = [];
    
    let quoteEnder: string = null; // not currently inside quotes
    let workingStr: string = "";
    for (let char of text) {
      if (quoteEnder) { // ignore spaces
        if (char == quoteEnder) {
          if (workingStr.length > 0) strs.push(workingStr + quoteEnder);
          workingStr = "";
          quoteEnder = null;
        }
        else workingStr += char;
      }
      else {
        if (char == " " && workingStr.length > 0) {
          strs.push(workingStr);
          workingStr = "";
        }
        else if (char == "\"" || char == "\'") {
          if (workingStr.length > 0) strs.push(workingStr);
          workingStr = "";
          quoteEnder = char;
          workingStr += char;
        }
        else workingStr += char;
      }
    }
    if (workingStr.length > 0) {
      if (quoteEnder) workingStr += quoteEnder; // prevent quote starting without ending
      strs.push(workingStr);
    }
  
    return strs;
  }

  protected extractData (
    extractedText: string[],
    cmdStruct: CommandStructure
  ): {
    args: Record<string,string>
    flags: string[]
  } {
    const args: Record<string,string> = {};
    const flags: string[] = [];

    function removeSurroundingQuotes(text: string) {
      if (
        (text[0] == "\"" && text[text.length-1] == "\"")
        || text[0] == "\'" || text[text.length-1] == "\'"
      ) return text.substring(1, text.length-1);
      return text;
    }

    let argCt = 0;
    const argKeys = Object.keys(cmdStruct.args);
    for (let i = 0; i < extractedText.length; i++) {
      let text = extractedText[i].trim();
      if (text[0] == "-") {
        text = text.substring(1); // get rid of "-" initializer
        if (text in cmdStruct.oargs) { // optional argument
          if (i+1 >= extractedText.length) throw new Error(`No value given for -${text} argument.`);
          args[text] = removeSurroundingQuotes(extractedText[++i]);
        }
        else if (text in cmdStruct.flags) flags.push(text);
        else {
          throw new Error(`Invalid flag: \"-${text}\".`);
        }
      }
      else {
        args[argKeys[argCt]] = removeSurroundingQuotes(text);
        argCt++;
      }
    }

    if (argCt > argKeys.length) { throw new Error("Too many arguments given."); }
    if (argCt < argKeys.length) { throw new Error("Not enough arguments given."); }

    return {
      args,
      flags
    };
  }

  addCommand(name: string, cmdData: CommandStructure, module:string="") {
    if (!("args" in cmdData)) cmdData.args = {};
    if (!("flags" in cmdData)) cmdData.flags = {};
    if (!("oargs" in cmdData)) cmdData.oargs = {};
    
    const fullName = module ? module + "." + name : name;
    this.commands.set(fullName, cmdData); // completely willing to override old command names
  }
  addModule(module: string, moduleData: Record<string, CommandStructure>, init:()=>void = null) {
    for (const name in moduleData) { this.addCommand(name, moduleData[name], module); }
    if(init) this.toInit.push(init);
  }

  isCommand(command: string) { return this.commands.has(command); }
  getCommand(command: string) { return this.commands.get(command); }
  getCommands() { // return list of all commands
    const commandList: string[] = [];
    for (const command of this.commands.keys()) { commandList.push(command); }
    return commandList;
  }

  runInit() {
    this.toInit.forEach(callback => { callback.call(this); });
    this.toInit.splice(0);
  }
}