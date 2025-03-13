// Load environment variables first
require('dotenv').config();

const express = require('express');
const path = require('path');
const session = require('express-session');
const admin = require('firebase-admin');
const axios = require('axios');
const cluster = require('cluster');
const numCPUs = require('os').cpus().length;
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fileUpload = require('express-fileupload');

// Import auth router and middleware
const authRouter = require('./routes/auth');
const requireAuth = authRouter.requireAuth;

// Validate required environment variables
const requiredEnvVars = [
    'FIREBASE_API_KEY',
    'FIREBASE_AUTH_DOMAIN',
    'FIREBASE_PROJECT_ID',
    'FIREBASE_PRIVATE_KEY',
    'FIREBASE_CLIENT_EMAIL',
    'SESSION_SECRET',
    'REDIS_URL'
];

// Create Express app
const app = express();

// Initialize Firebase Admin
try {
    console.log('Starting Firebase initialization...');
    
    if (!admin.apps.length) {
        let privateKey = process.env.FIREBASE_PRIVATE_KEY;
        if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
            privateKey = privateKey.slice(1, -1);
        }
        privateKey = privateKey.replace(/\\n/g, '\n');
            
        const firebaseConfig = {
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: privateKey
            })
        };
        
        admin.initializeApp(firebaseConfig);
        console.log('Firebase initialized successfully');
    }
} catch (error) {
    console.error('Firebase initialization error:', error);
    process.exit(1);
}

// Add security middleware
const isProd = process.env.NODE_ENV === 'production';

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
                "'self'", 
                "'unsafe-inline'",
                "'unsafe-eval'",
                "https://www.gstatic.com",
                "https://cdn.jsdelivr.net",
                "https://cdnjs.cloudflare.com",
                "https://unpkg.com",
                "https://html2canvas.hertzen.com"
            ],
            styleSrc: [
                "'self'", 
                "'unsafe-inline'", 
                "https://www.gstatic.com",
                "https://fonts.googleapis.com",
                "https://cdnjs.cloudflare.com"
            ],
            imgSrc: [
                "'self'", 
                "data:", 
                "blob:",
                "https://www.gstatic.com", 
                "https://*.googleapis.com",
                "https://*.googleusercontent.com"
            ],
            connectSrc: ["'self'", "https://*.firebaseio.com", "https://*.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            frameSrc: ["'self'", "blob:", "https://*.firebaseapp.com"],
            objectSrc: ["'none'"],
            workerSrc: ["'self'", "blob:"],
            downloadSrc: ["'self'"],
            baseUri: ["'self'"]
        }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(compression());
app.use(fileUpload({
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max file size
    useTempFiles: true,
    tempFileDir: '/tmp/'
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Redis session store for production
let sessionConfig = {
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    name: 'ncbi_session',
    proxy: true,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'lax',
        domain: process.env.NODE_ENV === 'production' ? '.jyotsnapriyam.com' : undefined
    }
};

if (process.env.NODE_ENV === 'production') {
    const RedisStore = require('connect-redis').default;
    const { createClient } = require('redis');
    const redisClient = createClient({
        url: process.env.REDIS_URL,
        legacyMode: false
    });

    redisClient.on('error', function(err) {
        console.error('Redis error:', err);
    });

    redisClient.connect().catch(console.error);

    sessionConfig.store = new RedisStore({
        client: redisClient,
        prefix: 'ncbi:'
    });
}

app.use(session(sessionConfig));

// Request logging middleware
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[${req.method}]${res.statusCode}${req.hostname}${req.url} clientIP="${req.ip}" requestID="${req.id}" responseTimeMS=${duration} responseBytes=${res.get('Content-Length')} userAgent="${req.get('user-agent')}"`);
    });
    next();
});

// View engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Basic middleware setup
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Make user data available to views
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

// Add security headers middleware with updated CORS
app.use((req, res, next) => {
    // Security headers
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Set CORS headers
    const allowedOrigins = [
        'https://ncbi.jyotsnapriyam.com',
        'https://jyotsnapriyam.com',
        'https://jyotsna-ncbi.onrender.com'
    ];
    
    const origin = req.headers.origin;
    
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    next();
});

// Add health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

// Mount auth routes
app.use('/auth', authRouter);

// Firebase config endpoint
app.get('/api/firebase-config', (req, res) => {
    res.json({
        apiKey: process.env.FIREBASE_API_KEY,
        authDomain: "jyotsnancbi.firebaseapp.com",
        projectId: process.env.FIREBASE_PROJECT_ID,
        databaseURL: "https://jyotsnancbi-default-rtdb.firebaseio.com",
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "jyotsnancbi.appspot.com",
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "123456789012",
        appId: process.env.FIREBASE_APP_ID || "1:123456789012:web:abcdef1234567890"
    });
});

// Root route with error handling
app.get('/', (req, res) => {
    try {
        res.render('index', { user: req.session.user });
    } catch (error) {
        console.error('Error rendering index:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Nucleotide download route
app.get('/nucleotide-download', requireAuth, (req, res) => {
    try {
        res.render('nucleotide-download', { user: req.session.user });
    } catch (error) {
        console.error('Error rendering nucleotide-download:', error);
        res.status(500).send('Internal Server Error');
    }
});

// NCBI API endpoint for nucleotide download
app.get('/api/nucleotide/sequence', requireAuth, async (req, res) => {
    try {
        const { id } = req.query;
        if (!id) {
            return res.status(400).json({
                success: false,
                error: 'No sequence ID provided'
            });
        }

        const userEmail = req.session?.user?.email;
        if (!userEmail) {
            return res.status(401).json({
                success: false,
                error: 'User not authenticated'
            });
        }

        const baseUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
        const tool = 'nucleotide-downloader';
        const ncbiApiKey = process.env.NCBI_API_KEY;
        
        // Add delay between requests
        const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
        await delay(500); // 500ms delay to respect NCBI rate limits

        // First fetch sequence ID
        const searchUrl = `${baseUrl}/esearch.fcgi`;
        const searchParams = {
            db: 'nucleotide',
            term: `${id}[accn]`,
            retmode: 'json',
            tool: tool,
            email: userEmail,
            api_key: ncbiApiKey
        };

        const searchResponse = await axios.get(searchUrl, { params: searchParams });
        
        if (!searchResponse.data?.esearchresult?.idlist?.[0]) {
            return res.status(404).json({
                success: false,
                error: `Sequence ${id} not found`
            });
        }

        // Then fetch the actual sequence
        const fetchUrl = `${baseUrl}/efetch.fcgi`;
        const fetchParams = {
            db: 'nucleotide',
            id: searchResponse.data.esearchresult.idlist[0],
            rettype: 'fasta',
            retmode: 'text',
            tool: tool,
            email: userEmail,
            api_key: ncbiApiKey
        };

        const fetchResponse = await axios.get(fetchUrl, { params: fetchParams });

        return res.json({
            success: true,
            data: fetchResponse.data
        });

    } catch (error) {
        console.error('NCBI API Error:', error.response?.data || error.message);
        return res.status(500).json({
            success: false,
            error: 'Failed to fetch sequence',
            details: error.response?.data || error.message
        });
    }
});

// Add NCBI credentials endpoint
app.get('/api/user/ncbi-credentials', requireAuth, (req, res) => {
    try {
        const user = req.session.user;
        const hasCredentials = !!(user && user.ncbiCredentials && user.ncbiCredentials.email && user.ncbiCredentials.apiKey);
        
        res.json({
            success: true,
            credentials: {
                exists: hasCredentials
            }
        });
    } catch (error) {
        console.error('Error checking NCBI credentials:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to check NCBI credentials'
        });
    }
});

// Import and use API routes
const apiRoutes = require('./routes/api');
app.use('/api', apiRoutes);

// DNA Analysis routes
app.get('/dna-analysis', requireAuth, (req, res) => {
    res.render('dna-analysis', { user: req.session.user });
});

app.post('/api/analyze-uploaded-sequence', requireAuth, async (req, res) => {
    try {
        if (!req.files || !req.files.sequenceFile) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        const file = req.files.sequenceFile;
        const sequence = file.data.toString();
        res.json({ sequence });
    } catch (error) {
        console.error('Error analyzing sequence:', error);
        res.status(500).json({ error: 'Failed to analyze sequence' });
    }
});

app.get('/sequence-fetch', requireAuth, (req, res) => {
    try {
        res.render('sequence-fetch', { user: req.session.user });
    } catch (error) {
        console.error('Error rendering sequence-fetch:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/api/sequence/fetch', requireAuth, async (req, res) => {
    try {
        const { id } = req.query;
        if (!id) {
            return res.status(400).json({ success: false, error: 'No sequence ID provided' });
        }

        const userEmail = req.session?.user?.email;
        const baseUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
        const tool = 'sequence-fetch';
        const ncbiApiKey = process.env.NCBI_API_KEY;

        // Fetch sequence data from NCBI
        const searchUrl = `${baseUrl}/esearch.fcgi`;
        const searchParams = {
            db: 'nucleotide',
            term: `${id}[accn]`,
            retmode: 'json',
            tool: tool,
            email: userEmail,
            api_key: ncbiApiKey
        };

        const searchResponse = await axios.get(searchUrl, { params: searchParams });
        
        if (!searchResponse.data?.esearchresult?.idlist?.[0]) {
            return res.status(404).json({
                success: false,
                error: `Sequence ${id} not found`
            });
        }

        // Fetch sequence details
        const fetchUrl = `${baseUrl}/efetch.fcgi`;
        const fetchParams = {
            db: 'nucleotide',
            id: searchResponse.data.esearchresult.idlist[0],
            rettype: 'gb',
            retmode: 'xml',
            tool: tool,
            email: userEmail,
            api_key: ncbiApiKey
        };

        const fetchResponse = await axios.get(fetchUrl, { params: fetchParams });
        
        // Parse the response and extract required fields
        const sequence = fetchResponse.data;
        // Add parsing logic here to extract sequence, organism, moltype, etc.

        return res.json({
            success: true,
            data: {
                sequence: sequence,
                organism: 'Parsed Organism',
                length: sequence.length,
                moltype: 'DNA/RNA',
                update_date: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Error fetching sequence:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch sequence data'
        });
    }
});

app.get('/api/fetch-sequence', requireAuth, async (req, res) => {
    try {
        const { accession } = req.query;
        if (!accession) {
            return res.status(400).json({ error: 'No accession provided' });
        }
        
        // Add NCBI API fetch logic here
        // For now returning a mock response
        const response = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=nucleotide&id=${accession}&rettype=fasta&retmode=text`);
        const sequence = await response.text();
        
        res.json({ sequence });
    } catch (error) {
        console.error('Error fetching sequence:', error);
        res.status(500).json({ error: 'Failed to fetch sequence' });
    }
});

// Design Primers routes
app.get('/design-primers', requireAuth, (req, res) => {
    try {
        res.render('design-primers', { user: req.session.user });
    } catch (error) {
        console.error('Error rendering design-primers:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/api/design-primers', requireAuth, async (req, res) => {
    try {
        const { sequence, params } = req.body;
        if (!sequence) {
            return res.status(400).json({ error: 'No sequence provided' });
        }

        const userEmail = req.session?.user?.email;
        const baseUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
        const tool = 'primer-design';
        const ncbiApiKey = process.env.NCBI_API_KEY;

        // Add primer design logic here
        // This will integrate with NCBI's Primer-BLAST or similar service

        res.json({
            success: true,
            data: {
                primers: [], // Array of designed primers
                parameters: params,
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Error designing primers:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to design primers'
        });
    }
});

// Variant Analysis routes
app.get('/variant-analysis', requireAuth, (req, res) => {
    try {
        res.render('variant-analysis', { user: req.session.user });
    } catch (error) {
        console.error('Error rendering variant-analysis:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/api/analyze-variants', requireAuth, async (req, res) => {
    try {
        if (!req.files || !req.files.variantFile) {
            return res.status(400).json({ 
                success: false, 
                error: 'No variant file uploaded' 
            });
        }

        const file = req.files.variantFile;
        const batchSize = parseInt(req.body.batchSize) || 50;
        const options = JSON.parse(req.body.options || '[]');
        
        // Process the TSV file and analyze variants
        const variants = await analyzeVariants(file, batchSize, options);
        
        res.json({
            success: true,
            data: variants
        });

    } catch (error) {
        console.error('Error analyzing variants:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to analyze variants'
        });
    }
});

async function analyzeVariants(file, batchSize, options) {
    // Read and parse TSV file
    const content = file.data.toString();
    const lines = content.split('\n').filter(line => line.trim());
    const variants = [];

    // Process in batches
    for (let i = 0; i < lines.length; i += batchSize) {
        const batch = lines.slice(i, i + batchSize);
        // Process each variant in the batch
        // Add Ensembl API integration here
    }

    return variants;
}

// Sequence Comparison routes
app.get('/sequence-comparison', requireAuth, (req, res) => {
    try {
        res.render('sequence-comparison', { user: req.session.user });
    } catch (error) {
        console.error('Error rendering sequence-comparison:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/sequence-comparison/api/compare-sequences', requireAuth, async (req, res) => {
    try {
        // Check if user is authenticated
        if (!req.session.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        // Check if request body is properly formatted
        if (!req.body || typeof req.body !== 'object') {
            return res.status(400).json({
                success: false,
                error: 'Invalid request format'
            });
        }

        const { referenceSequence, querySequence } = req.body;
        
        // Validate input sequences
        if (!referenceSequence || !querySequence || 
            typeof referenceSequence !== 'string' || 
            typeof querySequence !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Both reference and query sequences are required and must be strings'
            });
        }

        // Clean sequences (remove whitespace and normalize)
        const cleanReference = referenceSequence.trim().toUpperCase();
        const cleanQuery = querySequence.trim().toUpperCase();

        // Perform sequence comparison
        const results = await compareSequences(cleanReference, cleanQuery);
        
        return res.json({
            success: true,
            mutations: results.mutations,
            alignment: results.alignment,
            distributionStats: results.mutationTypes,
            metadata: results.metadata
        });

    } catch (error) {
        console.error('Error comparing sequences:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to compare sequences',
            details: error.message
        });
    }
});

// Update the sequence fetch endpoint
app.get('/sequence-comparison/api/fetch-sequence', requireAuth, async (req, res) => {
    try {
        const { id } = req.query;
        if (!id) {
            return res.status(400).json({
                success: false,
                error: 'No sequence ID provided'
            });
        }

        const userEmail = req.session?.user?.email;
        if (!userEmail) {
            return res.status(401).json({
                success: false,
                error: 'User not authenticated'
            });
        }

        const baseUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
        const tool = 'sequence-comparison';
        const ncbiApiKey = process.env.NCBI_API_KEY;

        // Add delay between requests
        const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
        await delay(500); // 500ms delay to respect NCBI rate limits

        // First fetch sequence ID
        const searchUrl = `${baseUrl}/esearch.fcgi`;
        const searchParams = {
            db: 'nucleotide',
            term: `${id}[accn]`,
            retmode: 'json',
            tool: tool,
            email: userEmail,
            api_key: ncbiApiKey
        };

        const searchResponse = await axios.get(searchUrl, { params: searchParams });
        
        if (!searchResponse.data?.esearchresult?.idlist?.[0]) {
            return res.status(404).json({
                success: false,
                error: `Sequence ${id} not found`
            });
        }

        // Then fetch the actual sequence
        const fetchUrl = `${baseUrl}/efetch.fcgi`;
        const fetchParams = {
            db: 'nucleotide',
            id: searchResponse.data.esearchresult.idlist[0],
            rettype: 'fasta',
            retmode: 'text',
            tool: tool,
            email: userEmail,
            api_key: ncbiApiKey
        };

        const fetchResponse = await axios.get(fetchUrl, { params: fetchParams });
        const sequence = parseFasta(fetchResponse.data);

        return res.json({
            success: true,
            header: sequence.header,
            sequence: sequence.sequence
        });

    } catch (error) {
        console.error('NCBI API Error:', error.response?.data || error.message);
        return res.status(500).json({
            success: false,
            error: 'Failed to fetch sequence',
            details: error.response?.data || error.message
        });
    }
});

// Helper function to parse FASTA format
function parseFasta(text) {
    const lines = text.split('\n');
    let header = '';
    let sequence = '';
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.length === 0) continue;
        
        if (line[0] === '>') {
            header = line.substring(1);
        } else {
            sequence += line;
        }
    }
    
    return { header, sequence };
}

async function compareSequences(reference, query) {
    // Implement sequence comparison logic
    const mutations = [];
    const alignment = { reference: '', query: '' };
    let substitutions = 0, insertions = 0, deletions = 0;

    // Basic sequence alignment and mutation detection
    let i = 0, j = 0;
    while (i < reference.length || j < query.length) {
        if (i < reference.length && j < query.length) {
            if (reference[i] !== query[j]) {
                mutations.push({
                    position: i + 1,
                    reference: reference[i],
                    query: query[j],
                    type: 'substitution'
                });
                substitutions++;
            }
            i++; j++;
        } else if (i < reference.length) {
            mutations.push({
                position: i + 1,
                reference: reference[i],
                query: '-',
                type: 'deletion'
            });
            deletions++;
            i++;
        } else {
            mutations.push({
                position: j + 1,
                reference: '-',
                query: query[j],
                type: 'insertion'
            });
            insertions++;
            j++;
        }
    }

    return {
        mutations,
        alignment,
        mutationTypes: { substitutions, insertions, deletions },
        metadata: {
            reference: { length: reference.length },
            query: { length: query.length }
        }
    };
}

// Error handling middleware (should be last)
app.use((err, req, res, next) => {
    console.error('Global error handler:', err);
    res.status(500).send('Internal Server Error');
});

// Export app for testing
module.exports = app;

// Start server only if this is the main module
if (require.main === module) {
    if (cluster.isMaster && process.env.NODE_ENV === 'production') {
        console.log(`Master ${process.pid} is running`);

        // Fork workers
        for (let i = 0; i < numCPUs; i++) {
            cluster.fork();
        }

        cluster.on('exit', (worker, code, signal) => {
            console.log(`Worker ${worker.process.pid} died. Restarting...`);
            cluster.fork();
        });
    } else {
        // Worker process or development environment
        const PORT = process.env.PORT || 10000;
        const server = app.listen(PORT, () => {
            console.log(`Worker ${process.pid} started`);
            console.log(`Server is running on port ${PORT}`);
            console.log(`Environment: ${process.env.NODE_ENV}`);
            console.log(`Auth Domain: ${process.env.FIREBASE_AUTH_DOMAIN}`);
        });

        // Enable keep-alive connections
        server.keepAliveTimeout = 65000;
        server.headersTimeout = 66000;

        // Graceful shutdown handler
        process.on('SIGTERM', () => {
            console.log('SIGTERM received. Starting graceful shutdown...');
            server.close(() => {
                console.log('Server closed gracefully');
                process.exit(0);
            });

            // Force close after 30s
            setTimeout(() => {
                console.error('Could not close connections in time, forcefully shutting down');
                process.exit(1);
            }, 30000);
        });
    }
}

const config = {
    port: process.env.PORT || 3007,
    nodeEnv: process.env.NODE_ENV || 'development',
    ncbiEmail: process.env.NCBI_EMAIL,
    ncbiApiKey: process.env.NCBI_API_KEY,
    // ... other config values
};
