const mongoose = require('mongoose');
const express = require('express');
const app = express();

// MongoDB connection string
const MONGODB_URI = 'mongodb+srv://NCBIusr:phAzpt3YbYcZzyT5@cluster0.jgp83.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

// Enable JSON parsing for POST requests
app.use(express.json());

// Create user schema
const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  name: String,
  photo: String,
  auth0Id: String,
  lastLogin: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);

// Connect to MongoDB with options
console.log('Attempting to connect to MongoDB...');
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('Successfully connected to MongoDB Atlas.');
  
  // Create a test user
  return User.create({
    email: 'test@example.com',
    name: 'Test User',
    auth0Id: 'test123'
  });
})
.then(user => {
  console.log('Test user created:', user);
})
.catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

// Test route to get all users
app.get('/test', async (req, res) => {
  try {
    const users = await User.find();
    res.json({ 
      message: 'MongoDB is working!', 
      users,
      count: users.length 
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ 
      error: error.message,
      stack: error.stack 
    });
  }
});

// Test route to create a new user
app.post('/test/create', async (req, res) => {
  try {
    const user = await User.create({
      email: 'test2@example.com',
      name: 'Test User 2',
      auth0Id: 'test456'
    });
    res.json({ 
      message: 'User created successfully', 
      user 
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ 
      error: error.message,
      stack: error.stack 
    });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Test server running on port ${PORT}`);
  console.log(`Test the connection by visiting: http://localhost:${PORT}/test`);
}); 