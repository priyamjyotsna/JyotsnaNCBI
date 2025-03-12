// Initialize Firebase with configuration from server
let app;
let auth;

async function initializeFirebase() {
    try {
        const response = await fetch('/api/firebase-config');
        if (!response.ok) {
            throw new Error('Failed to load Firebase configuration');
        }
        
        const config = await response.json();
        app = firebase.initializeApp(config);
        auth = firebase.auth();
        
        console.log('Firebase initialized successfully');
    } catch (error) {
        console.error('Firebase initialization error:', error);
        document.getElementById('errorMessage').textContent = 'Failed to initialize authentication';
        document.getElementById('errorMessage').style.display = 'block';
    }
}

// Initialize Firebase when the page loads
initializeFirebase();

document.getElementById('googleSignIn').addEventListener('click', async () => {
    const button = document.getElementById('googleSignIn');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const errorMessage = document.getElementById('errorMessage');

    try {
        button.disabled = true;
        loadingIndicator.style.display = 'block';
        errorMessage.style.display = 'none';

        const provider = new firebase.auth.GoogleAuthProvider();
        const result = await auth.signInWithPopup(provider);
        const user = result.user;
        
        console.log('Google sign-in successful:', user.email);

        const idToken = await user.getIdToken();
        
        const response = await fetch('/auth/google-signin', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                token: idToken,
                userData: {
                    uid: user.uid,
                    email: user.email,
                    name: user.displayName,
                    photo: user.photoURL
                }
            }),
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error('Network response was not ok');
        }

        const data = await response.json();
        console.log('Server response:', data);

        if (data.success) {
            window.location.href = '/auth/welcome';
        } else {
            throw new Error(data.error || 'Authentication failed');
        }
    } catch (error) {
        console.error('Authentication error:', error);
        errorMessage.textContent = error.message;
        errorMessage.style.display = 'block';
    } finally {
        button.disabled = false;
        loadingIndicator.style.display = 'none';
    }
});