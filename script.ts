const $ = document.querySelector.bind(document);

import { SimpleShell } from "./module/cmd.js";
import { Terminal } from "./module/terminal.js";

const t = new Terminal( "Default Terminal", $("#console-holder") );
const s = new SimpleShell(t);

s.addCommand(
  "echo",
  {
    args: {},
    oargs: {
      "e": "The value to echo"
    },
    flags: {
      "U": "print all characters in (U)ppercase",
      "l": "print all characters in (l)owercase"
    },
    execute(command, terminal, input="") {
      return new Promise((resolve,reject) => {
        let text = (input + command.getParam("e","")).replaceAll("\\n", "\n");
        if (command.isSet("U")) text = text.toUpperCase();
        else if (command.isSet("l")) text = text.toLowerCase();
        
        const timeout = setTimeout(() => {
          resolve(text);
          clearInterval(int);
        }, 1000);

        let state = 0;
        const int = setInterval(() => {
          if (command.isCanceled) {
            clearInterval(int);
            clearTimeout(timeout)
            return;
          }
          terminal.print(".");
        }, 100);
      })
    },
  }
)
