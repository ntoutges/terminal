const $ = document.querySelector.bind(document);
import { SimpleShell } from "./module/cmd.js";
import { Terminal } from "./module/terminal.js";
import * as test from "./module/modules/global.js";
import * as eg from "./module/modules/ElGamal.js";
import * as fs from "./module/modules/fs.js";
const t = new Terminal("Default Terminal", $("#console-holder"));
const s = new SimpleShell(t);
s.addModule("", test.module);
s.addModule(eg.name, eg.module);
s.addModule("", fs.module);
//# sourceMappingURL=script.js.map