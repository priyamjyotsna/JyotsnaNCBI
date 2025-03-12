const express = require('express');
const router = express.Router();
const axios = require('axios');

// Import the requireAuth middleware from auth routes
const { requireAuth } = require('./auth');

// Nucleotide download route
router.get('/nucleotide-download', requireAuth, (req, res) => {
    try {
        res.render('nucleotide-download', { user: req.session.user });
    } catch (error) {
        console.error('Error rendering nucleotide-download:', error);
        res.status(500).send('Internal Server Error');
    }
});

// NCBI API endpoint for nucleotide download
router.post('/nucleotide-download/fetch', requireAuth, async (req, res) => {
    try {
        const { id } = req.body;
        const user = req.session.user;

        if (!user.ncbiCredentials) {
            return res.status(400).json({
                success: false,
                error: 'NCBI credentials not found. Please add them in your profile.'
            });
        }

        const { email, apiKey } = user.ncbiCredentials;
        const baseUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

        // First, search for the ID to get the proper nucleotide ID
        const searchResponse = await axios.get(
            `${baseUrl}/esearch.fcgi?db=nucleotide&term=${id}[accn]&tool=nucleotide-downloader&email=${email}&api_key=${apiKey}&retmode=json`
        );

        if (!searchResponse.data.esearchresult.idlist || searchResponse.data.esearchresult.idlist.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Nucleotide sequence not found'
            });
        }

        // Then fetch the sequence
        const fetchResponse = await axios.get(
            `${baseUrl}/efetch.fcgi?db=nucleotide&id=${searchResponse.data.esearchresult.idlist[0]}&rettype=fasta&retmode=text&tool=nucleotide-downloader&email=${email}&api_key=${apiKey}`
        );

        res.json({
            success: true,
            data: fetchResponse.data
        });

    } catch (error) {
        console.error('Error fetching nucleotide sequence:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch nucleotide sequence'
        });
    }
});

module.exports = router; 