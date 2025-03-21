const express = require('express');
const router = express.Router();
const axios = require('axios');

// Add the main page route
router.get('/', (req, res) => {
    res.render('sequence-fetch');
});

// Add API route for fetching sequences
router.get('/api/fetch', async (req, res) => {
    try {
        const { id } = req.query;
        console.log('Received request for ID:', id);

        // NCBI API endpoints
        const baseUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
        const db = 'nucleotide';
        const email = process.env.NCBI_EMAIL || 'your.email@example.com';
        const apiKey = process.env.NCBI_API_KEY;

        // Log the configuration
        console.log('Using config:', {
            baseUrl,
            db,
            email: email ? 'Set' : 'Not set',
            apiKey: apiKey ? 'Set' : 'Not set'
        });

        try {
            const searchUrl = `${baseUrl}/esearch.fcgi?db=${db}&term=${id}[accn]&retmode=json`;
            console.log('Making search request to:', searchUrl);
            
            const searchResponse = await axios.get(searchUrl);
            console.log('Search response:', searchResponse.data);

            if (!searchResponse.data?.esearchresult?.idlist?.[0]) {
                return res.status(404).json({
                    success: false,
                    error: `No sequence found for accession ID: ${id}`
                });
            }

            const ncbiId = searchResponse.data.esearchresult.idlist[0];
            console.log('Found NCBI ID:', ncbiId);

            // Add API key if available
            const apiKeyParam = apiKey ? `&api_key=${apiKey}` : '';
            const efetchUrl = `${baseUrl}/efetch.fcgi?db=${db}&id=${ncbiId}&rettype=fasta&retmode=text${apiKeyParam}`;
            console.log('Making fetch request to:', efetchUrl);

            const response = await axios.get(efetchUrl);
            // Log response status and headers
            console.log('Fetch response status:', response.status);
            console.log('Fetch response headers:', response.headers);

            // Process the FASTA data
            const lines = response.data.split('\n');
            if (lines.length < 2) {
                const error = new Error('Invalid FASTA format received');
                error.code = 'INVALID_FASTA';
                throw error;
            }

            const header = lines[0];
            const sequence = lines.slice(1).join('').replace(/\s/g, '');

            if (!sequence) {
                const error = new Error('Empty sequence received');
                error.code = 'EMPTY_SEQUENCE';
                throw error;
            }

            // Get additional metadata
            const esummaryUrl = `${baseUrl}/esummary.fcgi?db=${db}&id=${ncbiId}&retmode=json&tool=sequence-fetch&email=${email}`;
            console.log(`Making esummary request to: ${esummaryUrl}`);
            
            const metadataResponse = await axios.get(esummaryUrl);
            console.log('esummary response:', JSON.stringify(metadataResponse.data, null, 2));
            
            const data = {
                success: true,
                data: {
                    accessionId: id,
                    ncbiId: ncbiId,
                    sequence: sequence,
                    header: header,
                    organism: '',
                    length: sequence.length,
                    moltype: '',
                    update_date: ''
                }
            };

            if (metadataResponse.data?.result?.[ncbiId]) {
                const metadata = metadataResponse.data.result[ncbiId];
                data.data.organism = metadata.organism || '';
                data.data.moltype = metadata.moltype || '';
                data.data.update_date = metadata.updatedate || '';
            }

            return res.json(data);
        } catch (error) {
            console.error('Detailed error:', {
                message: error.message,
                stack: error.stack,
                response: error.response?.data,
                status: error.response?.status
            });
            
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch sequence data',
                details: error.message,
                status: error.response?.status
            });
        }

    } catch (outer_error) {
        console.error('Outer error:', outer_error);
        res.status(500).json({ 
            success: false,
            error: 'Server error',
            details: outer_error.message
        });
    }
});

async function fetchSingleSequence(formattedId, baseUrl, db, email) {
    try {
        console.log(`Attempting to fetch sequence for ID: ${formattedId}`);
        
        // Verify the sequence exists
        const searchUrl = `${baseUrl}/esearch.fcgi?db=${db}&term=${formattedId}[accn]&retmode=json&tool=sequence-fetch&email=${email}`;
        console.log(`Making esearch request to: ${searchUrl}`);
        
        const searchResponse = await axios.get(searchUrl);
        console.log('esearch response:', JSON.stringify(searchResponse.data, null, 2));

        if (!searchResponse.data?.esearchresult?.idlist?.[0]) {
            const error = new Error(`No sequence found for accession ID: ${formattedId}`);
            error.code = 'SEQUENCE_NOT_FOUND';
            throw error;
        }

        const ncbiId = searchResponse.data.esearchresult.idlist[0];
        console.log(`Found NCBI ID: ${ncbiId} for accession: ${formattedId}`);

        // Fetch the sequence data
        const efetchUrl = `${baseUrl}/efetch.fcgi?db=${db}&id=${ncbiId}&rettype=fasta&retmode=text&tool=sequence-fetch&email=${email}`;
        console.log(`Making efetch request to: ${efetchUrl}`);
        
        const response = await axios.get(efetchUrl, {
            timeout: 30000, // Increased timeout to 30 seconds
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; sequence-fetcher/1.0)',
                'Accept': 'text/plain, */*'
            }
        });

        if (!response.data) {
            const error = new Error('No sequence data received from NCBI');
            error.code = 'NO_SEQUENCE_DATA';
            throw error;
        }

        // Process the FASTA data
        const lines = response.data.split('\n');
        if (lines.length < 2) {
            const error = new Error('Invalid FASTA format received');
            error.code = 'INVALID_FASTA';
            throw error;
        }

        const header = lines[0];
        const sequence = lines.slice(1).join('').replace(/\s/g, '');

        if (!sequence) {
            const error = new Error('Empty sequence received');
            error.code = 'EMPTY_SEQUENCE';
            throw error;
        }

        // Get additional metadata
        const esummaryUrl = `${baseUrl}/esummary.fcgi?db=${db}&id=${ncbiId}&retmode=json&tool=sequence-fetch&email=${email}`;
        console.log(`Making esummary request to: ${esummaryUrl}`);
        
        const metadataResponse = await axios.get(esummaryUrl);
        console.log('esummary response:', JSON.stringify(metadataResponse.data, null, 2));
        
        const data = {
            success: true,
            data: {
                accessionId: formattedId,
                ncbiId: ncbiId,
                sequence: sequence,
                header: header,
                organism: '',
                length: sequence.length,
                moltype: '',
                update_date: ''
            }
        };

        if (metadataResponse.data?.result?.[ncbiId]) {
            const metadata = metadataResponse.data.result[ncbiId];
            data.data.organism = metadata.organism || '';
            data.data.moltype = metadata.moltype || '';
            data.data.update_date = metadata.updatedate || '';
        }

        return data;
    } catch (error) {
        console.error('Detailed error in fetchSingleSequence:', {
            id: formattedId,
            message: error.message,
            code: error.code,
            response: error.response?.data,
            status: error.response?.status
        });

        // Add more context to the error
        const enhancedError = new Error(`Failed to fetch sequence ${formattedId}: ${error.message}`);
        enhancedError.originalError = error;
        enhancedError.code = error.code || 'FETCH_ERROR';
        throw enhancedError;
    }
}

function formatAccessionId(id) {
    // Remove any existing underscores first
    id = id.replace(/_/g, '');
    
    // Only add underscore for certain prefix patterns (like NC, NG, etc)
    const needsUnderscore = /^(NC|NG|NT|NW|NZ|NM|XM|XR|NR|NP|XP|AP|WP)\d+$/i;
    if (needsUnderscore.test(id)) {
    const match = id.match(/^([A-Za-z]+)(\d+)$/);
    if (match) {
        const [_, prefix, number] = match;
            return `${prefix.toUpperCase()}_${number.padStart(6, '0')}`;
        }
    }
    
    // For other accession patterns (like MN223750), just return uppercase without underscore
    return id.toUpperCase();
}

module.exports = router; 