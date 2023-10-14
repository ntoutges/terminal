import { Terminal } from "../terminal.js";
import { FileTypes } from "../drive.js";
export const name = "fs";
export const module = {
    "cd": {
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
function cdExecute(command, terminal, input = "") {
    return new Promise((resolve, reject) => {
        try {
            this.fs.cd(command.getArg("path"));
            terminal.setIndicatorText(this.fs.pathString + ">");
            resolve("");
        }
        catch (err) {
            reject(err.message);
        }
    });
}
function lsExecute(command, terminal, input = "") {
    return new Promise((resolve, reject) => {
        try {
            const items = this.fs.ls(command.getArg("l", null)).sort((a, b) => {
                if (a.type != b.type) { // arrange folders at the top
                    if (a.type == FileTypes.Folder)
                        return -1;
                    return 1;
                }
                return a.name < b.name ? -1 : 1; // arrange names by alphabet
            });
            const output = [];
            for (const item of items) {
                if (item.type == FileTypes.Folder) {
                    output.push(` %c{color:#f7ed68}F%c{} ${Terminal.encode(item.name)}/`);
                }
                else {
                    output.push(` %c{color:#9ae7ff}f%c{} ${Terminal.encode(item.name)}`);
                }
            }
            resolve(output.join("\n"));
        }
        catch (err) {
            reject(err.message);
        }
    });
}
function catExecute(command, terminal, input = "") {
    return new Promise((resolve, reject) => {
        try {
            const content = this.fs.read(command.getArg("filename"));
            if (command.hasFlag("r"))
                resolve(Terminal.simplify(content));
            else if (command.hasFlag("s"))
                resolve(Terminal.encode(content));
            else
                resolve(content);
        }
        catch (err) {
            reject(err.message);
        }
    });
}
function saveExecute(command, terminal, input = "") {
    return new Promise((resolve, reject) => {
        try {
            const data = input + command.getArg("d", "");
            this.fs.save(command.getArg("name"), data, command.hasFlag("a"));
            resolve("");
        }
        catch (err) {
            reject(err.message);
        }
    });
}
function mkdirExecute(command, terminal, input = "") {
    return new Promise((resolve, reject) => {
        try {
            this.fs.mkdir(command.getArg("name"));
            resolve("");
        }
        catch (err) {
            reject(err.message);
        }
    });
}
function rmExecute(command, terminal, input = "") {
    return new Promise((resolve, reject) => {
        try {
            this.fs.rm(command.getArg("name"), command.hasFlag("r"));
            terminal.setIndicatorText(this.fs.pathString + ">"); // location may have changed
            resolve("");
        }
        catch (err) {
            reject(err.message);
        }
    });
}
//# sourceMappingURL=fs.js.map