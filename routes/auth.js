const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

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
    // Clear any existing session if present
    if (req.session.user) {
        req.session.destroy((err) => {
            if (err) {
                console.error('Session destruction error:', err);
            }
            // Continue to login page
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
    res.render('auth/login', { user: null });
});

router.get('/signup', checkAuth, (req, res) => {
    res.render('auth/signup', { user: null });
});

// Single Google sign-in route
router.post('/google-signin', async (req, res) => {
    try {
        const { token, userData } = req.body;
        
        if (!token) {
            return res.status(400).json({ success: false, error: 'No token provided' });
        }
        
        console.log('Received auth request for:', userData.email);
        
        // Verify the token with a timeout and better error handling
        try {
            const decodedToken = await Promise.race([
                admin.auth().verifyIdToken(token),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Authentication timeout')), 10000)
                )
            ]);
            
            console.log('Token verified successfully for:', userData.email);
            
            // Create or update user document in Firestore
            try {
                const userRef = admin.firestore().collection('users').doc(decodedToken.uid);
                await userRef.set({
                    email: userData.email,
                    name: userData.name,
                    photo: userData.photo,
                    lastLogin: admin.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            } catch (firestoreError) {
                console.error('Firestore error:', firestoreError);
                // Continue with authentication even if Firestore fails
            }
            
            // Store user data in session
            req.session.user = {
                uid: decodedToken.uid,
                email: userData.email,
                name: userData.name,
                photo: userData.photo
            };
            
            // Save session explicitly
            req.session.save((err) => {
                if (err) {
                    console.error('Session save error:', err);
                    return res.status(500).json({ success: false, error: 'Session error' });
                }
                
                console.log('Session saved successfully for:', userData.email);
                return res.json({ success: true });
            });
        } catch (verifyError) {
            console.error('Token verification error:', verifyError);
            return res.status(401).json({ success: false, error: 'Invalid authentication token' });
        }
    } catch (error) {
        console.error('Authentication error:', error);
        res.status(500).json({ success: false, error: 'Authentication failed. Please try again.' });
    }
});

// Welcome route
router.get('/welcome', requireAuth, async (req, res) => {
    try {
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
router.all('/logout', (req, res) => {
    // Clear session
    req.session.destroy((err) => {
        if (err) {
            console.error('Session destruction error:', err);
            if (req.method === 'POST') {
                return res.status(500).json({ success: false, error: 'Failed to clear session' });
            }
        }
        
        // For POST requests, send JSON response
        if (req.method === 'POST') {
            return res.json({ success: true });
        }
        
        // For GET requests, redirect to login
        res.redirect('/auth/login');
    });
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

module.exports = router;