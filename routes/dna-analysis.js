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
            `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=nucleotide&id=${accession}&rettype=fasta&retmode=text`
        );

        // Extract sequence from FASTA format (remove header)
        const sequence = response.data
            .split('\n')
            .slice(1)
            .join('')
            .replace(/\s+/g, '');

        res.json({ sequence });
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve sequence' });
    }
});

module.exports = router;