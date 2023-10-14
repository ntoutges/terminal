export const name = "ElGamal";
export const module = {
    "private": {
        flags: {
            "v": "verbose"
        },
        args: {
            "p": "Large prime used for security"
        },
        validate: privateValidate,
        execute: privateExecute
    },
    "public": {
        flags: {
            "v": "verbose"
        },
        args: {
            "p": "Large prime used for security",
            "r": "Primitive-root in modulus [p]",
            "b": "Private key"
        },
        validate: publicValidate,
        execute: publicExecute
    },
    "encrypt": {
        flags: {
            "v": "verbose"
        },
        oargs: {
            "a": "Ephemeral key (randomly chosen otherwise)"
        },
        args: {
            "p": "Large prime used for security",
            "r": "Primitive-root in modulus [p]",
            "B": "Public key of receiver",
            "m": "Message to encode"
        },
        validate: encryptValidate,
        execute: encryptExecute
    },
    "decrypt": {
        flags: {
            "v": "verbose"
        },
        args: {
            "p": "Large prime used for security",
            "b": "Private key of receiver",
            "M": "Encrypted message",
            "A": "Encrypted ephemeral key"
        },
        validate: decryptValidate,
        execute: decryptExecute
    }
};
function privateValidate(command) {
    try {
        const p = parseInt(command.getArg("p"), 10);
        command.setArg("p", p.toString(10));
        return "";
    }
    catch (_) {
        return `Invalid arguments`;
    }
}
function privateExecute(command, terminal, input = "") {
    return new Promise((resolve, reject) => {
        const p = BigInt(command.getArg("p"));
        const b = generatePrivateKey(p);
        if (command.hasFlag("v"))
            terminal.println(`Picking psuedo-random number in range [1,${p}-1]`); // verbose
        resolve(b.toString());
    });
}
function publicValidate(command) {
    try {
        const p = BigInt(command.getArg("p"));
        const r = BigInt(command.getArg("r"));
        const b = BigInt(command.getArg("b"));
        command.setArg("p", p.toString());
        command.setArg("r", r.toString());
        command.setArg("b", b.toString());
        return "";
    }
    catch (_) {
        return `Invalid arguments`;
    }
}
function publicExecute(command, terminal, input = "") {
    return new Promise((resolve, reject) => {
        const p = BigInt(command.getArg("p"));
        const r = BigInt(command.getArg("r"));
        const b = BigInt(command.getArg("b"));
        const B = generatePublicKey(p, r, b);
        if (command.hasFlag("v"))
            terminal.println(`Evaluating %c(color:orange)(${r}^${b})%c(color:unset) with modulus of '${p}'`); // verbose
        resolve(B.toString());
    });
}
function encryptValidate(command) {
    try {
        const p = BigInt(command.getArg("p"));
        const r = BigInt(command.getArg("r"));
        const B = BigInt(command.getArg("B"));
        const m = BigInt(command.getArg("m"));
        const a = BigInt(command.getArg("a", Math.floor(Math.random() * parseInt(p.toString())).toString()));
        command.setArg("p", p.toString());
        command.setArg("r", r.toString());
        command.setArg("B", B.toString());
        command.setArg("m", m.toString());
        command.setArg("a", a.toString());
        return "";
    }
    catch (_) {
        return `Invalid arguments`;
    }
}
function encryptExecute(command, terminal, input = "") {
    return new Promise((resolve, reject) => {
        const p = BigInt(command.getArg("p"));
        const r = BigInt(command.getArg("r"));
        const B = BigInt(command.getArg("B"));
        const m = BigInt(command.getArg("m"));
        const a = BigInt(command.getArg("a"));
        const { M, A } = encrypt(p, r, B, m, a);
        if (command.hasFlag("v")) {
            terminal.println("- Message:");
            terminal.println(`Evaluating %c(color:orange)(${r}^${a})%c(color:unset) with modulus of '${p}'`);
            terminal.println(`Encrypted Message (M): %c{color:orange}${M}%c{}`);
            terminal.println(`Evaluating %c(color:orange)(${m}*${B}^${a})%c(color:unset) with modulus of '${p}'`);
            terminal.println(`Encrypted Ephemeral Key (A): %c{color:orange}${A}%c{}`);
        }
        resolve(`M=${M};A=${A}`);
    });
}
function decryptValidate(command) {
    try {
        const p = BigInt(command.getArg("p"));
        const b = BigInt(command.getArg("b"));
        const M = BigInt(command.getArg("M"));
        const A = BigInt(command.getArg("A"));
        command.setArg("p", p.toString());
        command.setArg("b", b.toString());
        command.setArg("M", M.toString());
        command.setArg("A", A.toString());
        return "";
    }
    catch (_) {
        return `Invalid arguments`;
    }
}
function decryptExecute(command, terminal, input = "") {
    return new Promise((resolve, reject) => {
        const p = BigInt(command.getArg("p"));
        const b = BigInt(command.getArg("b"));
        const M = BigInt(command.getArg("M"));
        const A = BigInt(command.getArg("A"));
        const m = decrypt(p, b, M, A);
        if (command.getArg("v"))
            terminal.println(`Evaluating %c(color:orange)(${M}*${A}^(${p}-1-${b}))%c(color:unset) with modulus of '${p}'`);
        resolve(m.toString());
    });
}
function generatePrivateKey(p) {
    return 1 + Math.floor(Math.random() * parseInt(p) - 1);
}
function generatePublicKey(p, r, b) {
    return modExp(r, b, p);
}
function encrypt(p, r, B, m, a) {
    const A = modExp(r, a, p);
    const M = m * modExp(B, a, p) % p;
    return {
        M, A
    };
}
function decrypt(p, b, M, A) {
    return (M * modExp(A, p - 1n - b, p)) % p;
}
// thank you github: https://gist.github.com/krzkaczor/0bdba0ee9555659ae5fe
function modExp(a, b, m) {
    a = a % m;
    var result = 1n;
    var x = a;
    while (b > 0) {
        var leastSignificantBit = b % 2n;
        b = b / 2n;
        if (leastSignificantBit == 1n) {
            result = result * x;
            result = result % m;
        }
        x = x * x;
        x = x % m;
    }
    return result;
}
//# sourceMappingURL=ElGamal.js.map