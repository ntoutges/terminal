let toRun: Function = () => { return null };

onmessage = (e) => {
  switch (e.data.type) {
    case "init":
      toRun = new Function(e.data.header, e.data.body);
      postMessage(undefined); // no data
      break;
      case "data":
      let result = toRun(e.data.args);
      postMessage([e.data.args, result]);
      break;
  }
};
