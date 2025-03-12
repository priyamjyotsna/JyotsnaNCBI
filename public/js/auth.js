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
        if (!firebase.apps || !firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        
        const auth = firebase.auth();
        auth.useDeviceLanguage();
        console.log('[' + new Date().toLocaleTimeString() + '] Firebase initialized');

        // Check for redirect result first
        try {
            console.log('[' + new Date().toLocaleTimeString() + '] Checking redirect result...');
            const result = await auth.getRedirectResult();
            if (result.user) {
                console.log('[' + new Date().toLocaleTimeString() + '] User authenticated via redirect');
                await handleAuthSuccess(result.user);
                return;
            }
        } catch (redirectError) {
            console.log('[' + new Date().toLocaleTimeString() + '] No redirect result or error:', redirectError);
        }

        // Check if user is already signed in
        const currentUser = auth.currentUser;
        if (currentUser) {
            console.log('[' + new Date().toLocaleTimeString() + '] User already signed in:', currentUser.email);
            await handleAuthSuccess(currentUser);
            return;
        }

        // Add click handler for sign in button
        signInBtn.addEventListener('click', async () => {
            try {
                signInBtn.disabled = true;
                loading.style.display = 'block';
                errorMessage.style.display = 'none';
                
                console.log('[' + new Date().toLocaleTimeString() + '] Starting authentication...');
                
                const provider = new firebase.auth.GoogleAuthProvider();
                provider.setCustomParameters({
                    prompt: 'select_account'
                });

                // Try popup first, fallback to redirect
                try {
                    console.log('[' + new Date().toLocaleTimeString() + '] Attempting popup sign-in...');
                    const result = await auth.signInWithPopup(provider);
                    console.log('[' + new Date().toLocaleTimeString() + '] Popup sign-in successful');
                    await handleAuthSuccess(result.user);
                } catch (popupError) {
                    console.log('[' + new Date().toLocaleTimeString() + '] Popup failed, trying redirect:', popupError);
                    // If popup fails, try redirect
                    await auth.signInWithRedirect(provider);
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
                signInBtn.disabled = false;
                loading.style.display = 'none';
            }
        });

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

        const data = await response.json();
        console.log('[' + new Date().toLocaleTimeString() + '] Server response:', JSON.stringify(data));
        
        if (data.success) {
            console.log('[' + new Date().toLocaleTimeString() + '] Redirecting to ' + data.redirect + '...');
            window.location.href = data.redirect;
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