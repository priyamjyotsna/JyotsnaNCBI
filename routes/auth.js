const express = require('express');
const admin = require('firebase-admin');

// Create the router
const router = express.Router();

// Authentication middleware
const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        // Store the intended destination
        req.session.returnTo = req.originalUrl;
        return res.redirect('/auth/login');
    }
    next();
};

// Check if user is already authenticated
const checkAuth = (req, res, next) => {
    // Only clear session if user is explicitly logged out
    if (req.session.user && req.query.logout === 'true') {
        req.session.destroy((err) => {
            if (err) {
                console.error('Session destruction error:', err);
            }
            next();
        });
    } else {
        next();
    }
};

// Clear Firebase session on login page load
router.get('/login', checkAuth, (req, res) => {
    // Set cache control headers to prevent caching
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.render('auth/login', { user: null });
});

router.get('/signup', checkAuth, (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.render('auth/signup', { user: null });
});

// Add session verification endpoint
router.get('/verify-session', (req, res) => {
    if (req.session && req.session.user) {
        res.json({ valid: true });
    } else {
        res.status(401).json({ valid: false });
    }
});

// Single Google sign-in route
router.post('/google-signin', async (req, res) => {
    try {
        const { token, userData } = req.body;
        
        console.log('Received sign-in request for user:', userData.email);
        
        // Verify the Firebase token
        const decodedToken = await admin.auth().verifyIdToken(token);
        console.log('Token verified for user:', decodedToken.email);
        
        // Verify the UID matches
        if (decodedToken.uid !== userData.uid) {
            console.error('UID mismatch:', { token: decodedToken.uid, user: userData.uid });
            throw new Error('UID mismatch');
        }
        
        // Set up session data
        req.session.user = {
            uid: decodedToken.uid,
            email: decodedToken.email,
            name: userData.name,
            photo: userData.photo
        };
        
        console.log('Session data set:', req.session.user);
        
        // Ensure session is saved before responding
        await new Promise((resolve, reject) => {
            req.session.save((err) => {
                if (err) {
                    console.error('Session save error:', err);
                    reject(err);
                } else {
                    console.log('Session saved successfully');
                    resolve();
                }
            });
        });
        
        res.json({
            success: true,
            user: req.session.user
        });
    } catch (error) {
        console.error('Authentication error:', error);
        res.status(401).json({
            success: false,
            error: error.message || 'Authentication failed'
        });
    }
});

// Welcome route
router.get('/welcome', requireAuth, async (req, res) => {
    try {
        // Set cache control headers to prevent caching
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');

        let userData = { ...req.session.user };
        
        // If user is authenticated, try to fetch additional data from Firestore
        if (req.session.user.uid) {
            try {
                const docRef = admin.firestore().collection('users').doc(req.session.user.uid);
                const doc = await docRef.get();
                
                if (doc.exists) {
                    const data = doc.data();
                    userData = { 
                        ...userData, 
                        ncbiCredentials: data.ncbiCredentials || null
                    };
                }
            } catch (firestoreError) {
                console.error('Firestore error:', firestoreError);
                // Continue even if Firestore fails
            }
        }
        
        res.render('auth/welcome', { user: userData });
    } catch (error) {
        console.error('Welcome page error:', error);
        res.redirect('/auth/login');
    }
});

// Logout route - handle both GET and POST
router.all('/logout', async (req, res) => {
    try {
        // Clear session
        req.session.destroy((err) => {
            if (err) {
                console.error('Session destruction error:', err);
                if (req.method === 'POST') {
                    return res.status(500).json({ 
                        success: false, 
                        error: 'Failed to clear session',
                        details: err.message 
                    });
                }
            }
            
            // Clear session cookie
            res.clearCookie('ncbi_session', {
                path: '/',
                domain: process.env.NODE_ENV === 'production' ? '.jyotsnapriyam.com' : undefined,
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 0
            });
            
            // For POST requests, send JSON response
            if (req.method === 'POST') {
                return res.json({ 
                    success: true,
                    message: 'Logged out successfully',
                    redirectUrl: '/' // Add redirect URL to response
                });
            }
            
            // For GET requests, redirect to homepage
            res.redirect('/');
        });
    } catch (error) {
        console.error('Logout error:', error);
        if (req.method === 'POST') {
            return res.status(500).json({ 
                success: false, 
                error: 'Logout failed',
                details: error.message 
            });
        }
        res.redirect('/');
    }
});

// Save NCBI credentials
router.post('/save-ncbi-credentials', requireAuth, async (req, res) => {
    try {
        const { email, apiKey } = req.body;
        
        if (!email || !apiKey) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }
        
        // Update session
        req.session.user.ncbiCredentials = { email, apiKey };
        
        // Save to Firestore
        try {
            const userRef = admin.firestore().collection('users').doc(req.session.user.uid);
            await userRef.set({
                ncbiCredentials: { email, apiKey },
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        } catch (firestoreError) {
            console.error('Firestore error:', firestoreError);
            // Continue even if Firestore fails
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Save credentials error:', error);
        res.status(500).json({ success: false, error: 'Failed to save credentials' });
    }
});

// Export both the router and middleware
module.exports = router;
module.exports.requireAuth = requireAuth;