// Vercel serverless handler
const path = require('path');
const fs = require('fs');
const express = require('express');

// Import the Express app
const app = require('../src/app');

// Serve static files for Vercel (public files are included via vercel.json)
const publicDir = path.join(__dirname, '../public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir, {
    etag: true,
    lastModified: true,
    maxAge: '30d'
  }));
}

// Vercel serverless export
module.exports = (req, res) => {
  // Ensure trust proxy is set for Vercel
  app.set('trust proxy', 1);
  
  // Handle the request
  return app(req, res);
};
