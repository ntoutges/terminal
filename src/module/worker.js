let toRun = () => { return null; };
onmessage = (e) => {
    try {
        switch (e.data.type) {
            case "init":
                toRun = new Function(e.data.header, e.data.body);
                postMessage(undefined); // no data
                break;
            case "data":
                let result = toRun(e.data.args);
                postMessage([e.data.args, result, null, e.data.i]);
                break;
        }
    }
    catch (err) {
        postMessage([null, null, err, e.data.i]);
    }
};
//# sourceMappingURL=worker.js.map