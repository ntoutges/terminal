import { Command, CommandStructure } from "../cmd.js";
import { Terminal } from "../terminal.js";
import { FileSystem, FileTypes } from "../drive.js";

const fs = new FileSystem("C");

export const name = "fs";

export const module: Record<string, CommandStructure> = {
  "cd":  {
    args: {
      "path": "string"
    },
    execute: cdExecute
  },
  "ls": {
    oargs: {
      "l": "lookahead location"
    },
    execute: lsExecute
  },
  "cat": {
    args: {
      "filename": "file to read"
    },
    flags: {
      "r": "Print any styling as raw text",
      "s": "Simplify text"
    },
    execute: catExecute
  },
  "save": {
    args: {
      "name": "file name"
    },
    oargs: {
      "d": "data to save to file"
    },
    flags: {
      "a": "append data"
    },
    execute: saveExecute
  },
  "mkdir": {
    args: {
      "name": "directory name"
    },
    execute: mkdirExecute
  },
  "rm": {
    args: {
      "name": "file name"
    },
    flags: {
      "r": "recursively remove files from folders"
    },
    execute: rmExecute
  }
};

function cdExecute(command: Command, terminal: Terminal, input:string="") {
  return new Promise<string>((resolve,reject) => {
    try {
      fs.cd(command.getParam("path"));
      terminal.setIndicatorText(fs.pathString + ">");
      resolve("")
    }
    catch (err) { reject(err.message); }
  });
}

function lsExecute(command: Command, terminal: Terminal, input:string="") {
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
}

function catExecute(command: Command, terminal: Terminal, input:string="") {
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

function saveExecute(command: Command, terminal: Terminal, input:string="") {
  return new Promise<string>((resolve,reject) => {
    try {
      const data = input + command.getParam("d","");
      fs.save(command.getParam("name"), data, command.hasFlag("a"));
      resolve("");
    }
    catch(err) {
      reject(err.message);
    }
  });
}

function mkdirExecute(command: Command, terminal: Terminal, input:string="") {
  return new Promise<string>((resolve,reject) => {
    try {
      fs.mkdir(command.getParam("name"));
      resolve("");
    }
    catch(err) {
      reject(err.message);
    }
  });
}

function rmExecute(command: Command, terminal: Terminal, input:string="") {
  return new Promise<string>((resolve,reject) => {
    try {
      fs.rm(command.getParam("name"), command.hasFlag("r"));
      terminal.setIndicatorText(fs.pathString + ">"); // location may have changed
      resolve("");
    }
    catch(err) {
      reject(err.message);
    }
  });
}
