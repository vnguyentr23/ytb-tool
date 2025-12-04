const { app, BrowserWindow } = require('electron');

// Suppress security warnings for development
process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';

// This file is intentionally minimal to separate concerns
// All application logic is in main.js
require('./main.js');
