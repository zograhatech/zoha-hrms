// HRMS/backend/utils/payrollFormula.js
// Formula engine for SuperAdmin-defined salary calculations.
// Standalone utility: No database, Express, or external library imports.

const RESERVED_IDENTIFIERS = Object.freeze([
    'MONTHLY_CTC',
    'ANNUAL_CTC',
    'PCT',
    'GROSS'
]);

const CORE_COMPONENT_KEYS = Object.freeze([
    'BASIC',
    'HRA',
    'MEDICAL',
    'GROSS',
    'PF',
    'ESI',
    'PT',
    'LWF',
    'GRATITUDE'
]);

const DEFAULT_PAYROLL_COMPONENTS = Object.freeze([
    {
        key: 'BASIC',
        name: 'Basic',
        type: 'addition',
        percentage: 50,
        formula: 'MONTHLY_CTC * PCT / 100',
        editable: true,
        isCore: true
    },
    {
        key: 'HRA',
        name: 'HRA',
        type: 'addition',
        percentage: 20,
        formula: 'MONTHLY_CTC * PCT / 100',
        editable: true,
        isCore: true
    },
    {
        key: 'MEDICAL',
        name: 'Medical Allowance',
        type: 'addition',
        percentage: 10,
        formula: 'MONTHLY_CTC * PCT / 100',
        editable: true,
        isCore: true
    },
    {
        key: 'GROSS',
        name: 'Gross',
        type: 'addition',
        percentage: 0,
        formula: 'BASIC + HRA + MEDICAL',
        editable: false,
        isCore: true
    },
    {
        key: 'PF',
        name: 'Provident Fund (PF)',
        type: 'deduction',
        percentage: 12,
        formula: 'MIN(BASIC, 15000) * PCT / 100',
        editable: true,
        isCore: true
    },
    {
        key: 'ESI',
        name: 'ESI',
        type: 'deduction',
        percentage: 0.75,
        formula: 'IF(GROSS <= 21000, GROSS * PCT / 100, 0)',
        editable: true,
        isCore: true
    },
    {
        key: 'PT',
        name: 'Professional Tax (PT)',
        type: 'deduction',
        percentage: 0,
        formula: 'GROSS * PCT / 100',
        editable: true,
        isCore: true
    },
    {
        key: 'LWF',
        name: 'LWF',
        type: 'deduction',
        percentage: 0,
        formula: 'GROSS * PCT / 100',
        editable: true,
        isCore: true
    },
    {
        key: 'GRATITUDE',
        name: 'Gratitude',
        type: 'deduction',
        percentage: 0,
        formula: 'GROSS * PCT / 100',
        editable: true,
        isCore: true
    }
]);

const round2 = (num) => Math.round((Number(num || 0) + Number.EPSILON) * 100) / 100;

function deriveKey(name) {
    if (!name || typeof name !== 'string') return '';
    return name
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_]/g, '_')
        .replace(/^_+|_+$/g, '');
}

function tokenize(expr) {
    const tokens = [];
    let i = 0;
    const str = String(expr || '').trim();
    while (i < str.length) {
        const ch = str[i];
        if (/\s/.test(ch)) {
            i++;
            continue;
        }
        if (ch === '(') { tokens.push({ type: 'LPAREN', val: '(' }); i++; continue; }
        if (ch === ')') { tokens.push({ type: 'RPAREN', val: ')' }); i++; continue; }
        if (ch === ',') { tokens.push({ type: 'COMMA', val: ',' }); i++; continue; }
        if (ch === '+') { tokens.push({ type: 'PLUS', val: '+' }); i++; continue; }
        if (ch === '-') { tokens.push({ type: 'MINUS', val: '-' }); i++; continue; }
        if (ch === '*') { tokens.push({ type: 'STAR', val: '*' }); i++; continue; }
        if (ch === '/') { tokens.push({ type: 'SLASH', val: '/' }); i++; continue; }

        if (ch === '<') {
            if (str[i + 1] === '=') { tokens.push({ type: 'LTE', val: '<=' }); i += 2; continue; }
            tokens.push({ type: 'LT', val: '<' }); i++; continue;
        }
        if (ch === '>') {
            if (str[i + 1] === '=') { tokens.push({ type: 'GTE', val: '>=' }); i += 2; continue; }
            tokens.push({ type: 'GT', val: '>' }); i++; continue;
        }
        if (ch === '=' && str[i + 1] === '=') {
            tokens.push({ type: 'EQ', val: '==' }); i += 2; continue;
        }
        if (ch === '!' && str[i + 1] === '=') {
            tokens.push({ type: 'NEQ', val: '!=' }); i += 2; continue;
        }

        if (/\d/.test(ch) || (ch === '.' && /\d/.test(str[i + 1]))) {
            let numStr = '';
            while (i < str.length && (/[\d.]/.test(str[i]))) {
                numStr += str[i];
                i++;
            }
            const num = parseFloat(numStr);
            if (isNaN(num)) throw new Error(`Invalid number: ${numStr}`);
            tokens.push({ type: 'NUMBER', val: num });
            continue;
        }

        if (/[A-Za-z_]/.test(ch)) {
            let ident = '';
            while (i < str.length && /[A-Za-z0-9_]/.test(str[i])) {
                ident += str[i];
                i++;
            }
            tokens.push({ type: 'IDENT', val: ident.toUpperCase() });
            continue;
        }

        throw new Error(`Unexpected character '${ch}' in formula: ${str}`);
    }
    tokens.push({ type: 'EOF', val: '' });
    return tokens;
}

function parse(tokens) {
    let current = 0;
    function peek() { return tokens[current]; }
    function isAtEnd() { return peek().type === 'EOF'; }
    function advance() { if (!isAtEnd()) current++; return tokens[current - 1]; }
    function check(type) { if (isAtEnd()) return false; return peek().type === type; }
    function match(...types) {
        for (const t of types) {
            if (check(t)) { advance(); return true; }
        }
        return false;
    }
    function consume(type, msg) {
        if (check(type)) return advance();
        throw new Error(msg || `Expected token ${type} but got ${peek().type}`);
    }

    function expression() { return comparison(); }

    function comparison() {
        let left = additive();
        while (match('LT', 'LTE', 'GT', 'GTE', 'EQ', 'NEQ')) {
            const op = tokens[current - 1].val;
            const right = additive();
            left = { type: 'Binary', op, left, right };
        }
        return left;
    }

    function additive() {
        let left = multiplicative();
        while (match('PLUS', 'MINUS')) {
            const op = tokens[current - 1].val;
            const right = multiplicative();
            left = { type: 'Binary', op, left, right };
        }
        return left;
    }

    function multiplicative() {
        let left = unary();
        while (match('STAR', 'SLASH')) {
            const op = tokens[current - 1].val;
            const right = unary();
            left = { type: 'Binary', op, left, right };
        }
        return left;
    }

    function unary() {
        if (match('MINUS')) {
            const op = '-';
            const arg = unary();
            return { type: 'Unary', op, arg };
        }
        if (match('PLUS')) {
            return unary();
        }
        return primary();
    }

    function primary() {
        if (match('NUMBER')) {
            return { type: 'Number', val: tokens[current - 1].val };
        }
        if (match('LPAREN')) {
            const expr = expression();
            consume('RPAREN', "Expected ')' after expression");
            return expr;
        }
        if (match('IDENT')) {
            const ident = tokens[current - 1].val;
            if (match('LPAREN')) {
                const args = [];
                if (!check('RPAREN')) {
                    do {
                        args.push(expression());
                    } while (match('COMMA'));
                }
                consume('RPAREN', `Expected ')' after arguments for ${ident}`);
                return { type: 'Function', name: ident, args };
            }
            return { type: 'Identifier', name: ident };
        }
        throw new Error(`Unexpected token '${peek().val || peek().type}'`);
    }

    const ast = expression();
    if (!isAtEnd()) {
        throw new Error(`Unexpected token after expression: '${peek().val || peek().type}'`);
    }
    return ast;
}

function evaluateAST(node, scope) {
    if (!node) return 0;
    switch (node.type) {
        case 'Number':
            return node.val;
        case 'Identifier': {
            const val = scope[node.name];
            if (val === undefined) {
                throw new Error(`Unknown variable: ${node.name}`);
            }
            return val;
        }
        case 'Unary': {
            const val = evaluateAST(node.arg, scope);
            return node.op === '-' ? -val : val;
        }
        case 'Binary': {
            const left = evaluateAST(node.left, scope);
            const right = evaluateAST(node.right, scope);
            switch (node.op) {
                case '+': return left + right;
                case '-': return left - right;
                case '*': return left * right;
                case '/': {
                    if (right === 0) throw new Error('Division by zero');
                    return left / right;
                }
                case '<': return left < right ? 1 : 0;
                case '<=': return left <= right ? 1 : 0;
                case '>': return left > right ? 1 : 0;
                case '>=': return left >= right ? 1 : 0;
                case '==': return left === right ? 1 : 0;
                case '!=': return left !== right ? 1 : 0;
                default: throw new Error(`Unknown operator: ${node.op}`);
            }
        }
        case 'Function': {
            const name = node.name.toUpperCase();
            if (name === 'MIN') {
                if (node.args.length !== 2) throw new Error('MIN function requires exactly 2 arguments');
                const a = evaluateAST(node.args[0], scope);
                const b = evaluateAST(node.args[1], scope);
                return Math.min(a, b);
            }
            if (name === 'MAX') {
                if (node.args.length !== 2) throw new Error('MAX function requires exactly 2 arguments');
                const a = evaluateAST(node.args[0], scope);
                const b = evaluateAST(node.args[1], scope);
                return Math.max(a, b);
            }
            if (name === 'IF') {
                if (node.args.length !== 3) throw new Error('IF function requires exactly 3 arguments');
                const cond = evaluateAST(node.args[0], scope);
                return cond !== 0 ? evaluateAST(node.args[1], scope) : evaluateAST(node.args[2], scope);
            }
            throw new Error(`Unknown function '${name}'`);
        }
        default:
            throw new Error(`Unknown AST node type: ${node.type}`);
    }
}

function getIdentifiersFromAST(node) {
    const idents = new Set();
    function walk(n) {
        if (!n) return;
        if (n.type === 'Identifier') idents.add(n.name);
        if (n.type === 'Binary') { walk(n.left); walk(n.right); }
        if (n.type === 'Unary') { walk(n.arg); }
        if (n.type === 'Function') {
            if (!['MIN', 'MAX', 'IF'].includes(n.name)) {
                throw new Error(`Unknown function: ${n.name}`);
            }
            for (const arg of n.args) walk(arg);
        }
    }
    walk(node);
    return idents;
}

function validateFormula(expression, allowedVariables = []) {
    try {
        const tokens = tokenize(expression);
        const ast = parse(tokens);
        const allowedSet = new Set(allowedVariables.map(v => v.toUpperCase()));
        const idents = getIdentifiersFromAST(ast);
        for (const id of idents) {
            if (!allowedSet.has(id)) {
                return { valid: false, error: `Unknown variable '${id}' in formula` };
            }
        }
        return { valid: true };
    } catch (err) {
        return { valid: false, error: err.message };
    }
}

function detectCycles(components) {
    const compMap = new Map();
    const adj = new Map();

    for (const c of components) {
        const k = (c.key || deriveKey(c.name)).toUpperCase();
        compMap.set(k, c);
        adj.set(k, []);
    }

    for (const c of components) {
        const k = (c.key || deriveKey(c.name)).toUpperCase();
        try {
            if (k === 'GROSS') {
                for (const other of components) {
                    const otherKey = (other.key || deriveKey(other.name)).toUpperCase();
                    if (other.type === 'addition' && otherKey !== 'GROSS') {
                        adj.get('GROSS').push(otherKey);
                    }
                }
                continue;
            }
            if (!c.formula) continue;
            const tokens = tokenize(c.formula);
            const ast = parse(tokens);
            const idents = getIdentifiersFromAST(ast);
            for (const id of idents) {
                if (compMap.has(id) && id !== k) {
                    adj.get(k).push(id);
                }
                if (id === k) {
                    return { hasCycle: true, error: `Circular dependency detected: component '${k}' references itself` };
                }
            }
        } catch (err) {
            return { hasCycle: true, error: `Syntax error in formula for ${k}: ${err.message}` };
        }
    }

    const visited = new Set();
    const visiting = new Set();
    const order = [];

    function dfs(node, path = []) {
        visiting.add(node);
        path.push(node);
        for (const dep of (adj.get(node) || [])) {
            if (visiting.has(dep)) {
                return { hasCycle: true, error: `Circular dependency detected: ${[...path, dep].join(' -> ')}` };
            }
            if (!visited.has(dep)) {
                const res = dfs(dep, path);
                if (res && res.hasCycle) return res;
            }
        }
        visiting.delete(node);
        visited.add(node);
        order.push(node);
        path.pop();
        return null;
    }

    for (const k of compMap.keys()) {
        if (!visited.has(k)) {
            const res = dfs(k, []);
            if (res && res.hasCycle) return res;
        }
    }

    return { hasCycle: false, order };
}

function evaluateComponents({ annualCtc = 0, daysWorked = 30, components = [], customColumns = [] }) {
    const aCtc = round2(Number(annualCtc) || 0);
    const mCtc = round2(aCtc / 12);

    const baseComponents = (components && components.length > 0)
        ? components
        : DEFAULT_PAYROLL_COMPONENTS;

    const allComponents = [];
    const compMap = new Map();

    for (const c of baseComponents) {
        const item = { ...c, key: (c.key || deriveKey(c.name)).toUpperCase() };
        allComponents.push(item);
        compMap.set(item.key, item);
    }

    for (const cc of customColumns) {
        const key = (cc.key || deriveKey(cc.name)).toUpperCase();
        const item = {
            ...cc,
            key,
            type: cc.type || 'addition',
            percentage: Number(cc.percentage) || 0,
            formula: cc.formula,
            isCustom: true
        };
        allComponents.push(item);
        compMap.set(key, item);
    }

    const cycleCheck = detectCycles(allComponents);
    if (cycleCheck.hasCycle) {
        throw new Error(cycleCheck.error);
    }

    const scope = {
        ANNUAL_CTC: aCtc,
        MONTHLY_CTC: mCtc
    };

    const amounts = {};
    const customList = [];

    // Evaluate in topological order
    for (const key of cycleCheck.order) {
        const comp = compMap.get(key);
        if (!comp) continue;

        if (key === 'GROSS') {
            let grossSum = 0;
            for (const c of allComponents) {
                if (c.type === 'addition' && c.key !== 'GROSS') {
                    grossSum += (amounts[c.key] || 0);
                }
            }
            amounts.GROSS = round2(grossSum);
            scope.GROSS = amounts.GROSS;
            continue;
        }

        const compScope = {
            ...scope,
            PCT: Number(comp.percentage) || 0
        };

        let amt = 0;
        if (comp.formula) {
            const ast = parse(tokenize(comp.formula));
            amt = round2(evaluateAST(ast, compScope));
        }
        amounts[key] = amt;
        scope[key] = amt;

        if (comp.isCustom) {
            customList.push({
                key: comp.key,
                name: comp.name || comp.key,
                type: comp.type,
                percentage: Number(comp.percentage) || 0,
                formula: comp.formula,
                amount: amt
            });
        }
    }

    if (amounts.GROSS === undefined) {
        let grossSum = 0;
        for (const c of allComponents) {
            if (c.type === 'addition' && c.key !== 'GROSS') {
                grossSum += (amounts[c.key] || 0);
            }
        }
        amounts.GROSS = round2(grossSum);
        scope.GROSS = amounts.GROSS;
    }

    let totalDeductions = 0;
    for (const c of allComponents) {
        if (c.type === 'deduction') {
            totalDeductions += (amounts[c.key] || 0);
        }
    }
    totalDeductions = round2(totalDeductions);
    const netSalary = round2(amounts.GROSS - totalDeductions);

    return {
        annual_ctc: aCtc,
        monthly_ctc: mCtc,
        gross_salary: amounts.GROSS,
        total_deductions: totalDeductions,
        net_salary: netSalary,
        components: amounts,
        custom_components: customList
    };
}

module.exports = {
    RESERVED_IDENTIFIERS,
    CORE_COMPONENT_KEYS,
    DEFAULT_PAYROLL_COMPONENTS,
    deriveKey,
    round2,
    tokenize,
    parse,
    evaluateAST,
    validateFormula,
    detectCycles,
    evaluateComponents
};
