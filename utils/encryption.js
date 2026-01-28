import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const IV_LENGTH = 16;
const ALGORITHM = 'aes-256-cbc';

/**
 * Encrypt text
 */
export const encrypt = (text) => {
    if (!text) return text;
    try {
        const iv = crypto.randomBytes(IV_LENGTH);
        const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex');
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

        let encrypted = cipher.update(text);
        encrypted = Buffer.concat([encrypted, cipher.final()]);

        return iv.toString('hex') + ':' + encrypted.toString('hex');
    } catch (error) {
        console.error('Encryption error:', error);
        return text;
    }
};

/**
 * Decrypt text
 */
export const decrypt = (text) => {
    if (!text) return text;
    try {
        const textParts = text.split(':');
        if (textParts.length < 2) {
            console.warn('[Decrypt] Invalid format, returning as-is');
            return text; // Not encrypted or invalid format
        }

        const iv = Buffer.from(textParts.shift(), 'hex');
        const encryptedText = Buffer.from(textParts.join(':'), 'hex');
        const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex');
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);

        const result = decrypted.toString();
        console.log('[Decrypt] Successfully decrypted text');
        return result;
    } catch (error) {
        console.error('[Decrypt] Decryption failed:', error.message);
        // If decryption fails, it might be plain text or invalid
        return text;
    }
};
