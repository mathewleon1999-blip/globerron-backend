// Vercel serverless handler with error handling
let app;

try {
  app = require('../src/app');
} catch (err) {
  console.error('Failed to load app:', err.message);
  // Return error handler if app fails to load
  module.exports = (req, res) => {
    res.status(500).json({ 
      error: 'Server initialization failed', 
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  };
  return;
}

// Vercel serverless export with error handling
module.exports = (req, res) => {
  try {
    // Ensure trust proxy is set for Vercel
    app.set('trust proxy', 1);
    
    // Handle the request
    return app(req, res);
  } catch (err) {
    console.error('Request handling error:', err);
    res.status(500).json({ 
      error: 'Internal server error', 
      message: err.message 
    });
  }
};
