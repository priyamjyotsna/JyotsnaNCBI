const express = require('express');
const router = express.Router();
const axios = require('axios');

// Direct NCBI API fetch with better error handling
router.get('/sequence', async (req, res) => {
    const id = req.query.id;
    
    if (!id) {
        return res.status(400).json({ 
            success: false, 
            error: 'Missing sequence ID parameter' 
        });
    }
    
    try {
        console.log(`Fetching sequence for ${id} from NCBI`);
        
        // Use direct NCBI API call with proper headers
        const efetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=nucleotide&id=${id}&rettype=fasta&retmode=text`;
        
        const response = await axios.get(efetchUrl, { 
            timeout: 30000,  // 30 second timeout
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; JyotsnaNCBITools/1.0)'
            }
        });
        
        // Parse FASTA format
        const lines = response.data.split('\n');
        let header = '';
        let sequence = '';
        
        if (lines.length > 0 && lines[0].startsWith('>')) {
            header = lines[0].substring(1).trim();
            sequence = lines.slice(1).join('').replace(/\s/g, '');
        } else {
            throw new Error('Invalid FASTA format received from NCBI');
        }
        
        return res.json({
            success: true,
            data: {
                id: header,
                sequence: sequence
            }
        });
        
    } catch (error) {
        console.error(`Error fetching sequence ${id}:`, error.message);
        
        // Send a more detailed error response
        return res.status(500).json({
            success: false,
            error: `Failed to fetch sequence: ${error.message}`,
            id: id
        });
    }
});

// Verify if an accession ID exists
router.get('/verify', async (req, res) => {
    try {
        const { id } = req.query;
        if (!id) {
            return res.status(400).json({ success: false, error: 'Accession ID is required' });
        }

        // Try to fetch the sequence from NCBI to verify it exists
        const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=nucleotide&term=${id}[accn]&retmode=json`;
        const response = await axios.get(url, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; nucleotide-downloader/1.0)',
                'Accept': 'application/json, */*'
            }
        });

        const data = response.data;
        const exists = data.esearchresult && data.esearchresult.count && parseInt(data.esearchresult.count) > 0;

        return res.json({
            success: true,
            exists: exists
        });
    } catch (error) {
        console.error('Verification error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to verify sequence'
        });
    }
});

module.exports = router;