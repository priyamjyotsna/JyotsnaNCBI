// Firebase Authentication Handler
function initializeAuth() {
    // Load Firebase config from server
    return fetch('/api/firebase-config')
        .then(response => response.json())
        .then(firebaseConfig => {
            // Initialize Firebase with specific auth settings
            if (!firebase.apps || !firebase.apps.length) {
                firebase.initializeApp(firebaseConfig);
                // Set auth settings to handle auth without Firebase Hosting
                const auth = firebase.auth();
                auth.useDeviceLanguage();
                auth.settings.appVerificationDisabledForTesting = false;
            }
            
            const auth = firebase.auth();
            const signInBtn = document.getElementById('googleSignIn');
            const loading = document.getElementById('loading');
            const errorMessage = document.getElementById('errorMessage');

            // Add click handler for sign in button
            signInBtn.addEventListener('click', async () => {
                try {
                    signInBtn.disabled = true;
                    loading.style.display = 'block';
                    if (errorMessage) errorMessage.style.display = 'none';

                    const provider = new firebase.auth.GoogleAuthProvider();
                    provider.setCustomParameters({
                        prompt: 'select_account'
                    });
                    
                    // Use popup for authentication with custom settings
                    const result = await auth.signInWithPopup(provider);
                    const user = result.user;
                    console.log('Google sign-in successful');

                    // Get the token and send to server
                    const token = await user.getIdToken();
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
                    if (data.success) {
                        window.location.href = '/auth/welcome';
                    } else {
                        throw new Error(data.error || 'Authentication failed');
                    }
                } catch (error) {
                    console.error('Authentication error:', error);
                    let errorMsg = 'Login failed: ';
                    
                    if (error.code === 'auth/popup-closed-by-user') {
                        errorMsg += 'Sign-in was cancelled. Please try again.';
                    } else if (error.code === 'auth/popup-blocked') {
                        errorMsg += 'Popup was blocked. Please allow popups for this site.';
                    } else if (error.code === 'auth/network-request-failed') {
                        errorMsg += 'Network error. Please check your internet connection.';
                    } else {
                        errorMsg += error.message || 'Unknown error occurred';
                    }
                    
                    if (errorMessage) {
                        errorMessage.textContent = errorMsg;
                        errorMessage.style.display = 'block';
                    }
                } finally {
                    signInBtn.disabled = false;
                    loading.style.display = 'none';
                }
            });
        })
        .catch(error => {
            console.error('Failed to initialize Firebase:', error);
            const errorMessage = document.getElementById('errorMessage');
            if (errorMessage) {
                errorMessage.textContent = 'Failed to initialize authentication. Please try again later.';
                errorMessage.style.display = 'block';
            }
        });
}

// Initialize when the page loads
document.addEventListener('DOMContentLoaded', initializeAuth);