const crypto = require('crypto');

function getEncryptionKey() {
    const key = process.env.ZOOM_ENCRYPTION_KEY;
    if (!key || typeof key !== 'string' || key.length !== 32) {
        throw new Error('ZOOM_ENCRYPTION_KEY is missing or not exactly 32 characters.');
    }
    return Buffer.from(key);
}

const IV_LENGTH = 16; // For AES-256-CBC

function isZoomConfigured() {
    const key = process.env.ZOOM_ENCRYPTION_KEY;
    return typeof key === 'string' && key.length === 32;
}

function encrypt(text) {
    if (!text) return text;
    const key = getEncryptionKey();
    let iv = crypto.randomBytes(IV_LENGTH);
    let cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
    if (!text) return text;
    const key = getEncryptionKey();
    let textParts = text.split(':');
    let iv = Buffer.from(textParts.shift(), 'hex');
    let encryptedText = Buffer.from(textParts.join(':'), 'hex');
    let decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

module.exports = { encrypt, decrypt, isZoomConfigured, getEncryptionKey };
