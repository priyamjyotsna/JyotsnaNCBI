const functions = require('firebase-functions/v1');
const express = require('express');
const path = require('path');
const app = require('./app');

// Export the Express app as a Firebase Function
exports.api = functions.https.onRequest(app); 