const lineStylePattern = /(?:%c{([^%]*?)})?(.+?)(?:(?=%c{)|$)/gs; // <text>%c{<style_data>}<text> // edge case: styling cannot start on first char, need to revise RegEx pattern
const lineStartsWithStylePattern = /^%c{.*}/gs;
const lineCarriageReturnPattern = /^.*\r/gm;
export class Terminal {
    els = {
        body: document.createElement("div"),
        linesHolder: document.createElement("div"),
        inputLine: document.createElement("div"),
        inputIndicator: document.createElement("div"),
        consoleInput: document.createElement("textarea"),
        widther: document.createElement("div") // used for getting width of text
    };
    hasMouseMoved = 0; // used for detecting if click should trigger focus on input
    doFocusTimeout = null; // used for canceling mousedown if dblclick triggered immediately after
    commandListeners = [];
    keyListeners = [];
    cancelListeners = [];
    name; // used for local-storage shenanigans
    workingLine = null;
    workingText = "";
    allText = "";
    commandHistory = [];
    historyIndex = 0;
    isDisabled = false;
    commandQueue = [];
    constructor(name, parent) {
        this.name = name;
        this.els.body.classList.add("consoles");
        this.els.consoleInput.setAttribute("autofocus", "1");
        this.els.linesHolder.classList.add("console-line-holders");
        this.els.inputLine.classList.add("console-input-line");
        this.els.inputIndicator.classList.add("console-input-indicators");
        this.els.consoleInput.classList.add("console-inputs");
        this.els.widther.classList.add("console-width-getter");
        parent.append(this.els.body);
        this.els.body.append(this.els.linesHolder);
        this.els.body.append(this.els.inputLine);
        this.els.body.append(this.els.widther);
        this.els.inputLine.append(this.els.inputIndicator);
        this.els.inputLine.append(this.els.consoleInput);
        this.els.body.addEventListener("mousedown", () => {
            this.hasMouseMoved = 0; // hasn't moved at all
        });
        this.els.body.addEventListener("mouseup", () => {
            if (this.hasMouseMoved > 2)
                return; // moved mouse a small amount
            this.doFocusTimeout = setTimeout(() => {
                this.doFocusTimeout = null;
                this.els.consoleInput.focus();
            }, 0); // taking advantage of how evens in JS work!
        });
        this.els.body.addEventListener("mousemove", () => {
            this.hasMouseMoved++; // has moved for one extra tick
        });
        this.els.body.addEventListener("click", (e) => {
            if (e.detail < 2)
                return; // register double/triple/quadruple/etc. clicks
            if (this.doFocusTimeout !== null) { // stop focus from occuring
                clearTimeout(this.doFocusTimeout);
                this.doFocusTimeout = null;
            }
        });
        this.els.consoleInput.addEventListener("input", this.resizeInput.bind(this));
        this.els.consoleInput.addEventListener("keydown", this.onkeydown.bind(this));
        this.resizeInput();
        this.setIndicatorText("> ");
        // sync history from local storage
        const historyStr = localStorage.getItem(`Console:history:${this.name}`);
        if (historyStr) {
            try {
                const history = JSON.parse(historyStr);
                if (Array.isArray(history)) {
                    this.commandHistory = history;
                    this.historyIndex = this.commandHistory.length;
                }
            }
            catch (_) { } // just prevent errors
        }
        // sync state from local storage
        const stateStr = localStorage.getItem(`Console:state:${this.name}`);
        if (stateStr) {
            try {
                const state = JSON.parse(stateStr);
                this.print(state);
                this.els.body.scrollTo(0, this.els.body.scrollHeight);
            }
            catch (_) { } // just prevent errors
        }
    }
    onkeydown(e) {
        if (e.ctrlKey && e.key == "c") { // ctrl-c
            if (this.els.consoleInput.selectionStart == this.els.consoleInput.selectionEnd) { // only trigger stop if nothing highlighted
                this.cancelListeners.forEach(callback => { callback(); });
                this.repeatInputText(this.els.consoleInput.value + "%c{color:var(--command-err)}^C");
                this.els.consoleInput.value = "";
                this.enable();
            }
            return;
        }
        if (e.key == "Enter" && !e.shiftKey) { // shift prevents command from being entered
            e.preventDefault(); // prevent "enter" key from actually doing anything
            const line = this.els.consoleInput.value;
            if (this.isDisabled)
                this.commandQueue.push(line); // push to queue to be executed later
            else
                this.commandListeners.forEach(callback => callback(line)); // execute immediately
            this.pushToHistory();
            this.els.consoleInput.value = ""; // clear command line
            this.resizeInput();
        }
        else if (e.key == "ArrowUp") {
            if (this.getCaretPosition().line == 0 && this.commandHistory.length > 0) { // at top of input box
                e.preventDefault();
                this.historyIndex = Math.max(this.historyIndex - 1, 0);
                this.els.consoleInput.value = this.commandHistory[this.historyIndex];
                this.resizeInput();
                this.els.consoleInput.selectionStart = this.els.consoleInput.value.length; // set caret at start
                this.els.body.scrollTo(0, this.els.body.scrollHeight);
            }
        }
        else if (e.key == "ArrowDown") {
            const reference = this.getLineCount(this.getTextSize(this.els.consoleInput.value).height) - 1;
            if (this.getCaretPosition().line == reference && this.commandHistory.length > 0) { // at top of input box
                e.preventDefault();
                this.historyIndex = Math.min(this.historyIndex + 1, this.commandHistory.length);
                this.els.consoleInput.value = this.commandHistory[this.historyIndex] ?? "";
                this.resizeInput();
                this.els.consoleInput.selectionStart = this.els.consoleInput.value.length; // set caret at start
                this.els.body.scrollTo(0, this.els.body.scrollHeight);
            }
        }
    }
    pushToHistory() {
        if (this.els.consoleInput.value.trim().length > 0 && ( // only push if non-empty string
        this.commandHistory.length == 0 // always push to empty history
            || this.els.consoleInput.value != this.commandHistory[this.commandHistory.length - 1] // don't push if same as last element
        )) {
            this.commandHistory.push(this.els.consoleInput.value);
            localStorage.setItem(`Console:history:${this.name}`, JSON.stringify(this.commandHistory));
        }
        this.historyIndex = this.commandHistory.length;
    }
    saveConsoleState() {
        localStorage.setItem(`Console:state:${this.name}`, JSON.stringify(this.allText + this.workingText));
    }
    resizeInput() {
        const bounds = this.getTextSize(this.els.consoleInput.value);
        this.els.consoleInput.style.height = `${bounds.height}px`;
        if (this.getLineCount(bounds.height) > 1)
            this.els.consoleInput.classList.add("multiline"); // large margin for possible rounding errors
        else
            this.els.consoleInput.classList.remove("multiline");
    }
    getCaretPosition() {
        const index = this.els.consoleInput.selectionStart;
        const bounds = this.getTextSize(this.els.consoleInput.value.slice(0, index));
        return {
            line: this.getLineCount(bounds.height) - 1
        };
    }
    getLineCount(height) {
        const reference = this.getTextSize("").height; // size without any line breaks
        return Math.round(height / reference);
    }
    getTextSize(text) {
        if (text.length == 0)
            text = " "; // ensure text is never empty
        this.els.widther.innerText = this.els.inputIndicator.innerText + text.replace(/\n$/, "\n "); // add space to end of trailing new line
        const bounds = this.els.widther.getBoundingClientRect();
        return {
            "width": bounds.width,
            "height": bounds.height
        };
    }
    onCommand(callback) { this.commandListeners.push(callback); }
    onKey(callback) { this.keyListeners.push(callback); }
    onCancel(callback) { this.cancelListeners.push(callback); }
    buildLine(sections) {
        const line = document.createElement("div");
        line.classList.add("console-lines");
        for (const section of sections) {
            line.append(section);
        }
        this.els.linesHolder.append(line);
        return line;
    }
    buildSection(text, styleStr = "") {
        const section = document.createElement("span");
        section.innerText = Terminal.decode(text);
        for (const pair of styleStr.split(";")) {
            const [property, value] = pair.split(":");
            if (value === undefined)
                continue; // invalid property string
            section.style[property] = value; // apply styling to section
        }
        return section;
    }
    // removes last line (if not a new line), then replaces
    print(text) {
        if (this.workingLine != null)
            this.workingLine.remove(); // get rid of working line
        this.workingText = (this.workingText + text).replace(lineCarriageReturnPattern, "");
        // simplify \n.*\rabcd to just [abcd]
        const sections = [];
        for (const match of this.workingText.matchAll(lineStylePattern)) {
            const style = match[1] ?? ""; // group 1 gives style (may be null)
            const text = match[2]; // group 2 gives text
            const lines = text.split("\n"); // split over new lines
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].length > 0) {
                    sections.push(this.buildSection(lines[i], style));
                }
                if (i + 1 < lines.length) { // not last itteration
                    this.workingLine = this.buildLine(sections); // build new line
                    sections.splice(0); // clear list for clean slate
                }
            }
        }
        const newlineIndex = this.workingText.lastIndexOf("\n");
        this.workingLine = this.buildLine(sections); // reassign working line to new line
        if (newlineIndex != -1) {
            const newText = this.workingText.substring(0, newlineIndex + 1);
            if (newText.match(lineStartsWithStylePattern))
                this.allText += newText;
            else
                this.allText += "%c{}" + newText;
        }
        this.workingText = this.workingText.substring(newlineIndex + 1);
        this.els.body.scrollTo(0, this.els.body.scrollHeight);
        this.saveConsoleState();
    }
    println(text) {
        this.print(text + "\n");
    }
    disable() {
        this.isDisabled = true;
        this.els.inputLine.classList.add("hidden");
    }
    enable() {
        this.isDisabled = false;
        this.els.inputLine.classList.remove("hidden");
        if (this.commandQueue.length > 0) { // run next queued command
            const line = this.commandQueue.splice(0, 1)[0];
            this.commandListeners.forEach(callback => { callback(line); });
        }
    }
    clear(clearHistory = false) {
        this.els.linesHolder.innerHTML = "";
        this.allText = "";
        if (this.workingLine) {
            this.workingLine = null;
            this.workingText = "";
        }
        this.saveConsoleState();
        if (clearHistory) {
            this.commandHistory.splice(0);
            this.historyIndex = 0;
        }
    }
    repeatInputText(altInput = null, doEncoding = false) {
        const line = this.els.inputIndicator.innerText + ((doEncoding ? Terminal.encode(altInput) : altInput) ?? Terminal.encode(this.els.consoleInput.value));
        // this.printLine(`%c{background-color:#ffffff44}${line}`);
        this.println(line);
    }
    setIndicatorText(text) {
        this.els.inputIndicator.innerText = text;
    }
    static encode(text) { return text.replace(/%c/g, "<&%_css>"); } // replace %c with some other character
    static decode(text) { return text.replace(/<&%_css>/g, "%c"); }
    static simplify(text) {
        let finalStr = "";
        text += " "; // ensure text doesn't end with %c{} (this breaks pattern) is not 
        for (const match of text.matchAll(lineStylePattern)) {
            finalStr += match[2];
        }
        return finalStr.substring(0, finalStr.length - 1); // remove added trailing space
    }
}
//# sourceMappingURL=terminal.js.map