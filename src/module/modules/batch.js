const functionPattern = /function\((.+?)\)\s*{(.*)}/s;
const batchFunctions = {};
var batchCount = 0;
var missedBatches = [];
var batchResultData = []; // for use by client with batch.join
var batchRunner;
var batchCombinator;
const workerPool = [];
let remoteWorkers = {};
var onPoolFinishCallback;
var onPoolFailCallback;
var start;
var gTerminal;
var isBatchRunning = false;
var serverData = null;
var clientData = null;
export const name = "batch";
export const module = {
    "runFile": {
        args: {
            file: "The file to run"
        },
        oargs: {
            config: "Values to pass into batch file, separated by commas (ex: A=15;B='C64')"
        },
        validate: runFileValidate,
        execute: runFileExecute
    },
    "generate": {
        args: {
            name: "Name of the batch-function, for later reference",
            file: "The file to convert to a batch-function. This should return a truthy value "
        },
        validate: generateValidate,
        execute: generateExecute
    },
    "ungenerate": {
        args: {
            name: "Name of the batch-function to remove"
        },
        validate: ungenerateValidate,
        execute: ungenerateExecute
    },
    "generated": {
        execute: generatedExecute
    },
    "run": {
        args: {
            name: "Name of pre-generated batch-function to run",
            genFile: "The file that generates values to be used in batches; in the form of function({ <batch:number, a,b, ...> }) { <body> }; Returns [true] when done.",
            combFile: "The file that takes in results from calculations, and tells the main process when to stop; in the form of function(input,output) { <body> }; returns [false] until done"
        },
        oargs: {
            config: "Values to pass into generator-function, separated by commas (ex: A=15;B='C64')",
            w: "Amount of workers to dedicate to the batch-function. If this is not set, batch-function runs with one worker"
        },
        flags: {
            p: "Poolable; allow other computers to join in the batch processing"
        },
        validate: runValidate,
        execute: runExecute
    },
    "watch": {
        validate: watchValidate,
        execute: watchExecute
    },
    "join": {
        oargs: {
            w: "Amount of workers to dedicate to the batch-function. If this is not set, batch-function runs with one worker"
        },
        validate: joinValidate,
        execute: joinExecute
    }
};
export function init() {
    const fs = this.fs;
    fs.assertDirectory("/.batch");
    for (const { name } of fs.ls("/.batch", true)) { // loop through files
        const fullName = "/.batch/" + name;
        if (!fs.isFile(fullName)) {
            fs.rm(fullName, true); // remove directories that snuck in
            continue;
        }
        const rawFunction = fs.read(fullName);
        const data = validateFunctionData(rawFunction);
        if (data.err) { // remove offending file
            fs.rm(fullName);
            continue;
        }
        batchFunctions[name] = [data.header, data.body];
    }
}
function validateFunctionData(functionData, configText = "") {
    try {
        const content = functionData.match(functionPattern);
        if (!content)
            return {
                err: "Invalid function for batch execution; Expects function({ <config> }) { <code> }",
                header: null, body: null, vars: null
            };
        const header = content[1];
        const body = content[2];
        const config = {};
        if (config.length != 0) {
            const lines = [];
            let workingLine = "";
            let encapsulationEnd = null;
            for (const char of configText) {
                if (encapsulationEnd) { // if withing quotes, ignore separators
                    if (char == encapsulationEnd)
                        encapsulationEnd = null;
                    workingLine += char;
                }
                else {
                    if (char == ";") {
                        if (workingLine.length > 0)
                            lines.push(workingLine);
                        workingLine = "";
                        continue;
                    }
                    else if (char == "\"") {
                        encapsulationEnd = "\"";
                    }
                    else if (char == "\'") {
                        encapsulationEnd = "\'";
                    }
                    workingLine += char;
                }
            }
            if (encapsulationEnd)
                workingLine += encapsulationEnd;
            if (workingLine.length > 0)
                lines.push(workingLine);
            for (const line of lines) {
                const splitIndex = line.indexOf("=");
                if (splitIndex == -1)
                    return {
                        err: "Invalid config string",
                        header: null, body: null, vars: null
                    };
                const key = line.substring(0, splitIndex);
                let value = line.substring(splitIndex + 1);
                if (value[0] == value[value.length - 1] && value[0] == "\"" || value[0] == "\'")
                    value = value.substring(1, value.length - 1); // remove quotes // starts and ends with quotes
                try {
                    value = JSON.parse(value);
                } // attempt to convert to other form
                catch (_) { } // conversion failed, just treat as a string
                config[key] = value;
            }
        }
        return {
            err: null,
            header,
            body,
            vars: config
        };
    }
    catch (err) {
        return {
            err,
            header: null,
            body: null,
            vars: null
        };
    }
}
function runFileValidate(command) {
    const validation = validateFunctionData(this.fs.read(command.getArg("file")), command.getArg("config", ""));
    if (validation.err)
        return validation.err;
    command.setTemp("vars", validation.vars);
    command.setTemp("toExecHeader", validation.header);
    command.setTemp("toExecBody", validation.body);
    return "";
}
function runFileExecute(command, terminal, input = "") {
    return new Promise((resolve, reject) => {
        const vars = command.getTemp("vars");
        const header = command.getTemp("toExecHeader");
        const exe = command.getTemp("toExecBody");
        let result = null;
        try {
            // redefine console in this scope, to print to terminal
            console.log = (...data) => { terminal.println(data.join(" ")); };
            console.clear = terminal.clear.bind(terminal);
            result = new Function(header, exe)(vars);
        }
        catch (err) {
            reject(err.message);
        }
        resolve(result.toString());
    });
}
function generateValidate(command) {
    // check if batch inputs make sense
    const validation = validateFunctionData(this.fs.read(command.getArg("file")), command.getArg("config", ""));
    if (validation.err)
        return validation.err;
    command.setTemp("vars", validation.vars);
    command.setTemp("toExecHeader", validation.header);
    command.setTemp("toExecBody", validation.body);
    return "";
}
function generateExecute(command, terminal, input = "") {
    return new Promise((resolve, reject) => {
        const header = command.getTemp("toExecHeader");
        const exe = command.getTemp("toExecBody");
        const poolFuncName = command.getArg("name");
        try {
            new Function(header, exe); // make sure function can be built without error
            batchFunctions[poolFuncName] = [header, exe];
            this.fs.save(`/.batch/${poolFuncName}`, `function(${header}){${exe}}`, false);
        }
        catch (err) {
            reject(err.message);
        }
        resolve("");
    });
}
function ungenerateValidate(command) {
    const name = command.getArg("name");
    if (!(name in batchFunctions))
        return `\"${name}\" is not a generated batch-function`;
    return "";
}
function ungenerateExecute(command, terminal, input = "") {
    return new Promise((resolve, reject) => {
        const name = command.getArg("name");
        delete batchFunctions[name];
        resolve("");
    });
}
function generatedExecute(command, terminal, input = "") {
    return new Promise((resolve, reject) => {
        const output = Object.keys(batchFunctions).map((name) => { return `%c{color:#e3d03c}${name}`; }).join("\n");
        resolve(output);
    });
}
function runValidate(command) {
    const workers = parseInt(command.getArg("w", "1"), 10);
    if (isNaN(workers) || workers <= 0)
        return "Invalid value for workers";
    command.setTemp("workers", workers);
    // check if batch-function exists
    const name = command.getArg("name");
    if (!(name in batchFunctions))
        return `The batch-function \"${name}\" does not exist`;
    // check if batch inputs for generator make sense
    const genValidation = validateFunctionData(this.fs.read(command.getArg("genFile")), command.getArg("config", ""));
    if (genValidation.err)
        return genValidation.err;
    command.setTemp("vars", genValidation.vars);
    command.setTemp("genHeader", genValidation.header);
    command.setTemp("genBody", genValidation.body);
    // check if combinator-function makes sense
    const combValidation = validateFunctionData(this.fs.read(command.getArg("combFile")), "");
    command.setTemp("combHeader", combValidation.header);
    command.setTemp("combBody", combValidation.body);
    if (command.hasFlag("p") && !this.server) {
        return "Server must be started if -p flag set";
    }
    return "";
}
function getArgs(size) {
    const args = [];
    const inputs = [];
    for (let i = 0; i < size; i++) {
        const arg = batchRunner();
        if (arg === true)
            break; // out of numbers to dole out
        args.push(arg);
        inputs.push(batchCount - 1);
    }
    return [args, inputs];
}
function runExecute(command, terminal, input = "") {
    return new Promise((resolve, reject) => {
        onPoolFinishCallback = resolve;
        onPoolFailCallback = reject;
        if (command.hasFlag("p"))
            serverData = this.server;
        else
            serverData = null;
        const batchFunctionName = command.getArg("name");
        const batchFunctionData = batchFunctions[batchFunctionName];
        terminal.println(`Running batch-function \"${batchFunctionName}\"`);
        start = (new Date()).getTime();
        gTerminal = terminal;
        const vars = command.getTemp("vars");
        const genHeader = command.getTemp("genHeader");
        const genExe = command.getTemp("genBody");
        const combHeader = command.getTemp("combHeader");
        const combExe = command.getTemp("combBody");
        batchCount = 0;
        isBatchRunning = true;
        try {
            console.log = (...data) => {
                if (!isBatchRunning)
                    return;
                terminal.println(data.join(" "));
                serverData?.sendSocket("*", {
                    "path": "batch-watch",
                    "data": data.join(" "),
                    "action": "print"
                });
            };
            console.clear = () => {
                if (!isBatchRunning)
                    return;
                terminal.clear();
                serverData?.sendSocket("*", {
                    "path": "batch-watch",
                    "data": "",
                    "action": "clear"
                });
            };
            const generator = new Function(genHeader, genExe);
            batchCombinator = new Function(combHeader, combExe);
            batchRunner = () => {
                if (missedBatches.length > 0)
                    vars.batch = missedBatches.pop(); // pull from queue of batches that disappeared
                else
                    vars.batch = batchCount++; // "batch" is reserved; // generate new batches
                return generator(vars);
            };
            const workers = command.getTemp("workers");
            buildPool(workers, runningExecute);
            initPool(batchFunctionData[0], batchFunctionData[1]);
            jumpstartPool();
            if (serverData) {
                // initiate remote workers from previous batches
                for (const id in remoteWorkers) {
                    addToPool(id, remoteWorkers[id].size, batchFunctionData);
                }
            }
            serverData?.post("batch-watch", (req, res) => {
                res.sendStatus(200, null);
                return true;
            });
            serverData?.post("batch-join", (req, res) => {
                addToPool(req.from, req.body.size, batchFunctionData, res);
                return true;
            });
            serverData?.post("batch", (req, res) => {
                switch (req.body.action) {
                    case "data": {
                        const data = req.body.data;
                        for (const item of data) {
                            checkIfDone(item[0], item[1]);
                        }
                        break;
                    }
                    default:
                        console.log(req.body.action);
                }
                const remoteWorker = remoteWorkers[req.from];
                if (!remoteWorker) { // no longer in pool
                    res.send([]);
                    return true;
                }
                const [args, inputs] = getArgs(remoteWorker.size);
                remoteWorker.awaiting = inputs;
                res.send(args);
                return true;
            });
        }
        catch (err) {
            reject(err.message);
        }
        // constantly check if process has been killed
        const clearPoolInterval = setInterval(() => {
            if (command.isCanceled) {
                clearPool();
                clearInterval(clearPoolInterval);
                serverData?.sendSocket("*", {
                    "path": "batch-watch",
                    "data": "",
                    "action": "end"
                });
                serverData?.unpost("batch-watch");
                serverData?.unpost("batch-join");
                serverData?.unpost("batch");
                // remoteWorkers = {};
            }
        }, 500);
    });
}
function runningExecute(event) {
    if (event.data !== undefined) {
        if (event.data[2] !== null) { // error occured
            onPoolFailCallback(event.data[2].message);
            return;
        }
        if (checkIfDone(event.data[0], event.data[1]))
            return;
    }
    const worker = event.currentTarget;
    const args = batchRunner();
    if (args === true) {
        return;
    } // out of inputs
    worker.postMessage({
        "type": "data",
        args
    });
}
function checkIfDone(input, output) {
    if (!isBatchRunning)
        return true; // if not running, everything is done
    const result = batchCombinator(input, output);
    if (result === false)
        return false;
    // finished!
    clearPool();
    const end = (new Date()).getTime();
    const delta = end - start;
    isBatchRunning = false;
    let text = "";
    if (delta < 5000)
        text = `%c{color:orange}Finished batch process in ${delta}ms`;
    else if (delta < 60000)
        text = `%c{color:orange}Finished batch process in ${Math.round(delta / 10) / 100}s`;
    else
        text = `%c{color:orange}Finished batch process in ${Math.round(delta / 600) / 100} minutes`;
    serverData?.unpost("batch-watch");
    serverData?.unpost("batch-join");
    serverData?.unpost("batch");
    // remoteWorkers = {};
    gTerminal.println(text);
    serverData?.sendSocket("*", {
        "path": "batch-watch",
        "data": text,
        "action": "print"
    });
    missedBatches = [];
    serverData?.on("disconnect", removeFromPool);
    let res;
    if (typeof result == "object")
        res = JSON.stringify(result);
    else
        res = `${result}`;
    onPoolFinishCallback(res);
    serverData?.sendSocket("*", {
        "path": "batch-watch",
        "data": res,
        "action": "end"
    });
    serverData = null;
    return true;
}
function addToPool(from, size2, batchFunctionData, res) {
    const cSize = parseInt(size2, 10);
    const size = isNaN(cSize) ? 1 : Math.max(0, cSize);
    if (size == 0) {
        removeFromPool(from);
        console.log(`[${from}] left the pool`);
    }
    else
        console.log(`[${from}] has joined the pool (x${size})`);
    const [args, inputs] = getArgs(size);
    if (args.length == 0) { // nothing to send
        res?.sendStatus(404, null);
        return;
    }
    res?.sendStatus(200, null);
    serverData.sendSocket(from, {
        path: "batch-init",
        data: {
            func: batchFunctionData,
            jumpstart: args
        }
    });
    remoteWorkers[from] = {
        size,
        awaiting: inputs
    };
}
function removeFromPool(id) {
    if (id in remoteWorkers) {
        const missings = remoteWorkers[id].awaiting;
        if (missings.length > 0) {
            gTerminal.println(`Lost batches [%c{color:lightgreen}${missings.join(",")}%c{}]`);
            for (const missing of missings) {
                missedBatches.push(missing);
            }
        }
        delete remoteWorkers[id];
    }
}
// creates worker pool used in execution
function buildPool(amount, callback) {
    for (const i in workerPool)
        workerPool[i].terminate(); // stop any workers still in pool
    workerPool.splice(0); // clear pool
    for (let i = 0; i < amount; i++) {
        const worker = new Worker("./src/module/worker.js");
        workerPool.push(worker);
        worker.onmessage = callback;
    }
}
function clearPool() {
    for (const worker of workerPool) {
        worker.terminate();
    }
    workerPool.splice(0);
}
function initPool(header, body) {
    for (const worker of workerPool) {
        worker.postMessage({
            "type": "init",
            header,
            body
        });
    }
}
function jumpstartPool(iargs = []) {
    let i = 0;
    for (const worker of workerPool) {
        const args = (iargs[i]) ?? batchRunner();
        i++;
        if (args === true) {
            break;
        } // out of inputs
        worker.postMessage({
            "type": "data",
            args, i
        });
    }
}
function watchValidate(command) {
    if (!this.client)
        return "Not connected to any server.";
    return "";
}
function watchExecute(command, terminal, input = "") {
    return new Promise((resolve, reject) => {
        const client = this.client;
        client.post("batch-watch", "").then((data) => {
            if (data.status == 200)
                terminal.println("Watching batch process");
            else
                reject("No batch process ongoing");
        }).catch(err => { reject(err.toString()); });
        client.on("socket", socketListener);
        function socketListener(data) {
            if (!("path" in data) || data.path != "batch-watch")
                return;
            switch (data.action) {
                case "end":
                    client.off("socket", socketListener);
                    resolve(data.data ? data.data : "Batch Terminated");
                    break;
                case "print":
                    terminal.println(data.data);
                    break;
                case "end":
                    terminal.clear();
                    break;
            }
        }
        ;
        // occasionally check if process was stopped
        const cancelInterval = setInterval(() => {
            if (command.isCanceled) {
                client.off("socket", socketListener);
                clearInterval(cancelInterval);
            }
        }, 500);
    });
}
function joinValidate(command) {
    if (!this.client)
        return "Not connected to any server.";
    const workers = parseInt(command.getArg("w", "1"), 10);
    if (isNaN(workers) || workers <= 0)
        return "Invalid value for workers";
    command.setTemp("workers", workers);
    return "";
}
function joinExecute(command, terminal, input = "") {
    return new Promise((resolve, reject) => {
        clientData = this.client;
        gTerminal = terminal;
        onPoolFailCallback = (str) => {
            isBatchRunning = false;
            clientData.off("socket", socketListener);
            clientData.post("batch-join", { size: 0 }); // indicate leaving pool
            clearInterval(cancelInterval);
            reject(str);
        };
        batchRunner = () => { return true; }; // if this is ever called, the data is finished
        const workers = command.getTemp("workers");
        batchCount = workers; // use this var as a count down
        clientData.post("batch-join", {
            size: workers
        }).then((data) => {
            if (data.status == 200) {
                terminal.println("Successfully joined batch-function");
                buildPool(workers, runningRemoteExecute);
            }
            else
                onPoolFailCallback("No batch process ongoing");
        });
        clientData.on("socket", socketListener);
        function socketListener(data) {
            if (!("path" in data))
                return;
            if (data.path == "batch-init") {
                const [header, body] = data.data.func;
                const jumpstart = data.data.jumpstart;
                initPool(header, body);
                jumpstartPool(jumpstart);
                isBatchRunning = true;
            }
            else if (data.path == "batch-watch") {
                switch (data.action) {
                    case "end":
                        // clientData.off("socket", socketListener);
                        // resolve(data.data ? data.data : "Batch Terminated");
                        // isBatchRunning = false;
                        // clearPool();
                        terminal.println(data.data ? data.data : "Batch Terminated");
                        terminal.println("Remote batch will continue to listen for new batch-functions");
                        break;
                    case "print":
                        terminal.println(data.data);
                        break;
                    case "end":
                        terminal.clear();
                        break;
                }
            }
        }
        // server has disconnected, stop running
        clientData.on("disconnect", doCommandCancel);
        function doCommandCancel() {
            isBatchRunning = false;
            clientData.off("socket", socketListener);
            clientData.post("batch-join", { size: 0 }); // indicate leaving pool
            clientData.off("disconnect", doCommandCancel);
            clearInterval(cancelInterval);
            reject("Lost connection to server");
        }
        // occasionally check if process was stopped
        const cancelInterval = setInterval(() => {
            if (command.isCanceled) {
                reject("");
                doCommandCancel();
            }
        }, 500);
    });
}
function runningRemoteExecute(event) {
    if (event.data !== undefined) {
        if (event.data[2] !== null) { // error occured
            onPoolFailCallback(event.data[2].message);
            clientData.post("batch", {
                action: "error",
                data: event.data[2].message
            });
            combineBatches([
                event.data[0],
                undefined,
                event.data[3]
            ]);
            return;
        }
        combineBatches([
            event.data[0],
            event.data[1],
            event.data[3]
        ]);
    }
}
function combineBatches(data) {
    batchResultData.push(data);
    if (batchResultData.length == batchCount) {
        if (isBatchRunning)
            gTerminal.println(`Sending batch data: [%c{background-color:#575757}${batchResultData.map((data) => { return data[1]; }).join(",")}%c{}]`);
        try {
            clientData.post("batch", {
                action: "data",
                data: batchResultData
            }).then(data => {
                if (data.status == 404)
                    return;
                if (!isBatchRunning)
                    return;
                batchCount = data.body.length;
                gTerminal.println(`%c{color:grey}Received ${batchCount} batches to run`);
                jumpstartPool(data.body);
            }).catch(err => { onPoolFailCallback(err.message); });
        }
        catch (err) {
            onPoolFailCallback(err.message);
        }
        batchResultData.splice(0);
    }
}
//# sourceMappingURL=batch.js.map