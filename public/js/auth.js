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

        // Get URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const params = {
            authType: urlParams.get('authType'),
            redirectUrl: urlParams.get('redirectUrl'),
            providerId: urlParams.get('providerId')
        };
        console.log('[' + new Date().toLocaleTimeString() + '] URL parameters', JSON.stringify(params));

        // Add click handler for sign in button
        signInBtn.addEventListener('click', async () => {
            try {
                signInBtn.disabled = true;
                loading.style.display = 'block';
                errorMessage.style.display = 'none';
                
                console.log('[' + new Date().toLocaleTimeString() + '] Processing authentication...');
                
                const provider = new firebase.auth.GoogleAuthProvider();
                provider.setCustomParameters({
                    prompt: 'select_account',
                    auth_type: 'reauthenticate'
                });

                // First check if we have a redirect result
                console.log('[' + new Date().toLocaleTimeString() + '] Waiting for auth state...');
                const user = await new Promise((resolve, reject) => {
                    const unsubscribe = auth.onAuthStateChanged(user => {
                        unsubscribe();
                        if (user) {
                            console.log('[' + new Date().toLocaleTimeString() + '] Auth state check result', JSON.stringify(user.toJSON()));
                            resolve(user);
                        } else {
                            resolve(null);
                        }
                    }, reject);
                });

                if (!user) {
                    console.log('[' + new Date().toLocaleTimeString() + '] No existing user, starting sign in...');
                    const result = await auth.signInWithPopup(provider);
                    if (!result.user) {
                        throw new Error('Failed to get user from popup result');
                    }
                    console.log('[' + new Date().toLocaleTimeString() + '] User authenticated, proceeding...');
                }

                // Get the token from either existing user or new sign in
                const token = await (user || auth.currentUser).getIdToken();
                console.log('[' + new Date().toLocaleTimeString() + '] Token obtained from auth state');
                
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
                            uid: (user || auth.currentUser).uid,
                            name: (user || auth.currentUser).displayName,
                            email: (user || auth.currentUser).email,
                            photo: (user || auth.currentUser).photoURL
                        }
                    }),
                    credentials: 'include'
                });

                const data = await response.json();
                console.log('[' + new Date().toLocaleTimeString() + '] Server response', JSON.stringify(data));
                
                if (data.success) {
                    console.log('[' + new Date().toLocaleTimeString() + '] Redirecting to ' + data.redirect + '...');
                    window.location.href = data.redirect;
                } else {
                    throw new Error(data.error || 'Server authentication failed');
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

// Initialize when the page loads
document.addEventListener('DOMContentLoaded', initializeAuth);