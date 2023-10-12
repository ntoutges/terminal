const $ = document.querySelector.bind(document);

import { Terminal } from "./module/terminal.js";

const t = new Terminal( "Default Terminal", $("#console-holder") );

t.onCommand((text: string) => {
  t.repeatInputText();
})