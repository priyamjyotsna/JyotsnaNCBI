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
        const { id, startId, endId, previewLength } = req.query;
        
        if (!id && !(startId && endId)) {
            return res.status(400).json({ 
                success: false,
                error: 'Either accession ID or start/end IDs are required',
                code: 'MISSING_PARAMETERS'
            });
        }

        // NCBI API endpoints
        const baseUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
        const db = 'nucleotide';
        const email = process.env.NCBI_EMAIL || 'your.email@example.com';
        const apiKey = process.env.NCBI_API_KEY;

        if (id) {
            try {
                const formattedId = formatAccessionId(id);
                const result = await fetchSingleSequence(formattedId, baseUrl, db, email, apiKey);
                return res.json(result);
            } catch (error) {
                // Send a user-friendly error without sensitive details
                return res.status(error.code === 'SEQUENCE_NOT_FOUND' ? 404 : 500).json({
                    success: false,
                    error: error.userMessage || 'Failed to fetch sequence data',
                    code: error.code
                });
            }
        } else {
            // Range fetch
            try {
                const formattedStartId = formatAccessionId(startId);
                const formattedEndId = formatAccessionId(endId);
                
                // Extract numeric parts to generate range
                const startMatch = formattedStartId.match(/^([A-Za-z]+)_(\d+)$/);
                const endMatch = formattedEndId.match(/^([A-Za-z]+)_(\d+)$/);
                
                if (!startMatch || !endMatch || startMatch[1] !== endMatch[1]) {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid range: Start and end IDs must have the same prefix'
                    });
                }

                const prefix = startMatch[1];
                const startNum = parseInt(startMatch[2]);
                const endNum = parseInt(endMatch[2]);
                
                if (startNum > endNum) {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid range: Start ID must be less than or equal to end ID'
                    });
                }

                const sequences = [];
                for (let i = startNum; i <= endNum; i++) {
                    const currentId = `${prefix}_${i.toString().padStart(6, '0')}`;
                    try {
                        const result = await fetchSingleSequence(currentId, baseUrl, db, email, apiKey);
                        if (result.success) {
                            if (previewLength) {
                                result.data.sequence = result.data.sequence.substring(0, parseInt(previewLength));
                            }
                            sequences.push(result.data);
                        }
                    } catch (error) {
                        // Only log the ID and error code, not detailed stack traces
                        console.error(`Error fetching ${currentId}: ${error.code || 'UNKNOWN_ERROR'}`);
                    }
                }

                return res.json({
                    success: true,
                    data: sequences
                });
            } catch (error) {
                return res.status(500).json({
                    success: false,
                    error: 'Failed to fetch sequence range',
                    code: error.code || 'RANGE_ERROR'
                });
            }
        }
    } catch (error) {
        // Log only minimal error information for server-side debugging
        console.error('Sequence fetch error:', error.message);
        res.status(500).json({ 
            success: false,
            error: 'Server error processing sequence request'
        });
    }
});

async function fetchSingleSequence(formattedId, baseUrl, db, email, apiKey) {
    try {
        // Verify the sequence exists
        const searchUrl = `${baseUrl}/esearch.fcgi?db=${db}&term=${formattedId}[accn]&retmode=json&tool=sequence-fetch&email=${email}`;
        if (apiKey) {
            searchUrl += `&api_key=${apiKey}`;
        }
        
        const searchResponse = await axios.get(searchUrl);

        if (!searchResponse.data?.esearchresult?.idlist?.[0]) {
            const error = new Error(`No sequence found for accession ID: ${formattedId}`);
            error.code = 'SEQUENCE_NOT_FOUND';
            error.userMessage = `Sequence not found: ${formattedId}`;
            throw error;
        }

        const ncbiId = searchResponse.data.esearchresult.idlist[0];

        // Fetch the sequence data
        const efetchUrl = `${baseUrl}/efetch.fcgi?db=${db}&id=${ncbiId}&rettype=fasta&retmode=text&tool=sequence-fetch&email=${email}`;
        if (apiKey) {
            efetchUrl += `&api_key=${apiKey}`;
        }
        
        const response = await axios.get(efetchUrl, {
            timeout: 60000, // Increased timeout to 60 seconds
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; sequence-fetcher/1.0)',
                'Accept': 'text/plain, */*'
            }
        });

        if (!response.data) {
            const error = new Error('No sequence data received from NCBI');
            error.code = 'NO_SEQUENCE_DATA';
            error.userMessage = 'Unable to retrieve sequence data from NCBI';
            throw error;
        }

        // Process the FASTA data
        const lines = response.data.split('\n');
        if (lines.length < 2) {
            const error = new Error('Invalid FASTA format received');
            error.code = 'INVALID_FASTA';
            error.userMessage = 'Invalid sequence format received';
            throw error;
        }

        const header = lines[0];
        const sequence = lines.slice(1).join('').replace(/\s/g, '');

        if (!sequence) {
            const error = new Error('Empty sequence received');
            error.code = 'EMPTY_SEQUENCE';
            error.userMessage = 'Empty sequence received from NCBI';
            throw error;
        }

        // Get additional metadata
        const esummaryUrl = `${baseUrl}/esummary.fcgi?db=${db}&id=${ncbiId}&retmode=json&tool=sequence-fetch&email=${email}`;
        if (apiKey) {
            esummaryUrl += `&api_key=${apiKey}`;
        }
        
        const metadataResponse = await axios.get(esummaryUrl);
        
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
        // Log a minimal version of the error without sensitive information
        console.error(`Error fetching sequence ${formattedId}: ${error.message}`);

        // Add user-friendly message to the error
        const enhancedError = new Error(error.userMessage || `Failed to fetch sequence ${formattedId}`);
        enhancedError.code = error.code || 'FETCH_ERROR';
        enhancedError.userMessage = error.userMessage || 'Could not retrieve sequence data';
        throw enhancedError;
    }
}

function formatAccessionId(id) {
    // Handle both formats: "NC852" and "NC_000852"
    const match = id.match(/^([A-Za-z]+)(?:_)?(\d+)$/);
    if (!match) {
        const error = new Error(`Invalid accession ID format: ${id}`);
        error.code = 'INVALID_ID_FORMAT';
        error.userMessage = `Invalid accession ID format: ${id}`;
        throw error;
    }
    
    const [_, prefix, number] = match;
    // Ensure the prefix is uppercase
    return `${prefix.toUpperCase()}_${number.padStart(6, '0')}`;
}

module.exports = router; 