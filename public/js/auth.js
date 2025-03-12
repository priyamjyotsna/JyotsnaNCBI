// Firebase Authentication Handler
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
            throw new Error(`Failed to fetch config: ${response.status}`);
        }
        
        const firebaseConfig = await response.json();
        console.log('[' + new Date().toLocaleTimeString() + '] Firebase config loaded', JSON.stringify(firebaseConfig));
        
        // Initialize Firebase with specific auth settings
        console.log('[' + new Date().toLocaleTimeString() + '] Initializing Firebase...');
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        
        const auth = firebase.auth();
        auth.useDeviceLanguage();
        
        // Enable persistence to help with third-party cookie issues
        try {
            await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
        } catch (persistenceError) {
            console.warn('Failed to set persistence:', persistenceError);
            // Continue anyway as this is not critical
        }
        
        console.log('[' + new Date().toLocaleTimeString() + '] Firebase initialized');

        // Parse URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const params = {
            authType: urlParams.get('authType'),
            redirectUrl: urlParams.get('redirectUrl'),
            providerId: urlParams.get('providerId')
        };
        console.log('[' + new Date().toLocaleTimeString() + '] URL parameters', JSON.stringify(params));

        // Check if we're handling a redirect result
        if (document.referrer.includes('accounts.google.com')) {
            try {
                const result = await auth.getRedirectResult();
                if (result.user) {
                    await handleAuthSuccess(result.user);
                    return;
                }
            } catch (redirectError) {
                if (redirectError.code !== 'auth/null-result') {
                    showError('Error completing sign-in redirect. Please try again.', redirectError);
                }
            }
        }

        // Set up auth state listener
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                console.log('[' + new Date().toLocaleTimeString() + '] Auth state changed - user signed in:', user.email);
                try {
                    await handleAuthSuccess(user);
                } catch (error) {
                    console.error('[' + new Date().toLocaleTimeString() + '] Error handling auth success:', error);
                    showError('Error completing sign-in. Please try again.');
                }
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
                    
                    const provider = new firebase.auth.GoogleAuthProvider();
                    provider.setCustomParameters({
                        prompt: 'select_account',
                        // Add additional OAuth 2.0 scopes if needed
                        // scope: 'https://www.googleapis.com/auth/userinfo.email'
                    });

                    // Try popup sign-in with fallback to redirect
                    try {
                        console.log('[' + new Date().toLocaleTimeString() + '] Attempting popup sign-in...');
                        const result = await auth.signInWithPopup(provider);
                        if (result.user) {
                            await handleAuthSuccess(result.user);
                        }
                    } catch (popupError) {
                        console.warn('Popup error:', popupError);
                        
                        if (popupError.code === 'auth/popup-blocked' || 
                            popupError.code === 'auth/popup-closed-by-user' ||
                            popupError.code === 'auth/cancelled-popup-request') {
                            console.log('[' + new Date().toLocaleTimeString() + '] Popup failed, trying redirect...');
                            // Fall back to redirect method
                            await auth.signInWithRedirect(provider);
                            // Page will reload and handle redirect result
                        } else {
                            throw popupError;
                        }
                    }
                } catch (error) {
                    let errorMsg = 'Login failed: ';
                    
                    if (error.code === 'auth/popup-closed-by-user' || 
                        error.code === 'auth/cancelled-popup-request') {
                        errorMsg = 'Sign-in was cancelled. Please try again.';
                    } else if (error.code === 'auth/popup-blocked') {
                        errorMsg = 'Popup was blocked. Please allow popups for this site.';
                    } else if (error.code === 'auth/network-request-failed') {
                        errorMsg = 'Network error. Please check your internet connection.';
                    } else if (error.code === 'auth/unauthorized-domain') {
                        errorMsg = 'This domain is not authorized for Firebase Authentication. Please check your Firebase configuration.';
                    } else if (error.code === 'auth/web-storage-unsupported') {
                        errorMsg = 'Please enable third-party cookies or try a different browser.';
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
        showError('Failed to initialize authentication. Please try again later.', error);
    }
}

// Helper function to handle successful authentication
async function handleAuthSuccess(user) {
    try {
        console.log('[' + new Date().toLocaleTimeString() + '] Processing successful authentication for:', user.email);
        
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
            // Check if this is a popup window
            if (window.opener && window.opener !== window) {
                console.log('[' + new Date().toLocaleTimeString() + '] Closing popup window...');
                try {
                    // Signal the main window to redirect
                    window.opener.postMessage({ 
                        type: 'AUTH_SUCCESS',
                        redirectUrl: '/auth/welcome',
                        timestamp: Date.now()
                    }, window.location.origin);
                    // Close the popup after a short delay to ensure the message is sent
                    setTimeout(() => window.close(), 100);
                } catch (error) {
                    console.error('Error sending message to opener:', error);
                    // If messaging fails, just close and let the main window handle it
                    window.close();
                }
                return;
            }
            
            // For the main window, redirect if needed
            if (!window.location.pathname.includes('/auth/welcome')) {
                console.log('[' + new Date().toLocaleTimeString() + '] Redirecting to welcome page...');
                window.location.href = '/auth/welcome';
            }
        } else {
            throw new Error(data.error || 'Server authentication failed');
        }
    } catch (error) {
        console.error('[' + new Date().toLocaleTimeString() + '] Auth success handling failed:', error);
        throw error;
    }
}

// Add message listener to handle redirect in main window
window.addEventListener('message', (event) => {
    // Verify the origin of the message
    if (event.origin !== window.location.origin) {
        console.warn('Received message from unauthorized origin:', event.origin);
        return;
    }
    
    if (event.data && event.data.type === 'AUTH_SUCCESS') {
        console.log('[' + new Date().toLocaleTimeString() + '] Received auth success message from popup');
        window.location.href = event.data.redirectUrl || '/auth/welcome';
    }
});

// Initialize when the page loads
document.addEventListener('DOMContentLoaded', initializeAuth);