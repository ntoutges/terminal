const lineStylePattern = /(?:%c{(.*?)})?(.+?)(?:(?=%c{)|$)/gs; // <text>%c{<style_data>}<text> // edge case: styling cannot start on first char, need to revise RegEx pattern
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
    name; // used for local-storage shenanigans
    workingLine = null;
    workingText = "";
    commandHistory = [];
    historyIndex = 0;
    constructor(name, parent) {
        this.name = name;
        this.els.body.classList.add("consoles");
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
    }
    onkeydown(e) {
        if (e.key == "Enter" && !e.shiftKey) { // shift prevents command from being entered
            e.preventDefault(); // prevent "enter" key from actually doing anything
            const line = this.els.consoleInput.value;
            this.commandListeners.forEach(callback => callback(line));
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
            }
        }
        else if (e.key == "ArrowDown") {
            const reference = this.getLineCount(this.getTextSize(this.els.consoleInput.value).height) - 1;
            if (this.getCaretPosition().line == reference && this.commandHistory.length > 0) { // at top of input box
                e.preventDefault();
                this.historyIndex = Math.min(this.historyIndex + 1, this.commandHistory.length - 1);
                this.els.consoleInput.value = this.commandHistory[this.historyIndex];
                this.resizeInput();
                this.els.consoleInput.selectionStart = this.els.consoleInput.value.length; // set caret at start
            }
        }
    }
    pushToHistory() {
        if (this.commandHistory.length == 0 // always push to empty history
            || this.els.consoleInput.value != this.commandHistory[this.commandHistory.length - 1]) { // don't push if same as last element
            this.commandHistory.push(this.els.consoleInput.value);
            this.historyIndex = this.commandHistory.length;
        }
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
        section.innerText = text;
        for (const pair of styleStr.split(";")) {
            const [property, value] = pair.split(":");
            if (value === undefined)
                continue; // invalid property string
            section.style[property] = value; // apply styling to section
        }
        return section;
    }
    // removes last line (if not a new line), then replaces
    write(text) {
        if (this.workingLine != null)
            this.workingLine.remove(); // get rid of working line
        this.workingText += text;
        const sections = [];
        for (const match of this.workingText.matchAll(lineStylePattern)) {
            const style = match[1] ?? ""; // group 1 gives style (may be null)
            const text = match[2]; // group 2 gives text
            const lines = text.split("\n"); // split over new lines
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].trim().length > 0) {
                    sections.push(this.buildSection(lines[i], style));
                }
                if (i + 1 < lines.length) { // not last itteration
                    this.workingLine = this.buildLine(sections); // build new line
                    sections.splice(0); // clear list for clean slate
                }
            }
        }
        this.workingLine = this.buildLine(sections); // reassign working line to new line
        this.workingText = this.workingText.substring(this.workingText.lastIndexOf("\n") + 1);
    }
    writeLine(text) {
        this.write(text + "\n");
    }
    clear(clearHistory = false) {
        this.els.linesHolder.innerHTML = "";
        if (this.workingLine) {
            this.workingLine = null;
            this.workingText = "";
        }
        if (clearHistory) {
            this.commandHistory.splice(0);
            this.historyIndex = 0;
        }
    }
    repeatInputText() {
        const line = this.els.inputIndicator.innerText + this.els.consoleInput.value;
        // this.writeLine(`%c{background-color:#ffffff44}${line}`);
        this.writeLine(line);
    }
    setIndicatorText(text) {
        this.els.inputIndicator.innerText = text;
    }
}
//# sourceMappingURL=terminal.js.map