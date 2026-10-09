
const fs = require('fs');
const path = 'e:\\MS project\\MERN\\HRMS2\\HRMS\\frontend\\src\\index.css';

try {
    let content = fs.readFileSync(path, 'utf8');
    // Match two closing braces at the end of the file, with optional whitespace between them
    const newContent = content.replace(/}\s*}\s*$/, '}\n');
    if (content !== newContent) {
        fs.writeFileSync(path, newContent, 'utf8');
        console.log("Fixed extra brace at end of file.");
    } else {
        console.log("No extra brace found at end of file.");
    }
} catch (err) {
    console.error("Error fixing CSS:", err);
}
