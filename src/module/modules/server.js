import { Client } from "../vserver/client.js";
import { Server } from "../vserver/server.js";
export const name = "server";
export const module = {
    "buildServer": {
        oargs: {
            id: "PeerJS id used to connect to server",
            p: "Password"
        },
        validate: buildServerValidate,
        execute: buildServerExecute
    },
    "killServer": {
        validate: killServerValidate,
        execute: killServerExecute
    },
    "buildClient": {
        args: {
            id: "ID of server"
        },
        oargs: {
            p: "Password",
            h: "Heartbeat period"
        },
        validate: buildClientValidate,
        execute: buildClientExecute
    },
    "killClient": {
        validate: killClientValidate,
        execute: killClientExecute
    },
};
function buildServerValidate(command) {
    if (this.server)
        return `Server already exists with id [${this.server.id}]`;
    let heartbeatPeriod = parseInt(command.getArg("h", "1000"), 10);
    if (command.getArg("id", "").length == 0)
        command.setArg("id", createIDString(4));
    if (isNaN(heartbeatPeriod))
        heartbeatPeriod = 1000;
    command.setTemp("heartbeat", heartbeatPeriod);
    return "";
}
function buildServerExecute(command, terminal, input = "") {
    return new Promise((resolve, reject) => {
        const id = command.getArg("id");
        const password = command.getArg("p", "");
        terminal.println(`Generating new Server`);
        terminal.println(`id: [%c{color:#8cff70}${id}%c{}]`);
        if (password.length > 0)
            terminal.println(`password: %c{color:#17fdea}[${password}]`);
        try {
            this.server = new Server({
                peerHost: "terminalConn",
                peerId: id,
                password: password,
                heartbeatPeriod: command.getTemp("heartbeat")
            });
            this.server.on("error", (err) => {
                this.server.disconnect();
                this.server = null;
                reject(err.message);
            });
            this.server.on("init", (data) => {
                if (data == null) {
                    reject("Failed to initialize server");
                }
                else {
                    resolve("%c{color:#68eb19}Succesfull initialized server");
                }
            });
            this.server.on("connect", (data) => { terminal.println(`Client [${data}] connected`); });
            this.server.on("disconnect", (data) => { terminal.println(`Client [${data}] disconnected`); });
        }
        catch (err) {
            reject(err.message);
        }
    });
}
function killServerValidate(command) {
    if (!this.server)
        return "Server does not exist";
    return "";
}
function killServerExecute(command, terminal, input = "") {
    return new Promise((resolve, reject) => {
        this.server.disconnect();
        this.server = null;
        resolve("");
    });
}
function buildClientValidate(command) {
    if (this.client)
        return `Client already exists`;
    let heartbeatPeriod = parseInt(command.getArg("h", "1000"), 10);
    if (command.getArg("id", "").length == 0)
        command.setArg("id", createIDString(4));
    if (isNaN(heartbeatPeriod))
        heartbeatPeriod = 1000;
    command.setTemp("heartbeat", heartbeatPeriod);
    return "";
}
function buildClientExecute(command, terminal, input = "") {
    return new Promise((resolve, reject) => {
        const id = command.getArg("id");
        const password = command.getArg("p", "");
        terminal.println(`Generating new Client`);
        // terminal.println(`id: [%c{color:#8cff70}${id}%c{}]`);
        if (password.length > 0)
            terminal.println(`password: [%c{color:#17fdea}${password}%c{}]`);
        try {
            this.client = new Client({
                peerHost: "terminalConn",
                peerId: id,
                password: password,
                heartbeatPeriod: command.getTemp("heartbeat")
            });
            this.client.on("error", (err) => {
                console.log("err");
                this.client?.disconnect();
                this.client = null;
                reject(err.message);
            });
            this.client.on("init", (id) => {
                setTimeout(() => {
                    if (id == null) {
                        reject("Failed to initialize client");
                    }
                    else {
                        terminal.println(`id: [%c{color:#8cff70}${id}%c{}]`);
                        resolve("%c{color:#68eb19}Succesfull initialized client");
                    }
                }, 500);
            });
            this.client.on("connect", (data) => { terminal.println(`Connected to server [%c{color:#8cff70}${data.substring(data.indexOf("_") + 1)}%c{}]`); });
            this.client.on("disconnect", (data) => { terminal.println(`Disconnected from server [${data}]`); });
        }
        catch (err) {
            reject(err.message);
        }
    });
}
function killClientExecute(command, terminal, input = "") {
    return new Promise((resolve, reject) => {
        this.client.disconnect();
        this.client = null;
        resolve("");
    });
}
function killClientValidate(command) {
    if (!this.client)
        return "Client does not exist";
    return "";
}
const validChars = "ACDEFGHJKMNPQRTUVWXYZ3467";
function createIDString(length = 4) {
    let str = "";
    for (let i = 0; i < length; i++) {
        str += validChars[Math.floor(Math.random() * validChars.length)];
    }
    return str;
}
//# sourceMappingURL=server.js.map