import axios from 'axios';
import User from '../models/User.js';
import generateToken from '../utils/generateToken.js';

// Google OAuth Token Exchange
const googleOAuthCallback = async (code, role = 'client') => {
  try {
    // Exchange auth code for access token
    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5000/auth/google/callback',
    });

    const { access_token } = tokenResponse.data;

    // Get user info from Google
    const userInfoResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const { id, email, name, picture } = userInfoResponse.data;

    // Find or create user
    let user = await User.findOne({ $or: [{ email }, { googleId: id }] });

    if (!user) {
      user = new User({
        name: name || email.split('@')[0],
        email,
        googleId: id,
        profileImage: picture,
        role: role || 'client',
        authMethod: 'google',
        isEmailVerified: true,
      });
      await user.save();
    } else if (!user.googleId) {
      // Link Google account if not already linked
      user.googleId = id;
      user.authMethod = user.authMethod === 'manual' ? 'both' : 'google';
      await user.save();
    }

    const token = generateToken(user._id);
    return { user, token };
  } catch (error) {
    console.error('Google OAuth error:', error.message);
    throw new Error('Google OAuth failed: ' + error.message);
  }
};

// GitHub OAuth Token Exchange
const githubOAuthCallback = async (code, role = 'client') => {
  try {
    // Exchange auth code for access token
    const tokenResponse = await axios.post('https://github.com/login/oauth/access_token', {
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: process.env.GITHUB_REDIRECT_URI || 'http://localhost:5000/auth/github/callback',
    }, {
      headers: { Accept: 'application/json' },
    });

    const { access_token } = tokenResponse.data;

    // Get user info from GitHub
    const userInfoResponse = await axios.get('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const { id, login, name, avatar_url, email } = userInfoResponse.data;

    // Get email if not in profile
    let userEmail = email;
    if (!userEmail) {
      const emailsResponse = await axios.get('https://api.github.com/user/emails', {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      const primaryEmail = emailsResponse.data.find(e => e.primary);
      userEmail = primaryEmail?.email || `${login}@github.invalid`;
    }

    // Find or create user
    let user = await User.findOne({ $or: [{ email: userEmail }, { githubId: id }] });

    if (!user) {
      user = new User({
        name: name || login,
        email: userEmail,
        githubId: id,
        username: login,
        profileImage: avatar_url,
        role: role || 'client',
        authMethod: 'github',
        isEmailVerified: !!email,
      });
      await user.save();
    } else if (!user.githubId) {
      // Link GitHub account if not already linked
      user.githubId = id;
      user.username = login;
      user.authMethod = user.authMethod === 'manual' ? 'both' : 'github';
      await user.save();
    }

    const token = generateToken(user._id);
    return { user, token };
  } catch (error) {
    console.error('GitHub OAuth error:', error.message);
    throw new Error('GitHub OAuth failed: ' + error.message);
  }
};

export { googleOAuthCallback, githubOAuthCallback };
