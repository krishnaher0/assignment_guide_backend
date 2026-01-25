import express from 'express';
import { googleOAuthCallback, githubOAuthCallback } from '../utils/oauthService.js';

const router = express.Router();
const callbackRouter = express.Router();

// Google OAuth Callback
callbackRouter.get('/google/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    const role = state || 'client';

    if (!code) {
      return res.status(400).json({ error: 'No authorization code provided' });
    }

    const { user, token } = await googleOAuthCallback(code, role);

    // Create user data object with all required fields
    const userData = {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      profileImage: user.profileImage,
      status: user.status,
      isBanned: user.isBanned,
    };

    // Redirect to frontend with token
    const redirectUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth/callback?token=${token}&user=${encodeURIComponent(JSON.stringify(userData))}&provider=google`;
    res.redirect(redirectUrl);
  } catch (error) {
    console.error('Google callback error:', error);
    const errorUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth/error?message=${encodeURIComponent(error.message)}`;
    res.redirect(errorUrl);
  }
});

// GitHub OAuth Callback
callbackRouter.get('/github/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    const role = state || 'client';

    if (!code) {
      return res.status(400).json({ error: 'No authorization code provided' });
    }

    const { user, token } = await githubOAuthCallback(code, role);

    // Create user data object with all required fields
    const userData = {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      profileImage: user.profileImage,
      status: user.status,
      isBanned: user.isBanned,
    };

    // Redirect to frontend with token
    const redirectUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth/callback?token=${token}&user=${encodeURIComponent(JSON.stringify(userData))}&provider=github`;
    res.redirect(redirectUrl);
  } catch (error) {
    console.error('GitHub callback error:', error);
    const errorUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth/error?message=${encodeURIComponent(error.message)}`;
    res.redirect(errorUrl);
  }
});

// Get OAuth URLs for frontend
router.get('/oauth-urls', (req, res) => {
  // Check if OAuth credentials are configured
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GITHUB_CLIENT_ID) {
    return res.status(503).json({
      error: 'OAuth is not configured',
      message: 'Please configure OAuth credentials in environment variables'
    });
  }

  const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5001}`;

  const googleUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${process.env.GOOGLE_CLIENT_ID}&` +
    `redirect_uri=${encodeURIComponent(process.env.GOOGLE_REDIRECT_URI || `${backendUrl}/auth/google/callback`)}&` +
    `response_type=code&` +
    `scope=profile%20email&` +
    `state=client`;

  const githubUrl = `https://github.com/login/oauth/authorize?` +
    `client_id=${process.env.GITHUB_CLIENT_ID}&` +
    `redirect_uri=${encodeURIComponent(process.env.GITHUB_REDIRECT_URI || `${backendUrl}/auth/github/callback`)}&` +
    `scope=user:email%20read:user&` +
    `state=client`;

  res.json({
    google: googleUrl,
    github: githubUrl,
  });
});

// Get OAuth URLs for developer role
router.get('/oauth-urls/developer', (req, res) => {
  const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5001}`;

  const googleUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${process.env.GOOGLE_CLIENT_ID}&` +
    `redirect_uri=${encodeURIComponent(process.env.GOOGLE_REDIRECT_URI || `${backendUrl}/auth/google/callback`)}&` +
    `response_type=code&` +
    `scope=profile%20email&` +
    `state=developer`;

  const githubUrl = `https://github.com/login/oauth/authorize?` +
    `client_id=${process.env.GITHUB_CLIENT_ID}&` +
    `redirect_uri=${encodeURIComponent(process.env.GITHUB_REDIRECT_URI || `${backendUrl}/auth/github/callback`)}&` +
    `scope=user:email%20read:user&` +
    `state=developer`;

  res.json({
    google: googleUrl,
    github: githubUrl,
  });
});

export { router as oauthUrlRouter, callbackRouter as oauthCallbackRouter };
export default router;
