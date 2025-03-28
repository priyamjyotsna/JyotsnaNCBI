const express = require('express');
const path = require('path');
const axios = require('axios');
const session = require('express-session');
const admin = require('firebase-admin');
const multer = require('multer');
// Use memory storage instead of disk storage
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});
const fs = require('fs');
const csv = require('csv-parse');

// Initialize Firebase Admin
try {
    if (!admin.apps.length) {
        admin.initializeApp();
    }
} catch (error) {
    console.error('Firebase initialization error:', error);
}

// Make Firestore available to your routes
const db = admin.firestore();

const authRoutes = require('./routes/auth');
require('dotenv').config();
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Update your session middleware
app.use(session({
    secret: 'jyotsna-ncbi-secret-key',
    resave: true,
    saveUninitialized: true,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// Add this middleware to check authentication
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

// Add this authentication middleware
const requireAuth = (req, res, next) => {
    if (!req.session.user) {
        return res.redirect('/auth/login');
    }
    next();
};

app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

// View engine setup - Update paths for Firebase Functions
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Serve static files - Update paths for Firebase Functions
app.use(express.static(path.join(__dirname, 'public')));
app.use('/auth', authRoutes);

// Add this route to handle NCBI credentials
app.post('/api/save-ncbi-credentials', requireAuth, async (req, res) => {
    try {
        // Get the credentials from the form
        const { ncbiEmail, ncbiApiKey } = req.body;
        
        if (!req.session.user || !req.session.user.uid) {
            return res.status(401).json({ success: false, error: 'Not authenticated' });
        }
        
        const userId = req.session.user.uid;
        
        // Save to Firestore
        await db.collection('users').doc(userId).set({
            ncbiCredentials: {
                email: ncbiEmail,
                apiKey: ncbiApiKey,
                updatedAt: new Date()
            }
        }, { merge: true });
        
        // Also update the session for immediate use
        req.session.user.ncbiEmail = ncbiEmail;
        req.session.user.ncbiApiKey = ncbiApiKey;
        
        // Return success response
        res.json({ success: true, message: 'NCBI credentials saved successfully' });
    } catch (error) {
        console.error('Error saving NCBI credentials:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Add API endpoint to get NCBI credentials
app.get('/api/get-ncbi-credentials', requireAuth, async (req, res) => {
    try {
        if (!req.session.user || !req.session.user.uid) {
            return res.status(401).json({ success: false, error: 'Not authenticated' });
        }
        
        const userId = req.session.user.uid;
        
        // Get from Firestore
        const doc = await db.collection('users').doc(userId).get();
        
        if (doc.exists && doc.data().ncbiCredentials) {
            const credentials = doc.data().ncbiCredentials;
            res.json({ 
                success: true, 
                data: {
                    email: credentials.email,
                    apiKey: credentials.apiKey
                }
            });
        } else {
            res.json({ 
                success: true, 
                data: {
                    email: '',
                    apiKey: ''
                }
            });
        }
    } catch (error) {
        console.error('Error getting NCBI credentials:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Consolidated API routes
app.get('/api/config', (req, res) => {
    res.json({
        email: process.env.NCBI_EMAIL || 'your.email@example.com'
    });
});

// PubMed API routes
app.get('/api/pubmed/search', async (req, res) => {
    try {
        const { query } = req.query;
        if (!query) {
            return res.status(400).json({ error: 'Query parameter is required' });
        }

        const baseUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
        const email = process.env.NCBI_EMAIL || 'your.email@example.com';
        
        const searchUrl = `${baseUrl}/esearch.fcgi`;
        const searchParams = {
            db: 'pubmed',
            term: query,
            retmode: 'json',
            retmax: 100,
            tool: 'pubmed-search',
            email: email
        };

        const searchResponse = await axios.get(searchUrl, { params: searchParams });
        return res.json(searchResponse.data);

    } catch (error) {
        console.error('PubMed search error:', error.message);
        return res.status(500).json({ 
            error: 'Failed to fetch PubMed results',
            message: error.message
        });
    }
});

// Add PubMed summary endpoint
app.get('/api/pubmed/summary', async (req, res) => {
    try {
        const { ids } = req.query;
        if (!ids) {
            return res.status(400).json({ error: 'IDs parameter is required' });
        }

        const baseUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
        const email = process.env.NCBI_EMAIL || 'your.email@example.com';
        
        const summaryUrl = `${baseUrl}/esummary.fcgi`;
        const summaryParams = {
            db: 'pubmed',
            id: ids,
            retmode: 'json',
            tool: 'pubmed-search',
            email: email
        };

        const summaryResponse = await axios.get(summaryUrl, { params: summaryParams });
        return res.json(summaryResponse.data);

    } catch (error) {
        console.error('PubMed summary error:', error.message);
        return res.status(500).json({ 
            error: 'Failed to fetch PubMed summaries',
            message: error.message
        });
    }
});

// Add explicit index route handler
app.get('/', (req, res) => {
    console.log('Index route accessed');
    res.render('index', {
        user: req.session.user || null
    });
});

app.get('/pubmed-search', requireAuth, (req, res) => {
    res.render('pubmed-search');
});

app.get('/nucleotide-download', requireAuth, (req, res) => {
    res.render('nucleotide-download');
});

// Add this new route
app.get('/sequence-fetch', requireAuth, (req, res) => {
    res.render('sequence-fetch');
});

// API routes for nucleotide download
app.get('/api/nucleotide/sequence', async (req, res) => {
    try {
        const { id } = req.query;
        const baseUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
        
        // Use user's NCBI credentials if available in session
        const email = req.session.user?.ncbiEmail || process.env.NCBI_EMAIL || 'priyam.jyotsna@gmail.com';
        const apiKey = req.session.user?.ncbiApiKey || process.env.NCBI_API_KEY || '1decf6e14b4b7c967a54ce2bfe3368b00009';

        // Try both endpoints concurrently for better reliability
        try {
            // First approach: Use the sviewer endpoint
            const sviewerPromise = axios.get(
                `https://www.ncbi.nlm.nih.gov/sviewer/viewer.cgi?id=${id}&db=nuccore&report=fasta&retmode=text`, 
                { timeout: 15000 }
            ).catch(e => null); // Catch error but don't throw
            
            // Second approach: Use the efetch endpoint with API key
            const efetchPromise = axios.get(
                `${baseUrl}/efetch.fcgi?db=nucleotide&id=${id}&rettype=fasta&retmode=text&tool=nucleotide-downloader&email=${email}&api_key=${apiKey}`, 
                { timeout: 15000 }
            ).catch(e => null); // Catch error but don't throw
            
            // Wait for either to complete
            const results = await Promise.allSettled([sviewerPromise, efetchPromise]);
            const successfulResponse = results.find(r => r.status === 'fulfilled' && r.value)?.value;
            
            if (!successfulResponse) {
                throw new Error(`Failed to fetch sequence for ${id}`);
            }
            
            // Parse FASTA format
            const fastaData = successfulResponse.data;
            const sequence = fastaData
                .split('\n')
                .slice(1)
                .join('')
                .replace(/\s/g, '');
            
            res.json({ success: true, data: { id, sequence } });
        } catch (error) {
            // Fallback to the original approach if concurrent approach fails
            // First fetch the GI number using esearch
            const searchResponse = await axios.get(
                `${baseUrl}/esearch.fcgi?db=nucleotide&term=${id}[accn]&tool=nucleotide-downloader&email=${email}&api_key=${apiKey}&retmode=json`
            );

            if (!searchResponse.data.esearchresult.idlist[0]) {
                throw new Error(`No sequence found for ${id}`);
            }

            // Then fetch the sequence using efetch
            const fetchResponse = await axios.get(
                `${baseUrl}/efetch.fcgi?db=nucleotide&id=${searchResponse.data.esearchresult.idlist[0]}&rettype=fasta&retmode=text&tool=nucleotide-downloader&email=${email}&api_key=${apiKey}`
            );

            // Parse FASTA format
            const sequence = fetchResponse.data
                .split('\n')
                .slice(1)
                .join('')
                .replace(/\s/g, '');

            res.json({ success: true, data: { id, sequence } });
        }
    } catch (error) {
        console.error('Error fetching sequence:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Add this route with your other routes
app.get('/sequence-indexer', requireAuth, (req, res) => {
    res.render('sequence-indexer');
});

// Update the sequence fetch API endpoint
app.get('/api/sequence/fetch', async (req, res) => {
    try {
        const { id } = req.query;
        const baseUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
        
        // Use user's NCBI credentials if available in session
        const email = req.session.user?.ncbiEmail || process.env.NCBI_EMAIL || 'your.email@example.com';
        const apiKey = req.session.user?.ncbiApiKey || process.env.NCBI_API_KEY;

        // First get the sequence info
        const searchResponse = await axios.get(
            `${baseUrl}/esearch.fcgi?db=nucleotide&term=${id}[accn]&tool=sequence-fetch&email=${email}${apiKey ? `&api_key=${apiKey}` : ''}&retmode=json`
        );

        if (!searchResponse.data.esearchresult.idlist[0]) {
            throw new Error(`No sequence found for ${id}`);
        }

        // Fetch the complete sequence data in GenBank format
        const fetchResponse = await axios.get(
            `${baseUrl}/efetch.fcgi?db=nucleotide&id=${searchResponse.data.esearchresult.idlist[0]}&rettype=gb&retmode=text&tool=sequence-fetch&email=${email}${apiKey ? `&api_key=${apiKey}` : ''}`
        );

        // Parse GenBank format
        const gbData = fetchResponse.data;
        const sequence = gbData.match(/ORIGIN\s*([\s\S]+?)\/\//)?.[1].replace(/\s|\d/g, '') || '';
        const organism = gbData.match(/\s+ORGANISM\s+(.*)/)?.[1] || '';
        // Updated molecule type extraction
        const moltype = gbData.match(/\s+MOLECULE TYPE\s+(.*?)[\r\n]/)?.[1] || 
                       gbData.match(/\s+mol_type="([^"]+)"/)?.[1] || 
                       'DNA'; // Default to DNA if not found
        const updateDate = gbData.match(/LOCUS.*\s(\d{2}-[A-Z]{3}-\d{4})/)?.[1] || '';

        res.json({
            success: true,
            data: {
                sequence,
                organism,
                moltype,
                update_date: updateDate,
                length: sequence.length
            }
        });
    } catch (error) {
        console.error('Error fetching sequence:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Add the variant analysis routes
app.get('/variant-analysis', requireAuth, (req, res) => {
    res.render('variant-analysis');
});

// Update the variant analysis endpoint
app.post('/api/analyze-variants', upload.single('variantFile'), async (req, res) => {
    try {
        if (!req.file) {
            throw new Error('No file uploaded');
        }

        const results = [];
        
        // Read file content
        const fileContent = fs.readFileSync(req.file.path, 'utf-8');
        
        // Process the TSV content
        const records = fileContent.split('\n')
            .slice(1) // Skip header
            .filter(line => line.trim()) // Remove empty lines
            .map(line => {
                const [
                    variantId, location, variantType, gene, 
                    molecularConsequences, clinicalSignificance, 
                    g1000Maf, goEspMaf, exacMaf, publications
                ] = line.split('\t');
                
                return {
                    id: variantId,
                    location,
                    type: variantType,
                    gene,
                    clinical_significance: clinicalSignificance,
                    population_maf: g1000Maf || exacMaf || goEspMaf || 'N/A',
                    protein_impact: molecularConsequences,
                    publications: publications ? publications.split(',').map(p => p.trim()) : []
                };
            });

        // Process in batches
        const batchSize = parseInt(req.body.batchSize) || 25;
        for (let i = 0; i < records.length; i += batchSize) {
            const batch = records.slice(i, i + batchSize);
            
            // Process batch
            const batchResults = await Promise.all(
                batch.map(async (record) => {
                    try {
                        // Optional: Query Ensembl API for additional details
                        /*
                        const response = await axios.get(
                            `https://rest.ensembl.org/variation/human/${record.id}`,
                            { 
                                headers: { 'Content-Type': 'application/json' },
                                timeout: 5000
                            }
                        );
                        */
                        return record;
                    } catch (error) {
                        console.error(`Error processing variant ${record.id}:`, error);
                        return record; // Return basic record if API fails
                    }
                })
            );
            
            results.push(...batchResults);
            
            // Add delay between batches
            if (i + batchSize < records.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        // Clean up uploaded file
        fs.unlinkSync(req.file.path);

        res.json({
            success: true,
            data: results
        });
    } catch (error) {
        console.error('Error processing variants:', error);
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/dna-analysis', requireAuth, (req, res) => {
    res.render('dna-analysis');
});

app.get('/api/fetch-sequence', async (req, res) => {
    try {
        const accession = req.query.accession?.trim();
        if (!accession) {
            return res.status(400).json({ error: 'Accession ID is required' });
        }

        const baseUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
        // Use user's NCBI credentials if available in session
        const email = req.session.user?.ncbiEmail || process.env.NCBI_EMAIL;
        const apiKey = req.session.user?.ncbiApiKey || process.env.NCBI_API_KEY;

        // Fetch sequence using NCBI E-utilities
        const response = await axios.get(
            `${baseUrl}/efetch.fcgi?db=nucleotide&id=${accession}&rettype=fasta&retmode=text&tool=dna-analysis&email=${email}${apiKey ? `&api_key=${apiKey}` : ''}`
        );

        // Parse FASTA format
        const sequence = response.data
            .split('\n')
            .slice(1)
            .join('')
            .replace(/\s/g, '');

        res.json({ sequence });
    } catch (error) {
        console.error('Error fetching sequence:', error);
        res.status(500).json({ error: 'Failed to fetch sequence' });
    }
});

// Update the sequence file upload endpoint
app.post('/api/analyze-uploaded-sequence', upload.single('sequenceFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const fileContent = req.file.buffer.toString('utf-8');
        let sequence;

        // Check if it's FASTA format
        if (fileContent.startsWith('>')) {
            sequence = fileContent
                .split('\n')
                .slice(1) // Skip header
                .join('')
                .replace(/\s/g, '');
        } else {
            // Assume plain text
            sequence = fileContent.replace(/\s/g, '');
        }

        res.json({ sequence });
    } catch (error) {
        console.error('Error processing uploaded sequence:', error);
        res.status(500).json({ error: 'Failed to process sequence file' });
    }
});

// Enhanced error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).json({
        error: process.env.NODE_ENV === 'development' ? err.message : 'Internal Server Error'
    });
});

// Add a session debug endpoint (remove in production)
app.get('/api/debug/session', (req, res) => {
    res.json({
        hasSession: !!req.session,
        user: req.session.user || null,
        sessionID: req.sessionID
    });
});

// Add a catch-all route for debugging
app.use('*', (req, res) => {
    res.status(404).send({
        error: 'Not Found',
        path: req.originalUrl,
        method: req.method,
        timestamp: new Date().toISOString()
    });
});

// Only start the server if we're not being imported by Firebase Functions
if (!module.parent) {
    const PORT = process.env.PORT || 3007;
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    }).on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
            console.error(`Port ${PORT} is already in use`);
            process.exit(1);
        } else {
            console.error('Server startup error:', error);
            process.exit(1);
        }
    });
}

module.exports = app;
