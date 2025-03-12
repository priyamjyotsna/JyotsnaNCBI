// Load environment variables first
require('dotenv').config();

const express = require('express');
const path = require('path');
const session = require('express-session');
const admin = require('firebase-admin');
const axios = require('axios');

// Import auth router and middleware
const authRouter = require('./routes/auth');
const requireAuth = authRouter.requireAuth;

// Validate required environment variables
const requiredEnvVars = [
    'FIREBASE_API_KEY',
    'FIREBASE_AUTH_DOMAIN',
    'FIREBASE_PROJECT_ID',
    'FIREBASE_PRIVATE_KEY',
    'FIREBASE_CLIENT_EMAIL',
    'SESSION_SECRET'
];

console.log('Checking environment variables...');
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
    console.error('Missing required environment variables:', missingEnvVars.join(', '));
    process.exit(1);
}

// Initialize Firebase Admin
try {
    console.log('Starting Firebase initialization...');
    
    if (!admin.apps.length) {
        // Handle the private key properly for different environments
        let privateKey = process.env.FIREBASE_PRIVATE_KEY;
        if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
            privateKey = privateKey.slice(1, -1);
        }
        privateKey = privateKey.replace(/\\n/g, '\n');
            
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

const app = express();

// View engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Basic middleware setup
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Determine cookie domain based on environment
const cookieDomain = process.env.NODE_ENV === 'production' 
    ? '.jyotsnapriyam.com'
    : undefined;

console.log('Cookie domain:', cookieDomain);
console.log('NODE_ENV:', process.env.NODE_ENV);

// Session middleware with secure configuration
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    name: 'ncbi_session',
    proxy: true,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'lax',
        domain: cookieDomain
    }
}));

// Make user data available to views
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

// Add security headers middleware with updated CORS
app.use((req, res, next) => {
    // Security headers
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Set CORS headers
    const allowedOrigins = [
        'https://ncbi.jyotsnapriyam.com',
        'https://jyotsnapriyam.com',
        'https://jyotsna-ncbi.onrender.com'
    ];
    
    const origin = req.headers.origin;
    
    if (allowedOrigins.includes(origin)) {
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

// Add health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

// Mount auth routes
app.use('/auth', authRouter);

// Firebase config endpoint
app.get('/api/firebase-config', (req, res) => {
    res.json({
        apiKey: process.env.FIREBASE_API_KEY,
        authDomain: "jyotsnancbi.firebaseapp.com",
        projectId: process.env.FIREBASE_PROJECT_ID,
        databaseURL: "https://jyotsnancbi-default-rtdb.firebaseio.com",
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "jyotsnancbi.appspot.com",
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "123456789012",
        appId: process.env.FIREBASE_APP_ID || "1:123456789012:web:abcdef1234567890"
    });
});

// Root route with error handling
app.get('/', (req, res) => {
    try {
        res.render('index', { user: req.session.user });
    } catch (error) {
        console.error('Error rendering index:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Nucleotide download route
app.get('/nucleotide-download', requireAuth, (req, res) => {
    try {
        res.render('nucleotide-download', { user: req.session.user });
    } catch (error) {
        console.error('Error rendering nucleotide-download:', error);
        res.status(500).send('Internal Server Error');
    }
});

// NCBI API endpoint for nucleotide download
app.get('/api/nucleotide/sequence', requireAuth, async (req, res) => {
    try {
        const { id } = req.query;
        if (!id) {
            return res.status(400).json({
                success: false,
                error: 'No sequence ID provided'
            });
        }

        const user = req.session.user;
        if (!user.ncbiCredentials) {
            return res.status(400).json({
                success: false,
                error: 'NCBI credentials not found. Please add them in your profile.'
            });
        }

        const { email, apiKey } = user.ncbiCredentials;
        const baseUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

        // First, search for the ID to get the proper nucleotide ID
        const searchResponse = await axios.get(
            `${baseUrl}/esearch.fcgi?db=nucleotide&term=${id}[accn]&tool=nucleotide-downloader&email=${email}&api_key=${apiKey}&retmode=json`
        );

        if (!searchResponse.data.esearchresult.idlist || searchResponse.data.esearchresult.idlist.length === 0) {
            return res.status(404).json({
                success: false,
                error: `Nucleotide sequence not found for ID: ${id}`
            });
        }

        // Then fetch the sequence
        const fetchResponse = await axios.get(
            `${baseUrl}/efetch.fcgi?db=nucleotide&id=${searchResponse.data.esearchresult.idlist[0]}&rettype=fasta&retmode=text&tool=nucleotide-downloader&email=${email}&api_key=${apiKey}`
        );

        res.json({
            success: true,
            data: fetchResponse.data,
            id: id
        });

    } catch (error) {
        console.error(`Error fetching nucleotide sequence ${req.query.id}:`, error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch nucleotide sequence',
            details: error.message
        });
    }
});

// Add NCBI credentials endpoint
app.get('/api/user/ncbi-credentials', requireAuth, (req, res) => {
    try {
        const user = req.session.user;
        const hasCredentials = !!(user && user.ncbiCredentials && user.ncbiCredentials.email && user.ncbiCredentials.apiKey);
        
        res.json({
            success: true,
            credentials: {
                exists: hasCredentials
            }
        });
    } catch (error) {
        console.error('Error checking NCBI credentials:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to check NCBI credentials'
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Global error handler:', err);
    res.status(500).send('Internal Server Error');
});

// Update the server startup code
const PORT = process.env.PORT || 3007;

function startServer() {
    return new Promise((resolve, reject) => {
        const server = app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
            console.log('Environment:', process.env.NODE_ENV);
            console.log('Auth Domain:', process.env.FIREBASE_AUTH_DOMAIN);
            resolve(server);
        }).on('error', (error) => {
            console.error('Server failed to start:', error);
            reject(error);
        });

        // Add server timeout handling
        server.timeout = 120000; // 2 minutes
        server.keepAliveTimeout = 65000; // slightly higher than 60 seconds
        server.headersTimeout = 66000; // slightly higher than keepAliveTimeout
    });
}

// Start server with proper error handling
async function boot() {
    try {
        const server = await startServer();

        // Handle graceful shutdown
        process.on('SIGTERM', () => {
            console.log('SIGTERM received. Starting graceful shutdown...');
            server.close(() => {
                console.log('Server closed gracefully');
                process.exit(0);
            });
            
            // Force close after 30 seconds
            setTimeout(() => {
                console.error('Could not close connections in time, forcefully shutting down');
                process.exit(1);
            }, 30000);
        });

        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            console.error('Uncaught Exception:', error);
            server.close(() => {
                console.log('Server closed due to uncaught exception');
                process.exit(1);
            });
            setTimeout(() => {
                console.error('Forced shutdown due to uncaught exception');
                process.exit(1);
            }, 1000);
        });

        // Handle unhandled promise rejections
        process.on('unhandledRejection', (reason, promise) => {
            console.error('Unhandled Promise Rejection:', reason);
        });

    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Start the application
boot().catch(error => {
    console.error('Boot error:', error);
    process.exit(1);
});

module.exports = app;

const apiRoutes = require('./routes/api');
app.use('/api', apiRoutes);
