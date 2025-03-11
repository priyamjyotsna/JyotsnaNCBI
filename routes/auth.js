const express = require('express');
const router = express.Router();
const { initializeApp } = require('firebase/app');
const { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider,
  signOut 
} = require('firebase/auth');
const firebaseConfig = require('../config/firebase-config');
const admin = require('firebase-admin');
const fs = require('fs');

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// Initialize Firebase Admin (do this only once in your app)
if (!admin.apps.length) {
    try {
        const serviceAccount = JSON.parse(
            fs.readFileSync('/Users/jyotsna/Downloads/JyotsnaNCBI/config/firebase-admin.json', 'utf8')
        );
        
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: 'https://jyotsnancbi-default-rtdb.firebaseio.com',
            storageBucket: 'jyotsnancbi.appspot.com'
        });
        
        // Initialize Firestore with proper settings
        const db = admin.firestore();
        db.settings({ 
            ignoreUndefinedProperties: true
            // Removed timestampsInSnapshots: true as it's deprecated
        });
        
        //console.log('Firebase Admin and Firestore initialized successfully');
    } catch (error) {
        //console.error('Firebase Admin initialization error:', error.stack);
        process.exit(1);
    }
}

// Remove the commented out code blocks
// try {
//     const userRef = admin.firestore()...
//     const docSnapshot = await userRef.get();
//     ...
// } catch (firestoreError) {
//     ...
// }

router.get('/login', (req, res) => {
    res.render('auth/login', { user: req.session.user });
});

router.get('/signup', (req, res) => {
    res.render('auth/signup', { user: req.session.user });
});



// Single Google sign-in route
// Update the Google sign-in route for better performance
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
                    lastLogin: admin.firestore.FieldValue.serverTimestamp(),
                    ncbiCredentials: {
                        email: process.env.NCBI_EMAIL || '',
                        apiKey: process.env.NCBI_API_KEY || ''
                    }
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

// Update the welcome route to handle NCBI credentials
router.get('/welcome', async (req, res) => {
    // Log session data for debugging
    console.log('Welcome route - Session user:', req.session.user);
    
    if (!req.session.user) {
        return res.redirect('/auth/login');
    }
    
    try {
        let ncbiCredentials = { email: '', apiKey: '' };
        let firestoreEnabled = true;
        
        // If user is authenticated, try to fetch their NCBI credentials
        if (req.session.user && req.session.user.uid) {
            try {
                const userId = req.session.user.uid;
                const docRef = admin.firestore().collection('users').doc(userId);
                const doc = await docRef.get();
                
                if (doc.exists && doc.data().ncbiCredentials) {
                    ncbiCredentials = {
                        email: doc.data().ncbiCredentials.email || '',
                        apiKey: doc.data().ncbiCredentials.apiKey || ''
                    };
                } else {
                    // Document doesn't exist yet, create it with default values
                    console.log(`Creating new user document for ${userId}`);
                    await docRef.set({
                        email: req.session.user.email,
                        name: req.session.user.name,
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                        ncbiCredentials: {
                            email: process.env.NCBI_EMAIL || '',
                            apiKey: process.env.NCBI_API_KEY || ''
                        }
                    });
                    
                    // Use default credentials
                    ncbiCredentials = {
                        email: process.env.NCBI_EMAIL || '',
                        apiKey: process.env.NCBI_API_KEY || ''
                    };
                }
            } catch (firestoreError) {
                console.error('Firestore error:', firestoreError);
                // Use default NCBI credentials from environment variables if Firestore fails
                ncbiCredentials = {
                    email: process.env.NCBI_EMAIL || '',
                    apiKey: process.env.NCBI_API_KEY || ''
                };
                firestoreEnabled = false;
            }
        }
        
        res.render('auth/welcome', { 
            user: req.session.user,
            ncbiCredentials,
            firestoreEnabled,
            message: firestoreEnabled ? '' : 'Using default NCBI credentials (Firestore unavailable)'
        });
    } catch (error) {
        console.error('Error rendering welcome page:', error);
        // Use default NCBI credentials from environment variables
        const defaultCredentials = {
            email: process.env.NCBI_EMAIL || '',
            apiKey: process.env.NCBI_API_KEY || ''
        };
        
        res.render('auth/welcome', { 
            user: req.session.user,
            ncbiCredentials: defaultCredentials,
            error: 'Failed to load NCBI credentials from database. Using default credentials.',
            firestoreEnabled: false
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
router.post('/save-ncbi-credentials', async (req, res) => {
    if (!req.session.user || !req.session.user.uid) {
        return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    
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

// Remove these commented out and duplicate sections
/*
app.post('/auth/login', async (req, res) => {
  try {
    const { user } = req.body;
    ...
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});
*/

// Remove this duplicate route as well
router.post('/login', async (req, res) => {
  try {
    const { user } = req.body;
    
    // Check if user document exists
    const userDoc = await admin.firestore().collection('users').doc(user.uid).get();
    
    // If document doesn't exist, create it
    if (!userDoc.exists) {
      await admin.firestore().collection('users').doc(user.uid).set({
        email: user.email,
        name: user.name,
        photo: user.photo,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastLogin: admin.firestore.FieldValue.serverTimestamp()
      });
    } else {
      // Update last login
      await admin.firestore().collection('users').doc(user.uid).update({
        lastLogin: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

module.exports = router;