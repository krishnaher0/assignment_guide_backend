// OAuth Configuration for Google and GitHub
require('dotenv').config();

const oauthConfig = {
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5001/auth/google/callback',
    scopes: ['profile', 'email'],
  },
  github: {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    redirectUri: process.env.GITHUB_REDIRECT_URI || 'http://localhost:5001/auth/github/callback',
    scopes: ['user:email', 'read:user'],
  },
};

module.exports = oauthConfig;
