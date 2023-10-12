class ChainLink {
    expr;
    constructor(expression) {
        this.expr = expression;
    }
    toRPCN() { return this; }
}
class ChainOperator {
    operator;
    constructor(operator) {
        this.operator = operator;
    }
    toRPCN() { return this; }
}
class ChainConnection {
    expr1 = null;
    expr2 = null;
    operator;
    constructor({ expr1, expr2, operator }) {
        this.operator = operator;
        this.expr1 = expr1;
        this.expr2 = expr2;
    }
    /*
      [expr2] acts as an operator, using [expr1] and [operator] to determine if it should run or not
      As such, [expr2] is treated as the operator in this form of RPN (RPCN)
    */
    toRPCN() {
        return [].concat(this.expr1.toRPCN(), this.operator.toRPCN(), this.expr2.toRPCN());
    }
}
function createChain(text, splitters, encapsulators // key,value pairs storing characters that prevent chaining between them; eg: "{": "}"
) {
    let encapsulatorEnd = null; // implies that currently not encapsulated
    let startI = 0;
    let i = 0;
    // while (i < text.length) {
    //   const char = text[i];
    //   if (char in encapsulators) {
    //   }
    // }
}
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
                        break;
                    }
                }
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
    return tokens[0];
}
const text = "a && (b || c)";
console.log(tokenize(text, ["&", "&&", "||"], {
    "\"": "\"",
    "'": "'"
}, true));
//# sourceMappingURL=chaining.js.map