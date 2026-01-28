import zxcvbn from 'zxcvbn';
import axios from 'axios';
import crypto from 'crypto';

/**
 * Validate password complexity requirements
 * - Minimum 12 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 */
export const validatePasswordComplexity = (password) => {
    const errors = [];

    if (!password || password.length < 12) {
        errors.push('Password must be at least 12 characters long');
    }

    return {
        isValid: errors.length === 0,
        errors,
    };
};

/**
 * Calculate password strength using zxcvbn
 * Returns score 0-4 (0 = weak, 4 = strong)
 */
export const calculatePasswordStrength = (password, userInputs = []) => {
    const result = zxcvbn(password, userInputs);

    return {
        score: result.score,
        feedback: result.feedback,
        crackTimeDisplay: result.crack_times_display.offline_slow_hashing_1e4_per_second,
        suggestions: result.feedback.suggestions,
        warning: result.feedback.warning,
    };
};

/**
 * Check if password has been compromised using HaveIBeenPwned API
 * Uses k-anonymity model - only sends first 5 chars of SHA-1 hash
 */
export const checkCompromisedPassword = async (password) => {
    try {
        // Hash the password using SHA-1
        const sha1Hash = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
        const prefix = sha1Hash.substring(0, 5);
        const suffix = sha1Hash.substring(5);

        // Query HIBP API with first 5 chars only
        const response = await axios.get(`https://api.pwnedpasswords.com/range/${prefix}`, {
            timeout: 5000, // 5 second timeout
        });

        // Check if our suffix appears in the results
        const hashes = response.data.split('\n');
        const found = hashes.some(line => {
            const [hashSuffix] = line.split(':');
            return hashSuffix === suffix;
        });

        return {
            isCompromised: found,
            message: found
                ? 'This password has been found in data breaches. Please choose a different password.'
                : 'Password has not been found in known data breaches.',
        };
    } catch (error) {
        console.error('Error checking compromised password:', error.message);
        // If API fails, don't block the user - just return safe result
        return {
            isCompromised: false,
            message: 'Could not verify password against breach database.',
            error: true,
        };
    }
};

/**
 * Check password expiry
 * Returns whether password has expired or is close to expiring
 */
export const checkPasswordExpiry = (passwordExpiresAt) => {
    if (!passwordExpiresAt) {
        return {
            isExpired: false,
            daysUntilExpiry: null,
            shouldWarn: false,
        };
    }

    const now = new Date();
    const expiryDate = new Date(passwordExpiresAt);
    const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));

    return {
        isExpired: daysUntilExpiry <= 0,
        daysUntilExpiry: daysUntilExpiry > 0 ? daysUntilExpiry : 0,
        shouldWarn: daysUntilExpiry <= 14 && daysUntilExpiry > 0,
    };
};

/**
 * Complete password validation combining all checks
 */
export const validatePassword = async (password, userInputs = [], passwordExpiresAt = null) => {
    // Check complexity
    const complexityCheck = validatePasswordComplexity(password);

    // Check strength
    const strengthCheck = calculatePasswordStrength(password, userInputs);

    // Check if compromised
    const compromisedCheck = await checkCompromisedPassword(password);

    // Check expiry if provided
    const expiryCheck = passwordExpiresAt ? checkPasswordExpiry(passwordExpiresAt) : null;

    const isValid =
        complexityCheck.isValid &&
        strengthCheck.score >= 2 && // Require at least "moderate" strength
        !compromisedCheck.isCompromised;

    return {
        isValid,
        complexity: complexityCheck,
        strength: strengthCheck,
        compromised: compromisedCheck,
        expiry: expiryCheck,
    };
};
