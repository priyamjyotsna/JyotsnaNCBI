const express = require('express');
const router = express.Router();
const axios = require('axios');

router.get('/', (req, res) => {
    res.render('dna-analysis');
});

router.get('/api/fetch-sequence', async (req, res) => {
    const accession = req.query.accession;
    
    try {
        const response = await axios.get(
            `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=nucleotide&id=${accession}&rettype=fasta&retmode=text`,
            {
                timeout: 30000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; dna-analysis/1.0)',
                    'Accept': 'text/plain, */*'
                }
            }
        );

        // Extract sequence from FASTA format (remove header)
        const sequence = response.data
            .split('\n')
            .slice(1)
            .join('')
            .replace(/\s+/g, '');

        res.json({ sequence });
    } catch (error) {
        console.error('Error fetching sequence:', error);
        res.status(500).json({ error: 'Failed to retrieve sequence' });
    }
});

// Handle file upload for sequence analysis
router.post('/api/analyze-uploaded-sequence', async (req, res) => {
    try {
        console.log('Received file upload request');
        console.log('Files:', req.files);
        console.log('Body:', req.body);

        if (!req.files || !req.files.sequenceFile) {
            console.error('No file received in request');
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const file = req.files.sequenceFile;
        const sequenceType = req.body.sequenceType || 'DNA';

        console.log('File details:', {
            name: file.name,
            size: file.size,
            mimetype: file.mimetype
        });

        // Validate file size
        if (file.size > 50 * 1024 * 1024) { // 50MB limit
            return res.status(413).json({ error: 'File too large. Maximum size is 50MB.' });
        }

        // Validate file type
        const allowedTypes = ['text/plain', 'application/octet-stream', ''];
        if (!allowedTypes.includes(file.mimetype)) {
            return res.status(415).json({ error: 'Invalid file type. Please upload a text file.' });
        }

        // Read file content
        let sequence = file.data.toString('utf8');
        console.log('Initial sequence length:', sequence.length);

        // Check if it's in FASTA format
        let header = '';
        if (sequence.startsWith('>')) {
            const lines = sequence.split('\n');
            header = lines[0];
            // Remove FASTA header and any whitespace
            sequence = lines
                .slice(1)
                .join('')
                .replace(/\s+/g, '');
            console.log('Found FASTA header:', header);
        } else {
            // If not FASTA, just remove whitespace
            sequence = sequence.replace(/\s+/g, '');
        }

        console.log('Processed sequence length:', sequence.length);

        // Validate sequence content
        const validNucleotides = sequenceType === 'DNA' 
            ? /^[ATCGRYKMSWBDHVN]+$/i 
            : /^[AUCGRYKMSWBDHVN]+$/i;

        if (!validNucleotides.test(sequence)) {
            console.error('Invalid sequence characters detected');
            // Find invalid characters for better error message
            const invalidChars = sequence
                .split('')
                .filter(char => !validNucleotides.test(char))
                .filter((char, index, self) => self.indexOf(char) === index) // unique chars
                .join(', ');
            
            return res.status(400).json({ 
                error: `Invalid sequence format. Found invalid characters: ${invalidChars}` 
            });
        }

        const response = {
            success: true,
            sequence: sequence.toUpperCase(),
            type: sequenceType,
            header: header || null,
            length: sequence.length
        };

        console.log('Sending response:', {
            success: response.success,
            type: response.type,
            length: response.length,
            hasHeader: !!response.header
        });

        res.json(response);
    } catch (error) {
        console.error('File upload error:', error);
        res.status(500).json({ 
            error: 'Failed to process uploaded file',
            details: error.message
        });
    }
});

module.exports = router;