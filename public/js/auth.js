// Import Firebase
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth, signInWithPopup, GoogleAuthProvider } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// Remove the imports since we're using the compat version
// Initialize Firebase with your config
const app = firebase.initializeApp({
    apiKey: "AIzaSyDtVu6eDSpPzCM9OvmsnHk9Gf1yPBA3TIw",
    authDomain: "jyotsnancbi.firebaseapp.com",
    projectId: "jyotsnancbi",
    storageBucket: "jyotsnancbi.firebasestorage.app",
    messagingSenderId: "576710168225",
    appId: "1:576710168225:web:8ba7cf57d14edbe21e2ae0"
});

const auth = firebase.auth();

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
        
        // Log user data for debugging
        console.log('Google sign-in successful:', user);

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