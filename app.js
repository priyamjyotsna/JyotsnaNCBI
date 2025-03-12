// Load environment variables first
require('dotenv').config();

const express = require('express');
const path = require('path');
const session = require('express-session');
const admin = require('firebase-admin');

// Generate a random session secret if not provided
if (!process.env.SESSION_SECRET) {
    console.warn('WARNING: SESSION_SECRET not set. Using a random secret. This will invalidate existing sessions on restart.');
    process.env.SESSION_SECRET = require('crypto').randomBytes(32).toString('hex');
}

// Initialize Firebase Admin
try {
    console.log('Starting Firebase initialization...');
    
    if (!admin.apps.length) {
        const privateKey = process.env.FIREBASE_PRIVATE_KEY
            ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
            : undefined;
            
        const firebaseConfig = {
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: privateKey
            })
        };
        
        admin.initializeApp(firebaseConfig);
        console.log('Firebase initialized successfully');
    }
} catch (error) {
    console.error('Firebase initialization error:', error);
    process.exit(1); // Exit if Firebase fails to initialize
}

// Make Firestore available to your routes
const db = admin.firestore();

const authRoutes = require('./routes/auth');
const app = express();

// View engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Middleware setup
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware with secure configuration
app.use(session({
    secret: process.env.SESSION_SECRET || require('crypto').randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    rolling: true, // Extends session expiry on activity
    name: 'sessionId', // Custom cookie name
    cookie: {
        secure: 'auto', // This will automatically set secure based on the connection
        httpOnly: true, // Prevents client side access to the cookie 
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: 'lax', // Protects against CSRF
        domain: process.env.NODE_ENV === 'production' ? '.jyotsnapriyam.com' : undefined // Set cookie domain in production
    }
}));

// Make user data available to views
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

// Authentication middleware
const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/auth/login');
    }
    next();
};

// Add security headers middleware
app.use((req, res, next) => {
    // Allow Firebase Auth popups
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    // Add other security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    // Add CORS headers for production
    if (process.env.NODE_ENV === 'production') {
        res.setHeader('Access-Control-Allow-Origin', 'https://ncbi.jyotsnapriyam.com');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    next();
});

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/auth', authRoutes);

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
        projectId: process.env.FIREBASE_PROJECT_ID,
        databaseURL: "https://jyotsnancbi-default-rtdb.firebaseio.com",
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "jyotsnancbi.appspot.com",
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.FIREBASE_APP_ID
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
