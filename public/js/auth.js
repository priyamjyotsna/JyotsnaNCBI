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
        console.log('[' + new Date().toLocaleTimeString() + '] Setting up 15 second timeout');
        
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
        console.log('[' + new Date().toLocaleTimeString() + '] Firebase initialized');

        // Parse URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const params = {
            authType: urlParams.get('authType'),
            redirectUrl: urlParams.get('redirectUrl'),
            providerId: urlParams.get('providerId')
        };
        console.log('[' + new Date().toLocaleTimeString() + '] URL parameters', JSON.stringify(params));

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
                        prompt: 'select_account'
                    });

                    // Try popup sign-in
                    try {
                        console.log('[' + new Date().toLocaleTimeString() + '] Attempting popup sign-in...');
                        await auth.signInWithPopup(provider);
                        // handleAuthSuccess will be called by onAuthStateChanged
                    } catch (popupError) {
                        if (popupError.code === 'auth/popup-blocked') {
                            console.log('[' + new Date().toLocaleTimeString() + '] Popup blocked, trying redirect...');
                            await auth.signInWithRedirect(provider);
                        } else {
                            throw popupError;
                        }
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
            // Clear any existing redirect parameters from the URL
            const cleanUrl = window.location.origin + window.location.pathname;
            window.history.replaceState({}, document.title, cleanUrl);
            
            // Check if this is a popup window
            if (window.opener && window.opener !== window) {
                console.log('[' + new Date().toLocaleTimeString() + '] Closing popup window...');
                // Signal the main window to redirect
                window.opener.postMessage({ type: 'AUTH_SUCCESS' }, '*');
                // Close the popup
                window.close();
            } else {
                // Only redirect if we're not already on the welcome page
                if (!window.location.pathname.includes('/auth/welcome')) {
                    console.log('[' + new Date().toLocaleTimeString() + '] Redirecting to welcome page...');
                    window.location.href = '/auth/welcome';
                }
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
    if (event.data && event.data.type === 'AUTH_SUCCESS') {
        console.log('[' + new Date().toLocaleTimeString() + '] Received auth success message from popup');
        window.location.href = '/auth/welcome';
    }
});

// Initialize when the page loads
document.addEventListener('DOMContentLoaded', initializeAuth);