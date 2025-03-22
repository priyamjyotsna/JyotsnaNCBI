const express = require('express');
const router = express.Router();
const axios = require('axios');

router.get('/', (req, res) => {
    res.render('dna-analysis');
});

// Add new endpoint to check sequence size
router.get('/api/check-sequence-size', async (req, res) => {
    const accession = req.query.accession;
    
    try {
        // Use NCBI EFetch API with stat option to get sequence metadata
        // This is more reliable than ESummary for getting sequence length
        const response = await axios.get(
            `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=nucleotide&id=${accession}&rettype=stat&retmode=text`,
            {
                timeout: 15000, // Increase timeout to 15 seconds
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; dna-analysis/1.0)',
                    'Accept': 'text/plain, */*'
                }
            }
        );

        if (!response.data) {
            return res.status(404).json({ error: 'Sequence not found' });
        }

        // Parse the length from the stat output - look for the LOCUS line which contains the length
        let length = 0;
        const statText = response.data;
        
        // LOCUS format is standardized in GenBank: LOCUS ID Length bp TYPE ...
        const locusMatch = statText.match(/LOCUS\s+\S+\s+(\d+)\s+bp/);
        
        if (locusMatch && locusMatch[1]) {
            length = parseInt(locusMatch[1], 10);
            console.log(`Parsed length from LOCUS line: ${length} for ${accession}`);
        } else {
            // Fallback: try other patterns
            console.log(`Could not find length in LOCUS line for ${accession}, trying alternatives`);
            const lengthMatch = statText.match(/length=(\d+)/i);
            
            if (lengthMatch && lengthMatch[1]) {
                length = parseInt(lengthMatch[1], 10);
                console.log(`Parsed length from length= pattern: ${length}`);
            } else {
                // Last resort: count the sequence lines
                console.log(`Could not find length pattern for ${accession}, estimating from content`);
                const lines = statText.split('\n');
                const sequenceLines = lines.filter(line => !line.startsWith('>') && !line.match(/^\s*LOCUS|DEFINITION|ACCESSION|VERSION|DBLINK|KEYWORDS|SOURCE|REFERENCE|FEATURES|ORIGIN/i));
                length = sequenceLines.join('').replace(/\s+/g, '').length;
                console.log(`Estimated length from content: ${length}`);
            }
        }
        
        // Calculate estimated file size in bytes (1 byte per character + header overhead)
        // FASTA format adds line breaks every ~70 characters plus a header line
        const estimatedSize = length + Math.ceil(length / 70) + 100; // 100 bytes for header overhead
        const sizeInMB = (estimatedSize / (1024 * 1024)).toFixed(2);
        
        // Check if the size is greater than 20MB (20 * 1024 * 1024 bytes)
        const sizeThreshold = 20 * 1024 * 1024;
        const isTooLarge = estimatedSize > sizeThreshold;
        
        console.log(`Sequence ${accession}: Length=${length}, Size=${sizeInMB}MB, EstimatedBytes=${estimatedSize}, Threshold=${sizeThreshold}, TooLarge=${isTooLarge}`);
        
        // Extract title from the DEFINITION line if available
        let title = accession;
        const definitionMatch = statText.match(/DEFINITION\s+(.*?)\.?\n/);
        if (definitionMatch && definitionMatch[1]) {
            title = definitionMatch[1].trim();
        }
        
        res.json({
            accession,
            length,
            sizeInBytes: estimatedSize,
            sizeInMB: sizeInMB,
            isTooLarge: isTooLarge,
            title: title,
            directDownloadUrl: `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=nucleotide&id=${accession}&rettype=fasta&retmode=text`
        });
    } catch (error) {
        console.error('Error checking sequence size:', error.message);
        // Implement fallback approach - try to get sequence directly but catch before completion
        try {
            // Check if the sequence exists by starting a download
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // Abort after 5 seconds
            
            const checkResponse = await axios.get(
                `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=nucleotide&id=${accession}&rettype=fasta&retmode=text`,
                {
                    timeout: 10000,
                    signal: controller.signal,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (compatible; dna-analysis/1.0)',
                        'Accept': 'text/plain, */*'
                    },
                    onDownloadProgress: (progressEvent) => {
                        // If we've received some data, the sequence exists
                        if (progressEvent.loaded > 1000) {
                            controller.abort();
                            clearTimeout(timeoutId);
                        }
                    }
                }
            );
            
            clearTimeout(timeoutId);
            
            // If we reach here, the sequence exists but is small enough to download
            res.json({
                accession,
                length: 0, // We don't have the exact length
                sizeInBytes: 0,
                sizeInMB: "0",
                isTooLarge: false, // Small enough to download
                title: accession,
                directDownloadUrl: `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=nucleotide&id=${accession}&rettype=fasta&retmode=text`
            });
        } catch (fallbackError) {
            // If we reach here with a specific error, the sequence likely exists but is too large
            if (fallbackError.name === 'AbortError' || fallbackError.code === 'ECONNABORTED') {
                console.log(`Sequence ${accession} appears to be too large (aborted/timeout)`);
                return res.json({
                    accession,
                    length: 20000000, // Estimate large length
                    sizeInBytes: 21000000,
                    sizeInMB: "20+",
                    isTooLarge: true, // Too large
                    title: accession,
                    directDownloadUrl: `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=nucleotide&id=${accession}&rettype=fasta&retmode=text`
                });
            }
            
            // Check if the sequence ID exists at all
            res.status(404).json({ error: 'Failed to check sequence size or sequence not found' });
        }
    }
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
        if (file.size > 20 * 1024 * 1024) { // 20MB limit
            return res.status(413).json({ error: 'File too large. Maximum size is 20MB. For large datasets and commercial use, please contact us.' });
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