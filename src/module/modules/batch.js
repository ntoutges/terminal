const functionPattern = /function\((.+?)\)\s*{(.*)}/s;
const batchFunctions = {};
var batchCount = 0;
var batchRunner;
var batchCombinator;
const workerPool = [];
var onPoolFinishCallback;
var start;
var gTerminal;
var isBatchRunning = false;
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
        oargs: {
            w: "Amount of workers to dedicate to the batch-function. If this is not set, batch-function runs with one worker"
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
            config: "Values to pass into generator-function, separated by commas (ex: A=15;B='C64')"
        },
        validate: runValidate,
        execute: runExecute
    }
};
export function init() {
    // this.fs
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
    const workers = parseInt(command.getArg("w", "1"), 10);
    if (isNaN(workers) || workers <= 0)
        return "Invalid value for workers";
    command.setTemp("workers", workers);
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
            batchFunctions[poolFuncName] = {
                func: [header, exe],
                workers: command.getTemp("workers")
            };
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
        const output = Object.keys(batchFunctions).map((name) => {
            const ct = batchFunctions[name].workers;
            if (ct == 0)
                return `%c{color:#e3d03c}${name}%c{}: Main`;
            else
                return `%c{color:#e3d03c}${name}%c{}: %c{color:#88e379}${ct}%c{} workers`;
        }).join("\n");
        resolve(output);
    });
}
function runValidate(command) {
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
    return "";
}
function runExecute(command, terminal, input = "") {
    return new Promise((resolve, reject) => {
        onPoolFinishCallback = resolve;
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
            console.log = (...data) => { if (isBatchRunning)
                terminal.println(data.join(" ")); };
            console.clear = () => { if (isBatchRunning)
                terminal.clear(); };
            const generator = new Function(genHeader, genExe);
            batchCombinator = new Function(combHeader, combExe);
            batchRunner = () => {
                vars.batch = batchCount++; // "batch" is reserved
                return generator(vars);
            };
            buildPool(batchFunctionData.workers);
            initPool(batchFunctionData.func[0], batchFunctionData.func[1]);
            jumpstartPool();
        }
        catch (err) {
            reject(err.message);
        }
        // constantly check if process has been killed
        const clearPoolInterval = setInterval(() => {
            if (command.isCanceled) {
                clearPool();
                clearInterval(clearPoolInterval);
            }
        }, 500);
    });
}
function runningExecute(event) {
    if (event.data !== undefined) {
        const result = batchCombinator(event.data[0], event.data[1]);
        if (result !== false) { // finished!
            clearPool();
            const end = (new Date()).getTime();
            const delta = end - start;
            isBatchRunning = false;
            if (delta < 5000)
                gTerminal.println(`%c{color:orange}Finished batch process in ${delta}ms`);
            else if (delta < 60000)
                gTerminal.println(`%c{color:orange}Finished batch process in ${Math.round(delta / 10) / 100}s`);
            else
                gTerminal.println(`%c{color:orange}Finished batch process in ${Math.round(delta / 600) / 100} minutes`);
            if (typeof result == "object")
                onPoolFinishCallback(JSON.stringify(result));
            else
                onPoolFinishCallback(`${result}`);
        }
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
// creates worker pool used in execution
function buildPool(amount) {
    for (const i in workerPool)
        workerPool[i].terminate(); // stop any workers still in pool
    workerPool.splice(0); // clear pool
    for (let i = 0; i < amount; i++) {
        const worker = new Worker("./src/module/worker.js");
        workerPool.push(worker);
        worker.onmessage = runningExecute;
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
function jumpstartPool() {
    for (const worker of workerPool) {
        const args = batchRunner();
        if (args === true) {
            break;
        } // out of inputs
        worker.postMessage({
            "type": "data",
            args
        });
    }
}
//# sourceMappingURL=batch.js.map