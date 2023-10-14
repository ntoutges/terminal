const $ = document.querySelector.bind(document);

import { SimpleShell, Command } from "./module/cmd.js";
import { Terminal } from "./module/terminal.js";

import * as test from "./module/modules/global.js";
import * as eg from "./module/modules/ElGamal.js";
import { FileSystem, FileTypes } from "./module/drive.js";

const t = new Terminal( "Default Terminal", $("#console-holder") );
const s = new SimpleShell(t);

s.addModule("", test.module);
s.addModule(eg.name, eg.module);

const fs = new FileSystem("C");

s.addCommand("cd", {
  args: {
    "path": "string"
  },
  execute: function(command: Command, terminal: Terminal, input:string="") {
    return new Promise<string>((resolve,reject) => {
      try {
        fs.cd(command.getParam("path"));
        terminal.setIndicatorText(fs.pathString + ">");
        resolve("")
      }
      catch (err) { reject(err.message); }
    });
  },
})

s.addCommand("ls", {
  oargs: {
    "l": "lookahead location"
  },
  execute: function(command: Command, terminal: Terminal, input:string="") {
    return new Promise<string>((resolve,reject) => {
      try {
        const items = fs.ls(command.getParam("l", null));

        const output: string[] = [];
        for (const item of items) {
          if (item.type == FileTypes.Folder) {
            output.push(` %c{color:#f7ed68}F%c{} ${Terminal.encode(item.name)}/`)
          }
          else {
            output.push(` %c{color:#9ae7ff}f%c{} ${Terminal.encode(item.name)}`)
          }
        }

        resolve(output.join("\n"));
      }
      catch (err) { reject(err.message); }
    });
  },
})

s.addCommand("cat", {
  args: {
    "filename": "file to read"
  },
  flags: {
    "r": "print any styling as raw text",
    "s": "simplify text"
  },
  execute: function(command: Command, terminal: Terminal, input:string="") {
    return new Promise<string>((resolve,reject) => {
      try {
        const content = fs.read(command.getParam("filename"));
        if (command.hasFlag("r")) resolve(Terminal.simplify(content));
        else if (command.hasFlag("s")) resolve(Terminal.encode(content));
        else resolve(content);
      }
      catch (err) {
        reject(err.message)
      }
    });
  }
})

s.addCommand("mkdir", {
  args: {
    "name": "directory name"
  },
  execute: function(command: Command, terminal: Terminal, input:string="") {
    return new Promise<string>((resolve,reject) => {
      try {
        fs.mkdir(command.getParam("name"));
        resolve("");
      }
      catch(err) {
        reject(err.message);
      }
    })
  }
})

s.addCommand("save", {
  args: {
    "name": "file name"
  },
  oargs: {
    "d": "data to save to file"
  },
  flags: {
    "a": "append data"
  },
  execute: function(command: Command, terminal: Terminal, input:string="") {
    return new Promise<string>((resolve,reject) => {
      try {
        const data = input + command.getParam("d","");
        fs.save(command.getParam("name"), data, command.hasFlag("a"));
        resolve("");
      }
      catch(err) {
        reject(err.message);
      }
    })
  }
})

s.addCommand("rm", {
  args: {
    "name": "file name"
  },
  flags: {
    "r": "recursively remove files from folders"
  },
  execute: function(command: Command, terminal: Terminal, input:string="") {
    return new Promise<string>((resolve,reject) => {
      try {
        fs.rm(command.getParam("name"), command.hasFlag("r"));
        terminal.setIndicatorText(fs.pathString + ">"); // location may have changed
        resolve("");
      }
      catch(err) {
        reject(err.message);
      }
    })
  }
})
