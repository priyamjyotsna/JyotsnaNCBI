const express = require('express');
const router = express.Router();
const axios = require('axios');
const multer = require('multer');

// Configure multer with better error handling for file uploads
const storage = multer.memoryStorage();
const uploadMiddleware = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1,
    parts: 10 // Limit the number of parts in multipart data
  }
});

// NCBI API settings
const NCBI_BASE_URL = 'https://blast.ncbi.nlm.nih.gov/Blast.cgi';
const NCBI_EMAIL = process.env.NCBI_EMAIL || 'priyam.jyotsna@gmail.com';
const NCBI_TOOL = 'jyotsna-blast-wrapper';

// Render BLAST tool page
router.get('/', (req, res) => {
  res.render('blast-wrapper');
});

// Submit BLAST search - use a separate route for file uploads
router.post('/submit', function(req, res) {
  // Use multer as middleware only when needed
  uploadMiddleware.single('fastaFile')(req, res, async function(err) {
    if (err) {
      console.error('File upload error:', err);
      return res.status(400).json({ 
        error: 'File upload failed', 
        message: err.message 
      });
    }
    
    try {
      console.log('Processing BLAST submission. File?', !!req.file, 'Body?', !!req.body);
      
      // Get sequence either from text input or uploaded file
      let sequence = req.body && req.body.sequence ? req.body.sequence.trim() : '';
      if (req.file && req.file.buffer) {
        sequence = req.file.buffer.toString('utf8').trim();
        console.log(`Processed uploaded file, size: ${req.file.size} bytes`);
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
      
      console.log(`Submitting BLAST search: ${req.body.program || 'blastn'} against ${req.body.database || 'nt'}`);
      
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
});

// Check BLAST results
router.get('/results/:rid', async (req, res) => {
  try {
    const rid = req.params.rid;
    
    const params = new URLSearchParams();
    params.append('CMD', 'Get');
    params.append('FORMAT_OBJECT', 'SearchInfo');
    params.append('RID', rid);
    
    console.log(`Checking status for BLAST search: ${rid}`);
    
    const response = await axios.get(`${NCBI_BASE_URL}?${params.toString()}`);
    
    // Get the raw response text
    const responseText = response.data;
    
    // Check if search is complete
    if (responseText.includes('Status=WAITING')) {
      console.log(`BLAST search still running: ${rid}`);
      return res.json({ status: 'running' });
    } else if (responseText.includes('Status=FAILED')) {
      console.log(`BLAST search failed: ${rid}`);
      return res.json({ status: 'failed', error: 'BLAST search failed' });
    } else if (responseText.includes('Status=UNKNOWN')) {
      console.log(`BLAST search not found: ${rid}`);
      return res.json({ status: 'not_found', error: 'BLAST search not found' });
    } else if (responseText.includes('Status=READY')) {
      console.log(`BLAST search completed: ${rid}`);
      
      try {
        // Get actual results
        const resultParams = new URLSearchParams();
        resultParams.append('CMD', 'Get');
        resultParams.append('FORMAT_TYPE', 'JSON2_S');
        resultParams.append('RID', rid);
        
        const resultsResponse = await axios.get(`${NCBI_BASE_URL}?${resultParams.toString()}`);
        
        // Check if the response is JSON
        let resultsData;
        if (typeof resultsResponse.data === 'string') {
          try {
            // Try to parse it as JSON
            resultsData = JSON.parse(resultsResponse.data);
          } catch (parseError) {
            console.log('Response is not JSON, returning raw data');
            resultsData = { rawData: resultsResponse.data };
          }
        } else {
          resultsData = resultsResponse.data;
        }
        
        return res.json({ 
          status: 'completed', 
          results: resultsData 
        });
      } catch (resultError) {
        console.error('Error fetching BLAST results data:', resultError);
        return res.json({ 
          status: 'error', 
          error: 'Error retrieving BLAST results',
          message: resultError.message
        });
      }
    }
    
    console.log(`BLAST search unknown status: ${rid}`, responseText);
    return res.json({ 
      status: 'unknown',
      debug: responseText.substring(0, 500) // Include first 500 chars for debugging
    });
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