import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { encrypt, decrypt } from '../utils/encryption.js';

/**
 * Generate TOTP secret for a user
 */
export const generateTOTPSecret = (userName, issuer = 'ProjectHub') => {
    const secret = speakeasy.generateSecret({
        name: `${issuer} (${userName})`,
        issuer,
        length: 32,
    });

    return {
        secret: secret.base32,
        otpauthUrl: secret.otpauth_url,
    };
};

/**
 * Generate QR code for TOTP secret
 */
export const generateQRCode = async (otpauthUrl) => {
    try {
        const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);
        return qrCodeDataUrl;
    } catch (error) {
        console.error('QR code generation error:', error);
        throw new Error('Failed to generate QR code');
    }
};

/**
 * Verify TOTP token
 */
export const verifyTOTPToken = (token, encryptedSecret) => {
    try {
        console.log('[TOTP] Verifying token...');
        console.log('[TOTP] Encrypted secret length:', encryptedSecret?.length);

        const secret = decrypt(encryptedSecret);

        console.log('[TOTP] Decrypted secret:', secret ? 'exists' : 'null');
        console.log('[TOTP] Token provided:', token);

        if (!secret) {
            console.error('[TOTP] Failed to decrypt secret');
            return false;
        }

        const verified = speakeasy.totp.verify({
            secret,
            encoding: 'base32',
            token,
            window: 2, // Allow 2 time steps before/after for clock skew
        });

        console.log('[TOTP] Verification result:', verified);

        return verified;
    } catch (error) {
        console.error('[TOTP] Verification error:', error);
        return false;
    }
};

/**
 * Encrypt TOTP secret for storage
 */
export const encryptSecret = (secret) => {
    return encrypt(secret);
};

/**
 * Generate backup/recovery codes
 * Returns 10 one-time use codes
 */
export const generateBackupCodes = () => {
    const codes = [];
    for (let i = 0; i < 10; i++) {
        const code = crypto.randomBytes(4).toString('hex').toUpperCase();
        codes.push(code);
    }
    return codes;
};

/**
 * Hash backup codes for storage
 */
export const hashBackupCodes = async (codes) => {
    const hashedCodes = [];
    for (const code of codes) {
        const hashed = await bcrypt.hash(code, 10);
        hashedCodes.push(hashed);
    }
    return hashedCodes;
};

/**
 * Verify backup code
 */
export const verifyBackupCode = async (code, hashedCodes) => {
    for (let i = 0; i < hashedCodes.length; i++) {
        const isMatch = await bcrypt.compare(code, hashedCodes[i]);
        if (isMatch) {
            return {
                isValid: true,
                index: i,
            };
        }
    }
    return {
        isValid: false,
        index: -1,
    };
};
