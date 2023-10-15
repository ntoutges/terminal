const $ = document.querySelector.bind(document);

import { SimpleShell, Command } from "./module/cmd.js";
import { Terminal } from "./module/terminal.js";

import * as test from "./module/modules/global.js";
import * as eg from "./module/modules/ElGamal.js";
import * as fs from "./module/modules/fs.js";
import * as batch from "./module/modules/batch.js";
import * as server from "./module/modules/server.js";

let search = "";
if (location.search) {
  search = location.search.substring(1);
}

const t = new Terminal( search ? search : "Default Terminal", $("#console-holder") );
const s = new SimpleShell(t, search ? search : "C");

s.addModule("", test.module);
s.addModule(eg.name, eg.module);
s.addModule("", fs.module)
s.addModule(batch.name, batch.module, batch.init);
s.addModule(server.name, server.module);

s.runInit();

t.setIndicatorText(`${search ? search : "C"}:/>`)
