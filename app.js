// Load environment variables
require('dotenv').config();

const express = require('express');
const path = require('path');
const axios = require('axios');
const compression = require('compression');
const fileUpload = require('express-fileupload');
const sequenceIndexerRouter = require('./routes/sequence-indexer');
const sequenceFetchRouter = require('./routes/sequence-fetch');

// Create Express app
const app = express();

// Basic middleware setup
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());
app.use(express.static(path.join(__dirname, 'public')));

// View engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Configure routes
app.use('/api', require('./routes/api'));
app.use('/api/nucleotide', require('./routes/nucleotide'));
app.use('/sequence-comparison/api', require('./routes/pdf-generator'));
app.use('/sequence-comparison', require('./routes/sequence-comparison'));
app.use('/dna-analysis', require('./routes/dna-analysis'));
app.use('/sequence-indexer', sequenceIndexerRouter);
app.use('/sequence-fetch', sequenceFetchRouter);
app.use('/blast-wrapper', require('./routes/blast-wrapper'));

// Root route
app.get('/', (req, res) => {
    res.render('index');
});

// Nucleotide download route
app.get('/nucleotide-download', (req, res) => {
    res.render('nucleotide-download');
});

// Variant analysis route
app.get('/variant-analysis', (req, res) => {
    res.render('variant-analysis');
});

// API route for nucleotide sequence download
app.get('/api/nucleotide/sequence', async (req, res) => {
    try {
        const { id } = req.query;
        if (!id) {
            return res.status(400).json({ error: 'Accession ID is required' });
        }

        const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=nucleotide&id=${id}&rettype=fasta&retmode=text`;
        
        // Simple retry mechanism
        let attempts = 0;
        const maxAttempts = 3;
        
        while (attempts < maxAttempts) {
            try {
                const response = await axios.get(url, {
                    timeout: 10000,  // 10 second timeout
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (compatible; nucleotide-downloader/1.0)',
                        'Accept': 'text/plain, */*'
                    }
                });
                
                if (response.data) {
                    const lines = response.data.split('\n');
                    const header = lines[0];
                    const sequence = lines.slice(1).join('').replace(/\s/g, '');
                    
                    return res.json({ 
                        success: true, 
                        data: { id, sequence, header } 
                    });
                }
                
                throw new Error('Empty response');
            } catch (err) {
                attempts++;
                if (attempts === maxAttempts) throw err;
                await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay between retries
            }
        }
    } catch (error) {
        console.error(`Failed to fetch ${req.query.id}:`, error.message);
        res.status(500).json({ error: 'Failed to fetch sequence. Please try again.' });
    }
});

// Design primers route
app.get('/design-primers', (req, res) => {
    res.render('design-primers');
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).send('Internal Server Error');
});

// Start server
const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// Make sure this appears at the end of app.js
module.exports = app;
