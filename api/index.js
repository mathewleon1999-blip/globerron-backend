const path = require('path');
const express = require('express');

// Import the Express app
const app = require('../src/app');

// Add static file serving for Vercel
app.use(express.static(path.join(__dirname, '../public')));

// Vercel serverless handler
module.exports = app;
