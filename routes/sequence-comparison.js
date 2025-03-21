const express = require('express');
const router = express.Router();
const axios = require('axios');
const https = require('https');
const PDFDocument = require('pdfkit');

// Create an optimized axios instance for all requests
const axiosInstance = axios.create({
    timeout: 30000, // Increased timeout to 30 seconds
    httpsAgent: new https.Agent({ 
        keepAlive: true
    }),
    headers: {
        'Accept': 'text/plain, application/json, */*',
        'User-Agent': 'sequence-comparison-tool/1.0'
    }
});

// Render the sequence comparison page
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
        
        // Try NCBI first
        try {
            console.log(`Fetching from NCBI for ${accessionId}`);
            const result = await fetchFromNCBI(accessionId);
            return res.json({
                success: true,
                ...result
            });
        } catch (ncbiError) {
            console.log(`NCBI fetch failed: ${ncbiError.message}, trying EBI...`);
            
            // Fall back to EBI if NCBI fails
            try {
                const result = await fetchFromEBI(accessionId);
                return res.json({
                    success: true,
                    ...result
                });
            } catch (ebiError) {
                console.log(`EBI fetch failed: ${ebiError.message}`);
                throw new Error(`Could not fetch sequence for ${accessionId}`);
            }
        }
    } catch (error) {
        console.error('Error fetching sequence:', error.message);
        res.status(500).json({ 
            success: false,
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

// Helper function to fetch from NCBI
async function fetchFromNCBI(accessionId) {
    const NCBI_API_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
    const email = process.env.NCBI_EMAIL || 'your.email@example.com';
    
    // First verify the sequence exists
    const searchResponse = await axiosInstance.get(`${NCBI_API_BASE}/esearch.fcgi`, {
        params: {
            db: 'nucleotide',
            term: `${accessionId}[accn]`,
            retmode: 'json',
            tool: 'sequence-comparison-tool',
            email: email
        }
    });

    const searchData = searchResponse.data;
    if (!searchData.esearchresult || !searchData.esearchresult.count || parseInt(searchData.esearchresult.count) === 0) {
        throw new Error(`Sequence ${accessionId} not found in NCBI`);
    }

    // Then fetch the sequence
    const fetchResponse = await axiosInstance.get(`${NCBI_API_BASE}/efetch.fcgi`, {
        params: {
            db: 'nucleotide',
            id: accessionId,
            rettype: 'fasta',
            retmode: 'text',
            tool: 'sequence-comparison-tool',
            email: email
        }
    });
    
    const result = parseFastaResponse(fetchResponse.data);
    if (!result.sequence) {
        throw new Error('NCBI returned empty sequence');
    }

    return {
        ...result,
        type: 'nucleotide',
        source: 'NCBI'
    };
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
    console.log('Received comparison request');
    
    const { referenceSequence, querySequence } = req.body;
    
    if (!referenceSequence || !querySequence) {
        console.error('Missing sequences:', { ref: !!referenceSequence, query: !!querySequence });
        return res.status(400).json({ 
            error: 'Both reference and query sequences are required',
            success: false
        });
    }
    
    try {
        console.log('Sequences received:', {
            refLength: referenceSequence.length,
            queryLength: querySequence.length
        });
        
        console.log('Performing sequence alignment and mutation detection');
        
        // Perform local alignment to identify mutations
        const alignmentResult = performLocalAlignment(referenceSequence, querySequence);
        console.log('Alignment complete');
        
        // Find mutations between the aligned sequences
        const mutations = findMutations(
            alignmentResult.alignedReference, 
            alignmentResult.alignedQuery
        );
        console.log(`Found ${mutations.length} mutations`);
        
        // Calculate mutation distribution statistics
        const distributionStats = calculateMutationDistribution(mutations, referenceSequence.length);
        console.log('Distribution stats calculated');
        
        const response = {
            success: true,
            alignment: alignmentResult,
            mutations: mutations,
            distributionStats: distributionStats,
            referenceLength: referenceSequence.length,
            queryLength: querySequence.length
        };
        
        console.log('Sending response');
        return res.json(response);
        
    } catch (error) {
        console.error('Error comparing sequences:', error);
        return res.status(500).json({ 
            success: false,
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

// In your route handler where you generate the PDF
router.post('/generate-pdf', async (req, res) => {
    try {
        const doc = new PDFDocument();
        
        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=sequence-comparison-report.pdf');
        
        // Pipe the PDF to the response
        doc.pipe(res);

        // Add title
        doc.fontSize(16)
           .text('Sequence Comparison Report', { align: 'center' });
        doc.moveDown();

        // Add date
        doc.fontSize(10)
           .text(`Generated on: ${new Date().toLocaleString()}`, { align: 'right' });
        doc.moveDown();

        // Add sequence information
        doc.fontSize(12)
           .text('Sequence Information:', { underline: true });
        doc.moveDown();

        // Add comparison results from req.body
        if (req.body.results) {
            doc.text(`Similarity Score: ${req.body.results.similarityScore}%`);
            doc.text(`Differences Found: ${req.body.results.differences}`);
            doc.moveDown();

            // Add sequence details
            doc.text('Sequence Details:', { underline: true });
            doc.moveDown();
            doc.text(`Sequence 1 Length: ${req.body.results.seq1Length}`);
            doc.text(`Sequence 2 Length: ${req.body.results.seq2Length}`);
        }

        // Add citation at bottom of the page
        doc.moveDown(4);  // Add more space before citation

        // Add separator line
        doc.lineWidth(0.5)
           .strokeColor('#999999')
           .moveTo(72, doc.y)
           .lineTo(doc.page.width - 72, doc.y)
           .stroke();

        doc.moveDown();

        // Citation text
        const year = new Date().getFullYear();
        const url = req.protocol + '://' + req.get('host') + '/sequence-comparison';

        doc.fontSize(10)
           .fillColor('#333333')
           .text('Citation:', {
               continued: false,
               align: 'left'
           });

        doc.moveDown(0.5);
        
        // APA style citation
        doc.fontSize(9)
           .fillColor('#666666')
           .text('DNA Analysis Tool. (' + year + '). Sequence Comparison Tool. Retrieved from ' + url, {
               align: 'left',
               width: doc.page.width - 144  // Add proper margins
           });

        // End the PDF
        doc.end();

    } catch (error) {
        console.error('PDF Generation Error:', error);
        res.status(500).json({ error: 'Failed to generate PDF report' });
    }
});

// In your sequence comparison function
function compareSequences(seq1, seq2) {
    // Clean the sequences first - remove any non-sequence characters
    seq1 = seq1.replace(/[^ATCG\-]/gi, '');  // Only allow ATCG and gaps
    seq2 = seq2.replace(/[^ATCG\-]/gi, '');  // Only allow ATCG and gaps

    // Rest of your comparison logic
    let differences = 0;
    let comparedLength = Math.min(seq1.length, seq2.length);
    
    for (let i = 0; i < comparedLength; i++) {
        if (seq1[i] !== seq2[i]) {
            differences++;
        }
    }

    const similarityScore = ((comparedLength - differences) / comparedLength * 100).toFixed(2);

    return {
        similarityScore: similarityScore,
        differences: differences,
        seq1Length: seq1.length,
        seq2Length: seq2.length
    };
}

module.exports = router;