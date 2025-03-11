const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');
const app = require('./app');

// Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp();
}

// Export the Express app as a Firebase Function
exports.api = functions.https.onRequest(app); 