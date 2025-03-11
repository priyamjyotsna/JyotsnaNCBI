// Firebase Authentication Handler
function initializeAuth() {
    // Load Firebase config from server
    return fetch('/api/firebase-config')
        .then(response => response.json())
        .then(firebaseConfig => {
            // Initialize Firebase
            if (!firebase.apps || !firebase.apps.length) {
                firebase.initializeApp(firebaseConfig);
            }
            
            const auth = firebase.auth();
            const signInBtn = document.getElementById('googleSignIn');
            const loading = document.getElementById('loading');
            const errorMessage = document.getElementById('errorMessage');

            // Check for redirect result immediately
            auth.getRedirectResult()
                .then(async (result) => {
                    if (result.user) {
                        console.log('Google sign-in successful:', result.user);
                        const token = await result.user.getIdToken();

                        const response = await fetch('/auth/google-signin', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                token,
                                userData: {
                                    uid: result.user.uid,
                                    name: result.user.displayName,
                                    email: result.user.email,
                                    photo: result.user.photoURL
                                }
                            }),
                            credentials: 'include'
                        });

                        const data = await response.json();
                        if (data.success) {
                            window.location.href = data.redirect || '/auth/welcome';
                        } else {
                            throw new Error(data.error || 'Authentication failed');
                        }
                    }
                })
                .catch((error) => {
                    console.error('Redirect result error:', error);
                    if (errorMessage) {
                        errorMessage.textContent = 'Login failed: ' + error.message;
                        errorMessage.style.display = 'block';
                    }
                });

            // Set persistence to LOCAL
            return auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
                .then(() => {
                    console.log('Firebase persistence set to LOCAL');
                    
                    // Add auth state change listener
                    auth.onAuthStateChanged((user) => {
                        if (user) {
                            console.log('User is signed in:', user.email);
                        } else {
                            console.log('User is signed out');
                        }
                    });

                    // Add click handler for sign in button
                    signInBtn.addEventListener('click', async () => {
                        try {
                            signInBtn.disabled = true;
                            loading.style.display = 'block';
                            if (errorMessage) errorMessage.style.display = 'none';
                            console.log('Google sign-in button clicked');

                            const provider = new firebase.auth.GoogleAuthProvider();
                            provider.addScope('profile');
                            provider.addScope('email');
                            
                            provider.setCustomParameters({
                                prompt: 'select_account',
                                auth_type: 'reauthenticate'
                            });

                            // Just start the redirect - the result will be handled when the page reloads
                            await auth.signInWithRedirect(provider);
                        } catch (error) {
                            console.error('Authentication error:', error);
                            let errorMsg = 'Login failed: ';
                            
                            if (error.code === 'auth/popup-closed-by-user') {
                                errorMsg += 'Sign-in was cancelled. Please try again.';
                            } else if (error.code === 'auth/network-request-failed') {
                                errorMsg += 'Network error. Please check your internet connection.';
                            } else if (error.code === 'auth/user-disabled') {
                                errorMsg += 'This account has been disabled.';
                            } else if (error.code === 'auth/user-not-found') {
                                errorMsg += 'No account found with these credentials.';
                            } else {
                                errorMsg += error.message || 'Unknown error occurred';
                            }
                            
                            if (errorMessage) {
                                errorMessage.textContent = errorMsg;
                                errorMessage.style.display = 'block';
                            } else {
                                alert(errorMsg);
                            }
                        } finally {
                            signInBtn.disabled = false;
                            loading.style.display = 'none';
                        }
                    });
                });
        })
        .catch(error => {
            console.error('Error loading Firebase config:', error);
            alert('Failed to initialize authentication. Please try again later.');
        });
}

// Initialize authentication when the script loads
document.addEventListener('DOMContentLoaded', initializeAuth);