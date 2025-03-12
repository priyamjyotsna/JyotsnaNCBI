// Load environment variables first
require('dotenv').config();

const express = require('express');
const path = require('path');
const session = require('express-session');
const admin = require('firebase-admin');

// Validate required environment variables
const requiredEnvVars = [
    'FIREBASE_API_KEY',
    'FIREBASE_AUTH_DOMAIN',
    'FIREBASE_PROJECT_ID',
    'FIREBASE_PRIVATE_KEY',
    'FIREBASE_CLIENT_EMAIL',
    'SESSION_SECRET'
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
    console.error('Missing required environment variables:', missingEnvVars.join(', '));
    process.exit(1);
}

// Initialize Firebase Admin
try {
    console.log('Starting Firebase initialization...');
    
    if (!admin.apps.length) {
        const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
            
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
    process.exit(1);
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
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true, // Extends session expiry on activity
    name: 'ncbi_session', // Custom cookie name
    proxy: true, // Required for secure cookies behind a proxy (like Render)
    cookie: {
        secure: process.env.NODE_ENV === 'production', // Force secure in production
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: 'lax',
        domain: process.env.NODE_ENV === 'production' ? 'jyotsnapriyam.com' : undefined // Remove the leading dot
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

// Add security headers middleware with updated CORS
app.use((req, res, next) => {
    // Security headers
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Set CORS headers
    const allowedOrigins = ['https://ncbi.jyotsnapriyam.com', 'https://jyotsnapriyam.com'];
    const origin = req.headers.origin;
    
    if (process.env.NODE_ENV === 'production' && allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
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

// Update the server startup code at the end of the file:
const PORT = process.env.PORT || 3007;

// Create HTTP server with error handling
const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log('Environment:', process.env.NODE_ENV);
    console.log('Auth Domain:', process.env.FIREBASE_AUTH_DOMAIN);
}).on('error', (error) => {
    console.error('Server failed to start:', error);
    process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // Attempt graceful shutdown
    server.close(() => {
        console.log('Server closed due to uncaught exception');
        process.exit(1);
    });
    // If graceful shutdown fails, force exit after 1 second
    setTimeout(() => {
        console.error('Forced shutdown due to uncaught exception');
        process.exit(1);
    }, 1000);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Promise Rejection:', reason);
});

module.exports = app;
