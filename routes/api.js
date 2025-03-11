const express = require('express');
const router = express.Router();
const axios = require('axios');
const { getOwnerEmail, getMaxSequenceLimit } = require('../utils/config');
require('dotenv').config(); // Make sure dotenv is loaded

// Get application configuration
router.get('/config', (req, res) => {
  // Access the email directly from process.env
  const ownerEmail = process.env['owner-contact-email'];
  
  // Log the email to verify it's being read correctly
  console.log('Sending config with owner email:', ownerEmail);
  
  res.json({
    email: ownerEmail,
    maxSequenceLimit: 25
  });
});

// Verify if a Genbank accession ID exists in NCBI
router.get('/nucleotide/verify', async (req, res) => {
  const accessionId = req.query.id;
  
  if (!accessionId) {
    return res.status(400).json({ 
      success: false, 
      error: 'Accession ID is required' 
    });
  }
  
  try {
    // Use NCBI's EUtils to check if the ID exists
    const response = await axios.get(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=nucleotide&id=${accessionId}&retmode=json`
    );
    
    const data = response.data;
    
    // Check if the response contains the accession ID
    const exists = data && 
                  data.result && 
                  (data.result[accessionId] || Object.keys(data.result).length > 0) && 
                  !data.esummaryresult && 
                  !data.error;
    
    return res.json({ 
      success: true, 
      exists: exists 
    });
  } catch (error) {
    console.error(`Error verifying accession ID ${accessionId}:`, error);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to verify accession ID with NCBI' 
    });
  }
});

// PubMed API Routes
router.get('/pubmed/search', async (req, res) => {
    try {
        const { query, retmax = 100, retstart = 0 } = req.query;
        const response = await axios.get(
            `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${retmax}&retstart=${retstart}&retmode=json`,
            {
                headers: {
                    'api-key': process.env.NCBI_API_KEY
                }
            }
        );
        res.json(response.data);
    } catch (error) {
        console.error('PubMed search error:', error);
        res.status(500).json({ error: 'Failed to fetch from PubMed' });
    }
});

router.get('/pubmed/article/:pmid', async (req, res) => {
    try {
        const { pmid } = req.params;
        const response = await axios.get(
            `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmid}&retmode=json&rettype=abstract`,
            {
                headers: {
                    'api-key': process.env.NCBI_API_KEY
                }
            }
        );
        res.json(response.data);
    } catch (error) {
        console.error('PubMed article fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch article from PubMed' });
    }
});

router.get('/pubmed/summary', async (req, res) => {
    try {
        const { ids } = req.query;
        const response = await axios.get(
            `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids}&retmode=json`,
            {
                headers: {
                    'api-key': process.env.NCBI_API_KEY
                }
            }
        );
        res.json(response.data);
    } catch (error) {
        console.error('PubMed summary fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch summaries from PubMed' });
    }
});

module.exports = router;