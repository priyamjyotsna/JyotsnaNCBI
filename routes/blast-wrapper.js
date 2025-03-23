const express = require('express');
const router = express.Router();
const axios = require('axios');

// NCBI API settings
const NCBI_BASE_URL = 'https://blast.ncbi.nlm.nih.gov/Blast.cgi';
const NCBI_EMAIL = process.env.NCBI_EMAIL || 'priyam.jyotsna@gmail.com';
const NCBI_TOOL = 'jyotsna-blast-wrapper';

// Configure axios with retry logic for NCBI calls
const axiosRetry = async (url, options, maxRetries = 3, timeout = 30000) => {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`API attempt ${attempt}/${maxRetries}: ${options.method || 'GET'} ${url}`);
      
      // Add timeout to the options
      const requestOptions = {
        ...options,
        timeout: timeout, // 30 seconds timeout
        validateStatus: status => {
          // Consider only 5xx errors as retryable, handle 4xx separately
          return status < 500;
        }
      };
      
      const response = await axios(url, requestOptions);
      
      // Handle 4xx errors explicitly without retrying
      if (response.status >= 400 && response.status < 500) {
        const error = new Error(`HTTP error ${response.status}`);
        error.response = response;
        error.status = response.status;
        error.statusText = response.statusText;
        error.data = response.data;
        throw error;
      }
      
      return response;
    } catch (error) {
      const status = error.response?.status;
      const responseData = error.response?.data;
      
      console.log(`Attempt ${attempt} failed: ${error.message}`);
      if (status) console.log(`Status code: ${status}`);
      if (responseData) console.log(`Response data:`, typeof responseData === 'string' ? responseData.substring(0, 200) : responseData);
      
      lastError = error;
      
      // Don't retry on 4xx errors (client errors)
      if (status >= 400 && status < 500) {
        break;
      }
      
      // Don't wait on the last attempt
      if (attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s, etc.
        const delay = 1000 * Math.pow(2, attempt - 1);
        console.log(`Waiting ${delay}ms before next attempt...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // If we get here, all attempts failed
  throw lastError;
};

// Render BLAST tool page
router.get('/', (req, res) => {
  res.render('blast-wrapper');
});

// Submit BLAST search - use express-fileupload which is configured globally
router.post('/submit', async (req, res) => {
  try {
    console.log('Processing BLAST submission');
    
    // Log request information for debugging
    console.log('Request body:', req.body);
    console.log('Files:', req.files ? Object.keys(req.files) : 'No files');
    
    // Get sequence either from text input or uploaded file
    let sequence = req.body && req.body.sequence ? req.body.sequence.trim() : '';
    
    // Handle file upload with express-fileupload
    if (req.files && req.files.fastaFile) {
      console.log(`Processing uploaded file: ${req.files.fastaFile.name}, size: ${req.files.fastaFile.size} bytes`);
      sequence = req.files.fastaFile.data.toString('utf8').trim();
    }
    
    if (!sequence) {
      return res.status(400).json({ error: 'No sequence provided' });
    }
    
    console.log(`Sequence length: ${sequence.length} characters`);
    
    // Validate sequence
    // For nucleotide sequences (BLASTN)
    if (req.body.program === 'blastn') {
      const validNucleotideSequence = /^[ATGCNatgcn\s>0-9_-]+$/;
      if (!validNucleotideSequence.test(sequence)) {
        return res.status(400).json({ 
          error: 'Invalid nucleotide sequence',
          message: 'Nucleotide sequences should only contain A, T, G, C, N characters'
        });
      }
    }
    // For protein sequences (BLASTP)
    else if (req.body.program === 'blastp') {
      const validProteinSequence = /^[ACDEFGHIKLMNPQRSTVWY\s>0-9_-]+$/i;
      if (!validProteinSequence.test(sequence)) {
        return res.status(400).json({ 
          error: 'Invalid protein sequence',
          message: 'Protein sequences should only contain standard amino acid letters'
        });
      }
    }
    
    // Check sequence length
    const effectiveSequence = sequence.replace(/^>.*\n/m, '').replace(/\s/g, '');
    if (effectiveSequence.length < 10) {
      return res.status(400).json({ 
        error: 'Sequence too short',
        message: 'Sequence must be at least 10 characters long (excluding headers and whitespace)'
      });
    }
    
    if (effectiveSequence.length > 50000) {
      return res.status(400).json({ 
        error: 'Sequence too long',
        message: 'Sequence must be less than 50,000 characters for web BLAST'
      });
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
    
    // Submit to NCBI with retry logic and extended timeout
    const response = await axiosRetry(NCBI_BASE_URL, {
      method: 'POST',
      data: params.toString(),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'JyotsnaNCBI/1.0'
      }
    }, 3, 60000); // 3 retries, 60 second timeout
    
    console.log('NCBI response status:', response.status);
    
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
    console.error('BLAST submission error:', error.message);
    console.error('Error code:', error.code);
    
    // Provide a more user-friendly error message based on the error type
    let errorMessage = 'Failed to submit BLAST search';
    
    if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      errorMessage = 'Connection to NCBI BLAST servers timed out. Please try again later or check your internet connection.';
    } else if (error.code === 'ECONNREFUSED') {
      errorMessage = 'Unable to connect to NCBI BLAST servers. The service might be down or unavailable.';
    }
    
    res.status(503).json({ 
      error: errorMessage,
      message: error.message,
      code: error.code
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
    
    console.log(`Checking status for BLAST search: ${rid}`);
    
    // Use retry mechanism for checking results
    const response = await axiosRetry(`${NCBI_BASE_URL}?${params.toString()}`, {
      method: 'GET'
    });
    
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
        
        // Use retry mechanism for getting results
        const resultsResponse = await axiosRetry(`${NCBI_BASE_URL}?${resultParams.toString()}`, {
          method: 'GET'
        });
        
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
    res.status(503).json({ 
      error: 'Failed to retrieve BLAST results',
      message: error.message,
      code: error.code || 'UNKNOWN_ERROR'
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

// Check BLAST status
router.get('/status', async (req, res) => {
  try {
    const rid = req.query.rid;
    
    if (!rid) {
      return res.status(400).json({ error: 'Missing RID parameter' });
    }
    
    const params = new URLSearchParams();
    params.append('CMD', 'Get');
    params.append('FORMAT_OBJECT', 'SearchInfo');
    params.append('RID', rid);
    
    console.log(`Checking status for BLAST search: ${rid}`);
    
    // Use retry mechanism for checking results
    const response = await axiosRetry(`${NCBI_BASE_URL}?${params.toString()}`, {
      method: 'GET'
    });
    
    // Get the raw response text
    const responseText = response.data;
    
    // Check if search is complete
    if (responseText.includes('Status=WAITING')) {
      console.log(`BLAST search still running: ${rid}`);
      return res.json({ status: 'WAITING' });
    } else if (responseText.includes('Status=FAILED')) {
      console.log(`BLAST search failed: ${rid}`);
      return res.json({ status: 'FAILED', message: 'BLAST search failed' });
    } else if (responseText.includes('Status=UNKNOWN')) {
      console.log(`BLAST search not found: ${rid}`);
      return res.json({ status: 'FAILED', message: 'BLAST search not found' });
    } else if (responseText.includes('Status=READY')) {
      console.log(`BLAST search completed: ${rid}`);
      return res.json({ status: 'READY' });
    }
    
    console.log(`BLAST search unknown status: ${rid}`, responseText);
    return res.json({ 
      status: 'UNKNOWN',
      debug: responseText.substring(0, 500) // Include first 500 chars for debugging
    });
  } catch (error) {
    console.error('BLAST status check error:', error);
    res.status(503).json({ 
      error: 'Failed to check BLAST status',
      message: error.message,
      code: error.code || 'UNKNOWN_ERROR'
    });
  }
});

// Add a results endpoint that matches the client expectations
router.get('/results', async (req, res) => {
  try {
    const rid = req.query.rid;
    
    if (!rid) {
      return res.status(400).json({ error: 'Missing RID parameter' });
    }
    
    console.log(`Getting results for BLAST search: ${rid}`);
    
    // Get actual results
    const resultParams = new URLSearchParams();
    resultParams.append('CMD', 'Get');
    resultParams.append('FORMAT_TYPE', 'JSON2_S');
    resultParams.append('RID', rid);
    
    // Use retry mechanism for getting results
    const resultsResponse = await axiosRetry(`${NCBI_BASE_URL}?${resultParams.toString()}`, {
      method: 'GET',
      timeout: 60000 // 60 second timeout for results
    });
    
    // Process the BLAST response
    let resultsData;
    if (typeof resultsResponse.data === 'string') {
      try {
        // Try to parse it as JSON
        resultsData = JSON.parse(resultsResponse.data);
      } catch (parseError) {
        console.log('Response is not JSON, returning structured data');
        
        // Create a basic structured response
        const hitCount = (resultsResponse.data.match(/Number of matches: (\d+)/) || [0, 0])[1];
        
        return res.json({
          rid: rid,
          program: req.query.program || 'blastn',
          database: req.query.database || 'nt',
          queryLength: 0,
          hitCount: parseInt(hitCount) || 0,
          message: 'Results available but not in JSON format',
          rawData: resultsResponse.data.substring(0, 1000) // First 1000 chars
        });
      }
    } else {
      resultsData = resultsResponse.data;
    }
    
    // Extract the important parts from the NCBI BLAST JSON response
    const blastOutput = resultsData.BlastOutput2 && resultsData.BlastOutput2[0];
    const report = blastOutput && blastOutput.report;
    const results = report && report.results;
    const search = results && results.search;
    
    if (!search) {
      return res.json({
        rid: rid,
        program: req.query.program || 'blastn',
        database: req.query.database || 'nt',
        queryLength: 0,
        hitCount: 0,
        message: 'No search results found in BLAST response'
      });
    }
    
    // Build a simplified response structure
    const response = {
      rid: rid,
      program: search.program || req.query.program || 'blastn',
      database: search.database || req.query.database || 'nt',
      queryLength: search.query_len || 0,
      hitCount: search.hits ? search.hits.length : 0,
      hits: [],
      alignments: [],
      params: search.params || {}
    };
    
    // Process hits
    if (search.hits && search.hits.length > 0) {
      response.hits = search.hits.map(hit => {
        const description = hit.description && hit.description[0];
        const hsps = hit.hsps && hit.hsps[0];
        
        return {
          accession: description ? description.accession : 'Unknown',
          title: description ? description.title : 'Unknown',
          score: hsps ? hsps.bit_score : 0,
          evalue: hsps ? hsps.evalue : 0,
          identity: hsps ? `${hsps.identity}/${hsps.align_len} (${Math.round(hsps.identity/hsps.align_len*100)}%)` : 'N/A',
          queryCoverage: hsps ? `${Math.round((hsps.query_to - hsps.query_from + 1) / search.query_len * 100)}%` : 'N/A',
        };
      });
      
      // Process alignments (first 10 for simplicity)
      const maxAlignments = Math.min(10, search.hits.length);
      for (let i = 0; i < maxAlignments; i++) {
        const hit = search.hits[i];
        const description = hit.description && hit.description[0];
        
        if (hit.hsps && hit.hsps.length > 0) {
          hit.hsps.forEach(hsp => {
            response.alignments.push({
              title: description ? description.title : `Alignment ${i+1}`,
              qseq: hsp.qseq,
              hseq: hsp.hseq,
              midline: hsp.midline,
              qstart: hsp.query_from,
              qend: hsp.query_to,
              hstart: hsp.hit_from,
              hend: hsp.hit_to,
              evalue: hsp.evalue,
              bitScore: hsp.bit_score,
              alignLen: hsp.align_len,
              identity: hsp.identity,
              positive: hsp.positive,
              gaps: hsp.gaps
            });
          });
        }
      }
    }
    
    return res.json(response);
  } catch (error) {
    console.error('BLAST results retrieval error:', error);
    res.status(503).json({ 
      error: 'Failed to retrieve BLAST results',
      message: error.message,
      code: error.code || 'UNKNOWN_ERROR'
    });
  }
});

module.exports = router; 