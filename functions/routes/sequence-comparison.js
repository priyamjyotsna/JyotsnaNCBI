const express = require('express');
const router = express.Router();
const axios = require('axios');
const https = require('https');

// Create an optimized axios instance for all requests
const axiosInstance = axios.create({
    timeout: 5000, // Further reduced timeout for faster response
    httpsAgent: new https.Agent({ 
        keepAlive: true,
        rejectUnauthorized: false // Allow self-signed certificates
    }),
    headers: {
        'Accept': 'text/plain',
        'User-Agent': 'sequence-comparison-tool/1.0'
    },
    maxRedirects: 2 // Limit redirects
});

// Render the sequence comparison tool page
router.get('/', (req, res) => {
    res.render('sequence-comparison');
});

// API endpoint to fetch sequence from NCBI
router.get('/api/fetch-sequence', async (req, res) => {
    const accessionId = req.query.id;
    
    if (!accessionId) {
        return res.status(400).json({ error: 'Accession ID is required' });
    }
    
    try {
        console.log(`Fetching sequence for ID: ${accessionId}`);
        
        // Try EBI first (fastest method based on your logs)
        try {
            console.log(`Fetching from EBI for ${accessionId}`);
            const result = await fetchFromEBI(accessionId);
            return res.json(result);
        } catch (ebiError) {
            console.log(`EBI fetch failed: ${ebiError.message}, trying NCBI...`);
        }
        
        // Fall back to NCBI direct fetch if EBI fails
        try {
            const result = await fetchFromNCBI(accessionId);
            return res.json(result);
        } catch (ncbiError) {
            console.log(`NCBI fetch failed: ${ncbiError.message}`);
            throw new Error(`Could not fetch sequence for ${accessionId}`);
        }
    } catch (error) {
        console.error('Error fetching sequence:', error.message);
        res.status(500).json({ 
            error: 'Failed to fetch sequence',
            details: error.message
        });
    }
});

// Helper function to fetch from EBI (fastest method)
async function fetchFromEBI(accessionId) {
    const ebiResponse = await axiosInstance.get(`https://www.ebi.ac.uk/ena/browser/api/fasta/${accessionId}`);
    
    if (ebiResponse.status === 200 && ebiResponse.data) {
        const result = parseFastaResponse(ebiResponse.data);
        if (result.sequence) {
            console.log(`Successfully fetched sequence from EBI, length: ${result.sequence.length}`);
            return {
                ...result,
                type: determineSequenceType(accessionId, result.sequence),
                source: 'EBI'
            };
        }
    }
    throw new Error('EBI fetch failed or returned invalid data');
}

// Helper function to fetch from NCBI as fallback
async function fetchFromNCBI(accessionId) {
    // Determine if it's likely a protein or nucleotide sequence
    const isProtein = /^[A-Z]P_|^[A-Z]{3}\d+/i.test(accessionId);
    const db = isProtein ? 'protein' : 'nucleotide';
    
    console.log(`Trying NCBI ${db} database for ${accessionId}`);
    
    const NCBI_API_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
    const email = process.env.NCBI_EMAIL || 'your.email@example.com';
    
    // Direct fetch without search step
    const fetchResponse = await axiosInstance.get(`${NCBI_API_BASE}/efetch.fcgi`, {
        params: {
            db: db,
            id: accessionId,
            rettype: 'fasta',
            retmode: 'text',
            tool: 'sequence-comparison-tool',
            email: email
        }
    });
    
    const result = parseFastaResponse(fetchResponse.data);
    if (result.sequence) {
        console.log(`Successfully fetched ${db} sequence from NCBI, length: ${result.sequence.length}`);
        return {
            ...result,
            type: db,
            source: 'NCBI'
        };
    }
    
    throw new Error('NCBI fetch failed or returned invalid data');
}

// Helper function to parse FASTA response
function parseFastaResponse(fastaData) {
    const lines = fastaData.split('\n');
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

// Helper function to determine sequence type from content
function determineSequenceType(accessionId, sequence) {
    // Check accession ID patterns
    if (/^[A-Z]P_|^[A-Z]{3}\d+/i.test(accessionId)) {
        return 'protein';
    }
    
    // Check sequence content
    const nucleotideChars = new Set(['A', 'C', 'G', 'T', 'U', 'N']);
    const proteinChars = new Set(['D', 'E', 'F', 'H', 'I', 'K', 'L', 'M', 'P', 'Q', 'R', 'S', 'V', 'W', 'Y']);
    
    let nucleotideCount = 0;
    let proteinCount = 0;
    
    // Sample the first 100 characters
    const sampleLength = Math.min(100, sequence.length);
    for (let i = 0; i < sampleLength; i++) {
        const char = sequence[i].toUpperCase();
        if (nucleotideChars.has(char)) nucleotideCount++;
        if (proteinChars.has(char)) proteinCount++;
    }
    
    return proteinCount > nucleotideCount ? 'protein' : 'nucleotide';
}

// New endpoint for sequence alignment and mutation detection
router.post('/api/compare-sequences', async (req, res) => {
    const { referenceSequence, querySequence } = req.body;
    
    if (!referenceSequence || !querySequence) {
        return res.status(400).json({ error: 'Both reference and query sequences are required' });
    }
    
    try {
        console.log('Performing sequence alignment and mutation detection');
        
        // Perform local alignment to identify mutations
        const alignmentResult = performLocalAlignment(referenceSequence, querySequence);
        
        // Find mutations between the aligned sequences
        const mutations = findMutations(
            alignmentResult.alignedReference, 
            alignmentResult.alignedQuery
        );
        
        // Calculate mutation distribution statistics
        const distributionStats = calculateMutationDistribution(mutations, referenceSequence.length);
        
        return res.json({
            alignment: alignmentResult,
            mutations: mutations,
            distributionStats: distributionStats,
            referenceLength: referenceSequence.length,
            queryLength: querySequence.length
        });
    } catch (error) {
        console.error('Error comparing sequences:', error.message);
        res.status(500).json({ 
            error: 'Failed to compare sequences',
            details: error.message
        });
    }
});

// Helper function to perform local sequence alignment
function performLocalAlignment(reference, query) {
    // Simple implementation of Smith-Waterman algorithm for local alignment
    // For production use, consider using a more optimized library
    
    // Initialize scoring parameters
    const MATCH_SCORE = 2;
    const MISMATCH_PENALTY = -1;
    const GAP_PENALTY = -2;
    
    // Initialize the scoring matrix
    const scoreMatrix = Array(query.length + 1).fill().map(() => Array(reference.length + 1).fill(0));
    // Initialize the traceback matrix
    const tracebackMatrix = Array(query.length + 1).fill().map(() => Array(reference.length + 1).fill(''));
    
    // Fill the matrices
    let maxScore = 0;
    let maxI = 0;
    let maxJ = 0;
    
    for (let i = 1; i <= query.length; i++) {
        for (let j = 1; j <= reference.length; j++) {
            // Calculate match/mismatch score
            const match = scoreMatrix[i-1][j-1] + (query[i-1] === reference[j-1] ? MATCH_SCORE : MISMATCH_PENALTY);
            // Calculate deletion score
            const deletion = scoreMatrix[i-1][j] + GAP_PENALTY;
            // Calculate insertion score
            const insertion = scoreMatrix[i][j-1] + GAP_PENALTY;
            
            // Find the maximum score
            scoreMatrix[i][j] = Math.max(0, match, deletion, insertion);
            
            // Update traceback matrix
            if (scoreMatrix[i][j] === 0) {
                tracebackMatrix[i][j] = 'end';
            } else if (scoreMatrix[i][j] === match) {
                tracebackMatrix[i][j] = 'diag';
            } else if (scoreMatrix[i][j] === deletion) {
                tracebackMatrix[i][j] = 'up';
            } else {
                tracebackMatrix[i][j] = 'left';
            }
            
            // Keep track of the maximum score
            if (scoreMatrix[i][j] > maxScore) {
                maxScore = scoreMatrix[i][j];
                maxI = i;
                maxJ = j;
            }
        }
    }
    
    // Traceback to find the aligned sequences
    let alignedQuery = '';
    let alignedReference = '';
    let i = maxI;
    let j = maxJ;
    
    while (i > 0 && j > 0 && tracebackMatrix[i][j] !== 'end') {
        if (tracebackMatrix[i][j] === 'diag') {
            alignedQuery = query[i-1] + alignedQuery;
            alignedReference = reference[j-1] + alignedReference;
            i--;
            j--;
        } else if (tracebackMatrix[i][j] === 'up') {
            alignedQuery = query[i-1] + alignedQuery;
            alignedReference = '-' + alignedReference;
            i--;
        } else { // left
            alignedQuery = '-' + alignedQuery;
            alignedReference = reference[j-1] + alignedReference;
            j--;
        }
    }
    
    return {
        alignedReference,
        alignedQuery,
        score: maxScore,
        identities: countIdentities(alignedReference, alignedQuery),
        alignmentStart: {
            reference: j,
            query: i
        },
        alignmentEnd: {
            reference: maxJ,
            query: maxI
        }
    };
}

// Helper function to count identities in aligned sequences
function countIdentities(seq1, seq2) {
    let count = 0;
    for (let i = 0; i < seq1.length; i++) {
        if (seq1[i] === seq2[i] && seq1[i] !== '-') {
            count++;
        }
    }
    return count;
}

// Helper function to find mutations between aligned sequences
function findMutations(alignedReference, alignedQuery) {
    const mutations = [];
    let refPos = 0;
    let queryPos = 0;
    
    for (let i = 0; i < alignedReference.length; i++) {
        const refChar = alignedReference[i];
        const queryChar = alignedQuery[i];
        
        if (refChar !== '-') refPos++;
        if (queryChar !== '-') queryPos++;
        
        // Skip if they're the same
        if (refChar === queryChar) continue;
        
        // Determine mutation type
        let type = '';
        if (refChar === '-') {
            type = 'insertion';
        } else if (queryChar === '-') {
            type = 'deletion';
        } else {
            type = 'substitution';
        }
        
        mutations.push({
            type,
            position: refPos,
            referenceBase: refChar,
            queryBase: queryChar,
            referencePosition: refPos,
            queryPosition: queryPos
        });
    }
    
    return mutations;
}

// Helper function to calculate mutation distribution statistics
function calculateMutationDistribution(mutations, sequenceLength) {
    // Create bins for distribution (10 bins)
    const binCount = 10;
    const binSize = Math.ceil(sequenceLength / binCount);
    const distribution = Array(binCount).fill(0);
    
    // Count mutations in each bin
    mutations.forEach(mutation => {
        if (mutation.position > 0) {
            const binIndex = Math.floor((mutation.position - 1) / binSize);
            if (binIndex < binCount) {
                distribution[binIndex]++;
            }
        }
    });
    
    // Calculate mutation types
    const mutationTypes = {
        substitution: 0,
        insertion: 0,
        deletion: 0
    };
    
    mutations.forEach(mutation => {
        if (mutation.type in mutationTypes) {
            mutationTypes[mutation.type]++;
        }
    });
    
    return {
        distribution,
        binSize,
        mutationTypes,
        totalMutations: mutations.length
    };
}

module.exports = router;