// Firebase Authentication Handler
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js';
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-analytics.js';

async function initializeAuth() {
    const signInBtn = document.getElementById('googleSignIn');
    const loading = document.getElementById('loadingIndicator');
    const errorMessage = document.getElementById('errorMessage');
    
    function showError(message, error = null) {
        console.error('Authentication error:', message, error);
        if (errorMessage) {
            errorMessage.textContent = message;
            errorMessage.style.display = 'block';
        }
        if (loading) {
            loading.style.display = 'none';
        }
        if (signInBtn) {
            signInBtn.disabled = false;
        }
    }

    try {
        console.log('[' + new Date().toLocaleTimeString() + '] Setting up authentication...');
        
        // Load Firebase config from server
        console.log('[' + new Date().toLocaleTimeString() + '] Fetching Firebase configuration...');
        const response = await fetch('/api/firebase-config');
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to fetch config: ${response.status}`);
        }
        
        const firebaseConfig = await response.json();
        console.log('[' + new Date().toLocaleTimeString() + '] Firebase config loaded successfully');
        
        // Validate required config fields
        const requiredFields = ['apiKey', 'authDomain', 'projectId', 'databaseURL', 'storageBucket', 'messagingSenderId', 'appId'];
        const missingFields = requiredFields.filter(field => !firebaseConfig[field]);
        if (missingFields.length > 0) {
            throw new Error(`Missing required Firebase config fields: ${missingFields.join(', ')}`);
        }
        
        // Initialize Firebase
        console.log('[' + new Date().toLocaleTimeString() + '] Initializing Firebase...');
        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app);
        
        // Initialize Analytics only if measurementId is available
        let analytics = null;
        if (firebaseConfig.measurementId) {
            try {
                analytics = getAnalytics(app);
                console.log('[' + new Date().toLocaleTimeString() + '] Analytics initialized');
            } catch (error) {
                console.warn('[' + new Date().toLocaleTimeString() + '] Analytics initialization skipped:', error.message);
            }
        }
        
        console.log('[' + new Date().toLocaleTimeString() + '] Firebase initialized successfully');

        // Set up auth state listener
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                console.log('[' + new Date().toLocaleTimeString() + '] Auth state changed - user signed in:', user.email);
                try {
                    await handleAuthSuccess(user);
                } catch (error) {
                    console.error('[' + new Date().toLocaleTimeString() + '] Error handling auth success:', error);
                    showError('Error completing sign-in. Please try again.');
                }
            } else {
                console.log('[' + new Date().toLocaleTimeString() + '] Auth state changed - user signed out');
            }
        });

        // Add click handler for sign in button
        if (signInBtn) {
            signInBtn.addEventListener('click', async () => {
                try {
                    signInBtn.disabled = true;
                    if (loading) loading.style.display = 'block';
                    if (errorMessage) errorMessage.style.display = 'none';
                    
                    console.log('[' + new Date().toLocaleTimeString() + '] Starting authentication...');
                    
                    const provider = new GoogleAuthProvider();
                    provider.setCustomParameters({
                        prompt: 'select_account'
                    });

                    // Use popup sign-in
                    const result = await signInWithPopup(auth, provider);
                    if (result.user) {
                        await handleAuthSuccess(result.user);
                    }
                } catch (error) {
                    let errorMsg = 'Login failed: ';
                    
                    if (error.code === 'auth/popup-closed-by-user') {
                        errorMsg = 'Sign-in was cancelled. Please try again.';
                    } else if (error.code === 'auth/popup-blocked') {
                        errorMsg = 'Popup was blocked. Please allow popups for this site.';
                    } else if (error.code === 'auth/network-request-failed') {
                        errorMsg = 'Network error. Please check your internet connection.';
                    } else if (error.code === 'auth/unauthorized-domain') {
                        errorMsg = 'This domain is not authorized for Firebase Authentication. Please check your Firebase configuration.';
                    } else {
                        errorMsg += error.message || 'Unknown error occurred';
                    }
                    
                    showError(errorMsg, error);
                } finally {
                    if (signInBtn) signInBtn.disabled = false;
                    if (loading) loading.style.display = 'none';
                }
            });
        }
    } catch (error) {
        console.error('[' + new Date().toLocaleTimeString() + '] Authentication initialization failed:', error);
        showError('Failed to initialize authentication. Please try again later.', error);
    }
}

// Helper function to handle successful authentication
async function handleAuthSuccess(user) {
    try {
        console.log('[' + new Date().toLocaleTimeString() + '] Processing authentication...');
        
        // Get fresh token
        const token = await user.getIdToken(true);
        
        // Verify with server
        console.log('[' + new Date().toLocaleTimeString() + '] Verifying with server...');
        const response = await fetch('/auth/google-signin', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                token,
                userData: {
                    uid: user.uid,
                    name: user.displayName,
                    email: user.email,
                    photo: user.photoURL
                }
            }),
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error(`Server responded with status: ${response.status}`);
        }

        const data = await response.json();
        console.log('[' + new Date().toLocaleTimeString() + '] Server response:', JSON.stringify(data));
        
        if (data.success) {
            console.log('[' + new Date().toLocaleTimeString() + '] Redirecting to welcome page...');
            window.location.href = '/auth/welcome';
        } else {
            throw new Error(data.error || 'Server authentication failed');
        }
    } catch (error) {
        console.error('[' + new Date().toLocaleTimeString() + '] Auth success handling failed:', error);
        throw error;
    }
}

// Initialize when the page loads
document.addEventListener('DOMContentLoaded', initializeAuth);