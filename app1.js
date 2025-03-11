const express = require('express');
const path = require('path');
const axios = require('axios');
require('dotenv').config(); // Add environment variable support

const app = express();

// View engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Enhanced middleware setup
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
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
        const baseUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
        const apiKey = process.env.PUBMED_API_KEY || '';
        
        const searchUrl = `${baseUrl}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmode=json${apiKey ? `&api_key=${apiKey}` : ''}`;
        const searchResponse = await axios.get(searchUrl);
        res.json(searchResponse.data);
    } catch (error) {
        console.error('PubMed search error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/', (req, res) => {
    res.render('index');
});

app.get('/pubmed-search', (req, res) => {
    res.render('pubmed-search');
});

app.get('/nucleotide-download', (req, res) => {
    res.render('nucleotide-download');
});

// API routes for nucleotide download
app.get('/api/nucleotide/sequence', async (req, res) => {
    try {
        const { id } = req.query;
        const baseUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
        const email = process.env.NCBI_EMAIL || 'your-email@example.com'; // Replace with your email

        // First fetch the GI number using esearch
        const searchResponse = await axios.get(
            `${baseUrl}/esearch.fcgi?db=nucleotide&term=${id}[accn]&tool=nucleotide-downloader&email=${email}&retmode=json`
        );

        if (!searchResponse.data.esearchresult.idlist[0]) {
            throw new Error(`No sequence found for ${id}`);
        }

        // Then fetch the sequence using efetch
        const fetchResponse = await axios.get(
            `${baseUrl}/efetch.fcgi?db=nucleotide&id=${searchResponse.data.esearchresult.idlist[0]}&rettype=fasta&retmode=text&tool=nucleotide-downloader&email=${email}`
        );

        // Parse FASTA format
        const sequence = fetchResponse.data
            .split('\n')
            .slice(1)
            .join('')
            .replace(/\s/g, '');

        res.json({ success: true, data: { id, sequence } });
    } catch (error) {
        console.error('Error fetching sequence:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Add this with your other routes
app.get('/sequence-fetch', (req, res) => {
    res.render('sequence-fetch');
});

// Add this API endpoint
// Update the sequence fetch API endpoint
app.get('/api/sequence/fetch', async (req, res) => {
    try {
        const { id } = req.query;
        const baseUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
        const email = process.env.NCBI_EMAIL || 'your.email@example.com';

        // First get the sequence info
        const searchResponse = await axios.get(
            `${baseUrl}/esearch.fcgi?db=nucleotide&term=${id}[accn]&tool=sequence-fetch&email=${email}&retmode=json`
        );

        if (!searchResponse.data.esearchresult.idlist[0]) {
            throw new Error(`No sequence found for ${id}`);
        }

        // Fetch the complete sequence data in GenBank format
        const fetchResponse = await axios.get(
            `${baseUrl}/efetch.fcgi?db=nucleotide&id=${searchResponse.data.esearchresult.idlist[0]}&rettype=gb&retmode=text&tool=sequence-fetch&email=${email}`
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

// Add multer for file uploads
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const fs = require('fs');
const csv = require('csv-parse');

// Add the variant analysis routes
app.get('/variant-analysis', (req, res) => {
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

// Enhanced error handling
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).json({
        error: process.env.NODE_ENV === 'development' ? err.message : 'Internal Server Error'
    });
});

// Improved server startup
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.log(`Port ${PORT} is busy, trying ${PORT + 1}`);
        server.listen(PORT + 1);
    } else {
        console.error('Server error:', err);
    }
});

// Add this with your other routes
app.get('/design-primers', (req, res) => {
    res.render('design-primers');
});

// Add this with your other routes
app.get('/gene-map', (req, res) => {
    res.render('gene-map');
});

module.exports = app;