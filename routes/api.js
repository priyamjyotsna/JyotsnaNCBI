const express = require('express');
const router = express.Router();
const axios = require('axios');
const { getOwnerEmail, getMaxSequenceLimit } = require('../utils/config');
require('dotenv').config(); // Make sure dotenv is loaded

// Helper function for retrying failed requests
async function retryRequest(requestFn, maxAttempts = 3) {
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await requestFn();
        } catch (error) {
            lastError = error;
            if (attempt === maxAttempts) throw error;
            // Exponential backoff: 2s, 4s, 8s
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
    }
}

// Get application configuration
router.get('/config', (req, res) => {
    const ownerEmail = process.env.OWNER_CONTACT_EMAIL;  // Changed from OWNER_EMAIL to OWNER_CONTACT_EMAIL
    if (!ownerEmail) {
        console.warn('Owner email not configured in environment variables');
    }
    res.json({
        ownerEmail: ownerEmail || '',
        maxSequenceLimit: 25
    });
});

// Get citation configuration from environment variables
router.get('/citation-config', (req, res) => {
    res.json({
        doi: process.env.CITATION_DOI || '10.5281/zenodo.15069907',
        title: process.env.CITATION_TITLE || 'Jyotsna\'s NCBI Tools',
        author: process.env.CITATION_AUTHOR || 'Priyam, J.',
        year: process.env.CITATION_YEAR || '2025',
        version: process.env.CITATION_VERSION || '1.0.0',
        url: process.env.CITATION_URL || 'https://NCBI.JyotsnaPriyam.com'
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
    const response = await retryRequest(async () => {
      return await axios.get(
        `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=nucleotide&id=${accessionId}&retmode=json`,
        {
          timeout: 60000, // 60 second timeout
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; nucleotide-downloader/1.0)',
            'Accept': 'application/json, */*'
          }
        }
      );
    });
    
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
    console.error(`Error verifying accession ID ${accessionId}:`, error.message);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to verify accession ID with NCBI' 
    });
  }
});

// PubMed API Routes with retry logic
router.get('/pubmed/search', async (req, res) => {
    try {
        const { query, retmax = 100, retstart = 0 } = req.query;
        const response = await retryRequest(async () => {
            return await axios.get(
                `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${retmax}&retstart=${retstart}&retmode=json`,
                {
                    timeout: 60000, // 60 second timeout
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (compatible; nucleotide-downloader/1.0)',
                        'api-key': process.env.NCBI_API_KEY
                    }
                }
            );
        });
        res.json(response.data);
    } catch (error) {
        console.error('PubMed search error:', error.message);
        res.status(500).json({ error: 'Failed to fetch from PubMed' });
    }
});

router.get('/pubmed/article/:pmid', async (req, res) => {
    try {
        const { pmid } = req.params;
        const response = await retryRequest(async () => {
            return await axios.get(
                `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmid}&retmode=json&rettype=abstract`,
                {
                    timeout: 60000, // 60 second timeout
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (compatible; nucleotide-downloader/1.0)',
                        'api-key': process.env.NCBI_API_KEY
                    }
                }
            );
        });
        res.json(response.data);
    } catch (error) {
        console.error('PubMed article fetch error:', error.message);
        res.status(500).json({ error: 'Failed to fetch article from PubMed' });
    }
});

router.get('/pubmed/summary', async (req, res) => {
    try {
        const { ids } = req.query;
        const response = await retryRequest(async () => {
            return await axios.get(
                `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids}&retmode=json`,
                {
                    timeout: 60000, // 60 second timeout
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (compatible; nucleotide-downloader/1.0)',
                        'api-key': process.env.NCBI_API_KEY
                    }
                }
            );
        });
        res.json(response.data);
    } catch (error) {
        console.error('PubMed summary fetch error:', error.message);
        res.status(500).json({ error: 'Failed to fetch summaries from PubMed' });
    }
});

router.get('/nucleotide/sequence', async (req, res) => {
    try {
        const { id } = req.query;
        if (!id) {
            return res.status(400).json({ 
                success: false,
                error: 'Accession ID is required' 
            });
        }

        const response = await retryRequest(async () => {
            return await axios.get(
                `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=nucleotide&id=${id}&rettype=fasta&retmode=text`,
                {
                    timeout: 60000, // 60 second timeout
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (compatible; nucleotide-downloader/1.0)',
                        'Accept': 'text/plain, */*'
                    }
                }
            );
        });

        if (response.data) {
            const lines = response.data.split('\n');
            const header = lines[0];
            const sequence = lines.slice(1).join('').replace(/\s/g, '');
            
            return res.json({ 
                success: true, 
                data: { id, sequence, header } 
            });
        }
        
        throw new Error('Empty response from NCBI');
    } catch (error) {
        // Log minimal error details without exposing sensitive information
        console.error(`Error fetching sequence ${req.query.id}: ${error.message}`);
        
        res.status(500).json({ 
            success: false,
            error: 'Failed to fetch sequence data from NCBI'
        });
    }
});

module.exports = router;