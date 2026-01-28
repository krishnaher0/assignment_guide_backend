import axios from 'axios';

/**
 * Verify Google reCAPTCHA v3 token
 * Required after 3 failed login attempts
 */
export const verifyCaptcha = async (req, res, next) => {
    try {
        const { captchaToken } = req.body;

        // If no captcha secret configured, skip verification
        if (!process.env.RECAPTCHA_SECRET_KEY) {
            console.warn('reCAPTCHA secret key not configured - skipping CAPTCHA verification');
            return next();
        }

        // If no token provided but captcha is required
        if (!captchaToken) {
            return res.status(400).json({
                message: 'CAPTCHA verification required',
                requiresCaptcha: true,
            });
        }

        // Verify with Google
        const response = await axios.post(
            `https://www.google.com/recaptcha/api/siteverify`,
            null,
            {
                params: {
                    secret: process.env.RECAPTCHA_SECRET_KEY,
                    response: captchaToken,
                    remoteip: req.ip || req.connection.remoteAddress,
                },
            }
        );

        const { success, score, 'error-codes': errorCodes } = response.data;

        if (!success) {
            console.error('CAPTCHA verification failed:', errorCodes);
            return res.status(400).json({
                message: 'CAPTCHA verification failed. Please try again.',
                requiresCaptcha: true,
            });
        }

        // reCAPTCHA v3 returns a score (0.0 - 1.0)
        // Lower score = more likely to be a bot
        // Threshold: 0.5 (adjustable based on your needs)
        if (score < 0.5) {
            return res.status(400).json({
                message: 'CAPTCHA score too low. Please try again.',
                requiresCaptcha: true,
            });
        }

        // CAPTCHA verified successfully
        req.captchaVerified = true;
        next();
    } catch (error) {
        console.error('CAPTCHA verification error:', error.message);

        // On error, fail gracefully - don't block legitimate users
        console.warn('CAPTCHA verification failed - allowing request to proceed');
        next();
    }
};

/**
 * Middleware to check if CAPTCHA is required based on failed login attempts
 */
export const checkCaptchaRequired = async (req, res, next) => {
    try {
        const { email } = req.body;

        if (!email) {
            return next();
        }

        // Check if user has failed attempts
        const User = (await import('../models/User.js')).default;
        const user = await User.findOne({ email: email.toLowerCase() });

        if (user && user.loginAttempts && user.loginAttempts.count >= 3) {
            // Require CAPTCHA after 3 failed attempts
            req.requiresCaptcha = true;

            // If captcha token not provided, return error
            if (!req.body.captchaToken) {
                return res.status(400).json({
                    message: 'CAPTCHA verification required after multiple failed attempts',
                    requiresCaptcha: true,
                });
            }

            // Verify the captcha
            return verifyCaptcha(req, res, next);
        }

        next();
    } catch (error) {
        console.error('CAPTCHA requirement check error:', error);
        next();
    }
};
