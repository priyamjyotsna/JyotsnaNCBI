const express = require('express');
const router = express.Router();
const axios = require('axios');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

// NCBI API settings
const NCBI_BASE_URL = 'https://blast.ncbi.nlm.nih.gov/Blast.cgi';
const NCBI_EMAIL = process.env.NCBI_EMAIL || 'priyam.jyotsna@gmail.com';
const NCBI_TOOL = 'jyotsna-blast-wrapper';

// Render BLAST tool page
router.get('/', (req, res) => {
  res.render('blast-wrapper');
});

// Submit BLAST search
router.post('/submit', upload.single('fastaFile'), async (req, res) => {
  try {
    // Get sequence either from text input or uploaded file
    let sequence = req.body.sequence;
    if (req.file) {
      sequence = req.file.buffer.toString();
    }
    
    if (!sequence) {
      return res.status(400).json({ error: 'No sequence provided' });
    }
    
    // Build NCBI BLAST API request
    const params = new URLSearchParams();
    params.append('CMD', 'Put');
    params.append('PROGRAM', req.body.program || 'blastn');
    params.append('DATABASE', req.body.database || 'nt');
    params.append('QUERY', sequence);
    params.append('EXPECT', req.body.evalue || '0.01');
    params.append('WORD_SIZE', req.body.wordSize || '11');
    params.append('HITLIST_SIZE', req.body.maxResults || '50');
    params.append('FILTER', 'L');
    params.append('FORMAT_TYPE', 'JSON2_S');
    params.append('EMAIL', NCBI_EMAIL);
    params.append('TOOL', NCBI_TOOL);
    
    console.log(`Submitting BLAST search: ${req.body.program} against ${req.body.database}`);
    
    // Submit to NCBI
    const response = await axios.post(NCBI_BASE_URL, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    
    // Extract RID (Request ID) and RTOE (estimated time)
    const ridMatch = response.data.match(/RID = (.*)\n/);
    const rtoeMatch = response.data.match(/RTOE = (.*)\n/);
    
    if (!ridMatch) {
      console.error('Failed to get RID from NCBI response:', response.data);
      return res.status(500).json({ error: 'Failed to get request ID from NCBI' });
    }
    
    const rid = ridMatch[1].trim();
    const rtoe = rtoeMatch ? parseInt(rtoeMatch[1].trim()) : 60;
    
    console.log(`BLAST search submitted with RID: ${rid}, estimated time: ${rtoe}s`);
    
    res.json({
      success: true,
      rid: rid,
      estimatedTime: rtoe
    });
  } catch (error) {
    console.error('BLAST submission error:', error);
    res.status(500).json({ 
      error: 'Failed to submit BLAST search',
      message: error.message
    });
  }
});

// Check BLAST results
router.get('/results/:rid', async (req, res) => {
  try {
    const rid = req.params.rid;
    
    const params = new URLSearchParams();
    params.append('CMD', 'Get');
    params.append('FORMAT_OBJECT', 'SearchInfo');
    params.append('RID', rid);
    params.append('FORMAT_TYPE', 'JSON2_S');
    
    console.log(`Checking status for BLAST search: ${rid}`);
    
    const response = await axios.get(`${NCBI_BASE_URL}?${params.toString()}`);
    
    // Check if search is complete
    if (response.data.includes('Status=WAITING')) {
      return res.json({ status: 'running' });
    } else if (response.data.includes('Status=FAILED')) {
      console.log(`BLAST search failed: ${rid}`);
      return res.json({ status: 'failed', error: 'BLAST search failed' });
    } else if (response.data.includes('Status=UNKNOWN')) {
      console.log(`BLAST search not found: ${rid}`);
      return res.json({ status: 'not_found', error: 'BLAST search not found' });
    } else if (response.data.includes('Status=READY')) {
      console.log(`BLAST search completed: ${rid}`);
      
      // Get actual results
      const resultParams = new URLSearchParams();
      resultParams.append('CMD', 'Get');
      resultParams.append('FORMAT_TYPE', 'JSON2_S');
      resultParams.append('RID', rid);
      
      const resultsResponse = await axios.get(`${NCBI_BASE_URL}?${resultParams.toString()}`);
      return res.json({ 
        status: 'completed', 
        results: resultsResponse.data 
      });
    }
    
    return res.json({ status: 'unknown' });
  } catch (error) {
    console.error('BLAST results error:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve BLAST results',
      message: error.message
    });
  }
});

// Get formatted results as HTML
router.get('/formatted-results/:rid', async (req, res) => {
  try {
    const rid = req.params.rid;
    
    const params = new URLSearchParams();
    params.append('CMD', 'Get');
    params.append('FORMAT_TYPE', 'HTML');
    params.append('RID', rid);
    
    console.log(`Getting formatted HTML results for BLAST search: ${rid}`);
    
    const response = await axios.get(`${NCBI_BASE_URL}?${params.toString()}`);
    
    return res.send(response.data);
  } catch (error) {
    console.error('BLAST formatted results error:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve BLAST formatted results',
      message: error.message
    });
  }
});

module.exports = router; 