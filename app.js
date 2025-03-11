// Load environment variables first
require('dotenv').config();

const express = require('express');
const path = require('path');
const session = require('express-session');
const admin = require('firebase-admin');

// Initialize Firebase Admin
try {
    console.log('Starting Firebase initialization...');
    
    if (!admin.apps.length) {
        const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
        
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: privateKey
            })
        });
        console.log('Firebase initialized successfully');
    }
} catch (error) {
    console.error('Firebase initialization error:', error);
}

const app = express();

// View engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Middleware setup
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Make user data available to views
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Add Firebase auth routes
app.use('/__/auth', express.static(path.join(__dirname, 'public/auth')));

// Add specific handler route for Firebase auth redirects
app.get('/__/auth/handler', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/auth/handler.html'));
});

// Add route for Firebase auth iframe
app.get('/__/auth/iframe', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/auth/iframe.html'));
});

// Firebase config endpoint
app.get('/api/firebase-config', (req, res) => {
    res.json({
        apiKey: process.env.FIREBASE_API_KEY,
        authDomain: process.env.FIREBASE_AUTH_DOMAIN,
        projectId: process.env.FIREBASE_PROJECT_ID
    });
});

// Root route - Home page
app.get('/', (req, res) => {
    res.render('index', { user: req.session.user });
});

// Auth routes
app.get('/auth/login', (req, res) => {
    if (req.session.user) {
        return res.redirect('/auth/welcome');
    }
    res.render('auth/login');
});

app.get('/auth/signup', (req, res) => {
    if (req.session.user) {
        return res.redirect('/auth/welcome');
    }
    res.render('auth/signup');
});

app.get('/auth/welcome', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/auth/login');
    }
    res.render('auth/welcome', { user: req.session.user });
});

app.post('/auth/google-signin', async (req, res) => {
    try {
        const { token, userData } = req.body;
        
        // Verify the token
        const decodedToken = await admin.auth().verifyIdToken(token);
        
        // Store user data in session
        req.session.user = {
            uid: decodedToken.uid,
            email: decodedToken.email,
            name: userData.name,
            photo: userData.photo
        };
        
        res.json({ success: true });
    } catch (error) {
        console.error('Google sign-in error:', error);
        res.status(401).json({ 
            success: false, 
            error: 'Authentication failed' 
        });
    }
});

// Start the server
const PORT = process.env.PORT || 3007;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

module.exports = app;

// Add this route for debugging
app.get('/auth/login-debug', (req, res) => {
    res.render('auth/login-debug');
});

// Add this route for a simpler login test
app.get('/auth/login-simple', (req, res) => {
    res.render('auth/login-simple');
});
