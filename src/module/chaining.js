export class ChainLink {
    expressions = [];
    operators = [];
    exprIndex = 0;
    constructor(tokens) {
        for (const token of tokens) {
            if (token.type == "text")
                this.expressions.push(token.value);
            else if (token.type == "operator")
                this.operators.push(token.value);
        }
    }
    execute(lastCommandOutput, lastCommandStatus // true -> success, false -> fail
    ) {
        const output = {
            command: null,
            input: "",
            output: lastCommandOutput
        };
        if (this.exprIndex >= this.expressions.length)
            return output;
        if (this.exprIndex == 0)
            output.command = this.expressions[this.exprIndex]; // first expression ALWAYS evaluates
        else {
            const operator = this.operators[this.exprIndex - 1];
            const potentialCommand = this.expressions[this.exprIndex];
            switch (operator) {
                case "&&": // run only if last succeeds
                    if (lastCommandStatus)
                        output.command = potentialCommand;
                    break;
                case "||": // run only if last fails
                    if (!lastCommandStatus) {
                        output.command = potentialCommand;
                        output.input = lastCommandOutput; // pour error message into this
                        output.output = "";
                    }
                    break;
                case ";": // run after last
                    output.command = potentialCommand;
                    break;
                case "|": // pipe output of last in as input for this (implied that this only runs if the last succeeds)
                    if (lastCommandStatus) {
                        output.command = potentialCommand;
                        output.input = lastCommandOutput;
                        output.output = "";
                    }
                    break;
                default:
                    throw new Error(`Unknown Operator: \"${operator}\"`);
            }
        }
        this.exprIndex++;
        return output;
    }
}
export function createChain(text, splitters, encapsulators // key,value pairs storing characters that prevent chaining between them; eg: "{": "}"
) {
    const tokens = tokenize(text, splitters, encapsulators, false); // parentheses disabled due to strange behaviour
    const errMsg = verifyTokenIntegrity(tokens);
    if (errMsg != "")
        throw new Error(`Tokenization Error: ${errMsg}`);
    return new ChainLink(tokens);
}
// split string into two types of tokens, split by the [splitters] inputs
function tokenize(text, splitters, encapsulators, // key,value pairs storing characters that prevent chaining between them; eg: "{": "}"
doParentheticals = false) {
    splitters = splitters.slice(0).sort((a, b) => { return b.length - a.length; }); // put longer strings at the front
    const splitterFirstChars = new Map(); // used to speed up processing
    for (let i in splitters) {
        const splitter = splitters[i][0]; // get first char
        if (!splitterFirstChars.has(splitter))
            splitterFirstChars.set(splitter, [+i]); // assign
        else { // add
            const indices = splitterFirstChars.get(splitter);
            indices.push(+i);
            splitterFirstChars.set(splitter, indices);
        }
    }
    const tokens = [];
    let depth = 0; // +1 if going into parentheses; -1 if going out
    function addToken(token) {
        if (token.value.trim().length == 0)
            return; // this type of token has no value, therefore it can be thrown out
        while (tokens.length <= depth) {
            tokens.push([]);
        } // ensure tokens has enough depth
        tokens[depth].push(token);
    }
    // move tokens from current level to one lower (and prepend); but take last operator from previous level, and move it between
    // ex: (a && (b || c)) => b || c && a (this works because all evaulated from left to right, with no order of presedence)
    function consolidateTokens() {
        if (depth == 0) { // cannot consolidate into a negative level, so instead just act like consolidation happened (with an empty level).
            depth++; // prevent depth from going negative--in effect
            return;
        }
        if (tokens.length <= depth)
            return; // no tokens in current level, therefore nothing to move down
        // non-empty previous level
        if (tokens[depth - 1].length > 0) {
            const lastOperator = tokens[depth - 1].pop();
            tokens[depth].push(lastOperator); // put last operator between current oepration, and next set of operations on previous level
        }
        tokens[depth - 1] = tokens[depth].concat(tokens[depth - 1]); // prepending those on current depth to previous
        tokens[depth] = []; // empty list
    }
    let encapsulatorEnd = null; // implies that currently not encapsulated
    let startI = 0;
    let i = 0;
    while (i < text.length) {
        const char = text[i];
        if (encapsulatorEnd) { // ignore all special characters, except those that end encapsulation
            if (char == encapsulatorEnd)
                encapsulatorEnd = false;
            i++;
        }
        else {
            if (doParentheticals) { // parentheses lead to VERY strange behaviour, eg: a && (b || c)  =>  b || c && a (reversed order, kinda)
                if (char == "(") { // go in one layer deeper
                    if (startI != i) {
                        addToken({
                            type: "text",
                            value: text.substring(startI, i)
                        });
                    }
                    depth++;
                    i++;
                    startI = i;
                    continue;
                }
                if (char == ")") { // go down one layer
                    if (startI != i) {
                        addToken({
                            type: "text",
                            value: text.substring(startI, i)
                        });
                    }
                    consolidateTokens();
                    depth--;
                    i++;
                    startI = i;
                    continue;
                }
            }
            if (char in encapsulators) { // look for character to start encapsulation
                encapsulatorEnd = char;
                i++;
                continue;
            }
            if (splitterFirstChars.has(char)) {
                let wasSplitter = false;
                for (const splitterIndex of splitterFirstChars.get(char)) {
                    const pattern = splitters[splitterIndex];
                    const reference = text.substring(i, i + pattern.length);
                    if (pattern == reference) { // splitter
                        addToken({
                            type: "text",
                            value: text.substring(startI, i).trim()
                        });
                        addToken({
                            type: "operator",
                            value: pattern
                        });
                        // advance indices
                        i += pattern.length;
                        startI = i;
                        wasSplitter = true;
                        break;
                    }
                }
                if (!wasSplitter)
                    i++;
            }
            else {
                i++;
            }
        }
    }
    // push final text token in
    if (startI != i) {
        addToken({
            type: "text",
            value: text.substring(startI, i).trim()
        });
    }
    // ignore side effects of having too many parentheses
    while (depth > 0) {
        consolidateTokens();
        depth--;
    }
    return tokens[0] ?? []; // no tokens means just return an empty list
}
// ensure token sequence in chain makes sense:
// - every [operator] token is surrounded by a [text] token
// - every [text] token is either (at the start of the sequence), (at the end of the sequence), or (surrounded by [operator] tokens)
function verifyTokenIntegrity(tokens) {
    if (tokens.length != 0 && tokens.length % 2 != 1)
        return "Invalid token length."; // tokens must always be odd length, because the addition of each [operator] token must also add a [text] token
    for (let i = 0; i < tokens.length; i++) {
        if (i % 2 == 0) { // this should be a [text] token
            if (tokens[i].type != "text")
                return "Invalid repetition of text tokens.";
        }
        else { // this should be a [operator] token
            if (tokens[i].type != "operator")
                return "Invalid repetition of operator tokens.";
        }
    }
    return ""; // empty string signifies no error
}
//# sourceMappingURL=chaining.js.map