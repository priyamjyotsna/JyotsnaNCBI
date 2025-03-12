const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

// Authentication middleware
const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/auth/login');
    }
    next();
};

router.get('/login', (req, res) => {
    res.render('auth/login', { user: req.session.user });
});

router.get('/signup', (req, res) => {
    res.render('auth/signup', { user: req.session.user });
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
            
            // Save session explicitly to ensure it's stored before responding
            req.session.save((err) => {
                if (err) {
                    console.error('Session save error:', err);
                    return res.status(500).json({ success: false, error: 'Session error' });
                }
                
                console.log('Session saved successfully for:', userData.email);
                return res.json({ success: true, redirect: '/auth/welcome' });
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
                    userData = { ...userData, ...doc.data() };
                }
            } catch (firestoreError) {
                console.error('Firestore error:', firestoreError);
            }
        }
        
        res.render('auth/welcome', { user: userData });
    } catch (error) {
        console.error('Error rendering welcome page:', error);
        res.render('auth/welcome', { 
            user: req.session.user,
            error: 'Failed to load user data'
        });
    }
});

router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) console.error('Logout error:', err);
        res.redirect('/');
    });
});

// Add this route to handle saving NCBI credentials
router.post('/save-ncbi-credentials', requireAuth, async (req, res) => {
    try {
        const { email, apiKey } = req.body;
        
        // Add validation for the input
        if (!email || !apiKey) {
            console.log('Missing required fields:', { email, apiKey });
            return res.status(400).json({ success: false, error: 'Email and API key are required' });
        }
        
        const userId = req.session.user.uid;
        console.log('Attempting to save NCBI credentials for user:', userId);
        
        try {
            // Use set with merge option instead of update to handle non-existent documents
            await admin.firestore().collection('users').doc(userId).set({
                ncbiCredentials: {
                    email: email,
                    apiKey: apiKey
                },
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            
            console.log('Successfully saved credentials to Firestore');
            
            // Update session with new credentials
            if (!req.session.user.ncbiCredentials) {
                req.session.user.ncbiCredentials = {};
            }
            req.session.user.ncbiCredentials.email = email;
            req.session.user.ncbiCredentials.apiKey = apiKey;
            
            return res.json({ success: true, message: 'NCBI credentials saved successfully' });
        } catch (firestoreError) {
            console.error('Specific Firestore error:', firestoreError);
            return res.status(500).json({ 
                success: false, 
                error: 'Database error: ' + firestoreError.message,
                code: firestoreError.code
            });
        }
    } catch (error) {
        console.error('Error saving NCBI credentials:', error);
        return res.status(500).json({ 
            success: false, 
            error: 'Failed to save credentials: ' + error.message 
        });
    }
});

module.exports = router;