/**
 * BLAST Wrapper - Client-side JavaScript
 * Handles sequence validation, BLAST search submission, and result visualization
 */

document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const blastForm = document.getElementById('blastForm');
    const sequenceInput = document.getElementById('sequenceInput');
    const fileUpload = document.getElementById('fileUpload');
    const programSelect = document.getElementById('program');
    const databaseSelect = document.getElementById('database');
    const evalueInput = document.getElementById('evalue');
    const wordSizeInput = document.getElementById('wordSize');
    const maxResultsInput = document.getElementById('maxResults');
    const loadExampleBtn = document.getElementById('loadExample');
    const clearFormBtn = document.getElementById('clearForm');
    const statusContainer = document.getElementById('statusContainer');
    const jobStatus = document.getElementById('jobStatus');
    const jobProgress = document.getElementById('jobProgress');
    const statusMessage = document.getElementById('statusMessage');
    const cancelSearchBtn = document.getElementById('cancelSearch');
    const resultsContainer = document.getElementById('resultsContainer');
    const hitsContainer = document.getElementById('hitsContainer');
    const graphicalOverview = document.getElementById('graphicalOverview');
    const msaViewerContainer = document.getElementById('msaViewerContainer');
    const downloadResultsBtn = document.getElementById('downloadResults');
    const ncbiLink = document.getElementById('ncbiLink');
    const searchHistory = document.getElementById('searchHistory');
    const clearHistoryBtn = document.getElementById('clearHistory');
    
    // Constants
    const HISTORY_STORAGE_KEY = 'blastSearchHistory';
    const POLLING_INTERVAL = 5000; // 5 seconds
    const MAX_PROGRESS_TIME = 300000; // 5 minutes
    const MAX_HISTORY_ITEMS = 10;
    
    // State variables
    let currentRid = null;
    let pollingTimer = null;
    let startTime = null;
    let searchResults = null;
    let sequences = [];
    
    // Example sequences
    const exampleSequences = {
        'blastn': '>NM_000518.5 Homo sapiens hemoglobin subunit beta (HBB), mRNA\nACATTTGCTTCTGACACAACTGTGTTCACTAGCAACCTCAAACAGACACCATGGTGCATCTGACTCCTGA\nGGAGAAGTCTGCCGTTACTGCCCTGTGGGGCAAGGTGAACGTGGATGAAGTTGGTGGTGAGGCCCTGGGC\nAGGTTGGTATCAGGGCACGTGGAGGGAGAAGTCTGCCGTTACTGCCCTGTGGGGCAAGGTGAACGTGGAT\nGAAGTTGGTGGTGAGGCCCTGGGCAGGTTGGTATCAGGGCAC',
        'blastp': '>sp|P68871|HBB_HUMAN Hemoglobin subunit beta OS=Homo sapiens\nMVHLTPEEKSAVTALWGKVNVDEVGGEALGRLLVVYPWTQRFFESFGDLSTPDAVMGNPKVKAHGKKVLG\nAFSDGLAHLDNLKGTFATLSELHCDKLHVDPENFRLLGNVLVCVLAHHFGKEFTPPVQAAYQKVVAGVAN\nALAHKYH'
    };
    
    // Event Listeners
    blastForm.addEventListener('submit', submitBlastSearch);
    fileUpload.addEventListener('change', handleFileUpload);
    loadExampleBtn.addEventListener('click', loadExampleSequence);
    clearFormBtn.addEventListener('click', clearForm);
    cancelSearchBtn.addEventListener('click', cancelSearch);
    downloadResultsBtn.addEventListener('click', downloadResults);
    clearHistoryBtn.addEventListener('click', clearSearchHistory);
    programSelect.addEventListener('change', updateDatabaseOptions);
    
    // Initialize the page
    init();
    
    /**
     * Initialize the page
     */
    function init() {
        loadSearchHistory();
        updateDatabaseOptions();
    }
    
    /**
     * Update database options based on selected BLAST program
     */
    function updateDatabaseOptions() {
        const program = programSelect.value;
        databaseSelect.innerHTML = '';
        
        let options = [];
        
        if (program === 'blastn') {
            options = [
                { value: 'nt', text: 'nt - Nucleotide collection' },
                { value: 'refseq_rna', text: 'RefSeq RNA' },
                { value: 'refseq_genomic', text: 'RefSeq Genomic' },
                { value: 'est', text: 'EST - Expressed Sequence Tags' }
            ];
            wordSizeInput.value = '11';
        } else if (program === 'blastp') {
            options = [
                { value: 'nr', text: 'nr - Non-redundant protein sequences' },
                { value: 'refseq_protein', text: 'RefSeq Protein' },
                { value: 'swissprot', text: 'SwissProt' },
                { value: 'pdb', text: 'PDB protein database' }
            ];
            wordSizeInput.value = '3';
        }
        
        options.forEach(option => {
            const optionEl = document.createElement('option');
            optionEl.value = option.value;
            optionEl.textContent = option.text;
            databaseSelect.appendChild(optionEl);
        });
    }
    
    /**
     * Submit BLAST search
     */
    async function submitBlastSearch(event) {
        event.preventDefault();
        
        // Get sequence from input or file
        let sequence = sequenceInput.value.trim();
        const file = fileUpload.files[0];
        
        // Check if either sequence or file is provided
        if (!sequence && !file) {
            showAlert('Please enter a sequence or upload a FASTA file', 'danger');
            return;
        }
        
        // Validate sequence if provided directly
        if (sequence && !isValidSequence(sequence)) {
            showAlert('Invalid sequence format. Please enter a valid FASTA format or raw sequence.', 'danger');
            return;
        }
        
        // Prepare form data
        const formData = new FormData();
        
        // Handle file or text input, but not both to avoid confusion
        if (file) {
            formData.append('fastaFile', file);
            console.log('Uploading file:', file.name, file.size, 'bytes');
        } else if (sequence) {
            formData.append('sequence', sequence);
            console.log('Using text sequence input, length:', sequence.length);
        }
        
        // Add other parameters
        formData.append('program', programSelect.value);
        formData.append('database', databaseSelect.value);
        formData.append('evalue', evalueInput.value);
        formData.append('wordSize', wordSizeInput.value);
        formData.append('maxResults', maxResultsInput.value);
        
        // Show status container
        showStatusContainer('Submitting job to NCBI BLAST...');
        
        try {
            // Submit the search with proper Content-Type (browser will set it automatically for FormData)
            const response = await fetch('/blast-wrapper/submit', {
                method: 'POST',
                body: formData,
                // Do NOT set Content-Type header manually here - let the browser handle it for multipart/form-data
            });
            
            // Check if response is OK before parsing JSON
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Server response error:', errorText);
                
                try {
                    // Try to parse as JSON if possible
                    const errorJson = JSON.parse(errorText);
                    throw new Error(errorJson.error || errorJson.message || 'Server error');
                } catch (jsonError) {
                    // If not JSON or parsing fails, use status text
                    throw new Error(`Server error: ${response.status} ${response.statusText}`);
                }
            }
            
            // Parse JSON response
            const data = await response.json();
            
            if (data.success && data.rid) {
                // Store the RID and start polling for results
                currentRid = data.rid;
                startPolling(currentRid, data.estimatedTime || 60);
                
                // Save to history
                saveToHistory({
                    rid: data.rid,
                    program: programSelect.value,
                    database: databaseSelect.value,
                    sequence: sequence ? 
                        (sequence.length > 100 ? sequence.substring(0, 100) + '...' : sequence) : 
                        `Uploaded file: ${file.name}`,
                    timestamp: new Date().toISOString()
                });
                
                // Update NCBI link
                updateNCBILink(currentRid);
            } else {
                throw new Error(data.error || 'Invalid response from server');
            }
        } catch (error) {
            console.error('Error submitting BLAST search:', error);
            showAlert(`Failed to submit BLAST search: ${error.message}`, 'danger');
            hideStatusContainer();
        }
    }
    
    /**
     * Start polling for BLAST results
     */
    function startPolling(rid, estimatedTime) {
        if (pollingTimer) {
            clearTimeout(pollingTimer);
        }
        
        startTime = Date.now();
        const totalTime = estimatedTime * 1000;
        
        updateProgress(0, totalTime);
        showStatusContainer(`Searching... (estimated time: ${estimatedTime}s)`);
        
        checkResults(rid, totalTime);
    }
    
    /**
     * Check BLAST results
     */
    async function checkResults(rid, totalTime) {
        try {
            const response = await fetch(`/blast-wrapper/results/${rid}`);
            
            // Check if response is OK before parsing JSON
            if (!response.ok) {
                const errorText = await response.text();
                console.error('Server response error:', errorText);
                
                try {
                    // Try to parse as JSON if possible
                    const errorJson = JSON.parse(errorText);
                    throw new Error(errorJson.error || errorJson.message || 'Server error');
                } catch (jsonError) {
                    // If not JSON or parsing fails, use status text
                    throw new Error(`Server error: ${response.status} ${response.statusText}`);
                }
            }
            
            const data = await response.json();
            
            const elapsedTime = Date.now() - startTime;
            const progressPercent = Math.min(100, Math.round((elapsedTime / totalTime) * 100));
            
            updateProgress(progressPercent, totalTime);
            
            if (data.status === 'completed') {
                // Results are ready
                searchResults = data.results;
                displayResults(data.results);
                hideStatusContainer();
                showResultsContainer();
            } else if (data.status === 'running') {
                // Still running, continue polling
                statusMessage.textContent = `Job running... (${progressPercent}% estimated progress)`;
                
                if (elapsedTime < MAX_PROGRESS_TIME) {
                    pollingTimer = setTimeout(() => checkResults(rid, totalTime), POLLING_INTERVAL);
                } else {
                    // Taking too long, give user the option to continue or cancel
                    showStatusContainer('Search is taking longer than expected. You can wait or cancel and try again.');
                    updateProgress(95, totalTime);
                    pollingTimer = setTimeout(() => checkResults(rid, totalTime), POLLING_INTERVAL);
                }
            } else if (data.status === 'failed') {
                // Search failed
                throw new Error('BLAST search failed. Please try again with different parameters.');
            } else if (data.status === 'not_found') {
                // RID not found
                throw new Error('BLAST search not found. It may have expired or been cancelled.');
            } else if (data.status === 'error') {
                // API error
                throw new Error(data.error || data.message || 'Error retrieving BLAST results');
            } else {
                // Unknown status
                console.warn('Unknown status from BLAST server:', data);
                statusMessage.textContent = 'Waiting for BLAST server response...';
                pollingTimer = setTimeout(() => checkResults(rid, totalTime), POLLING_INTERVAL);
            }
        } catch (error) {
            console.error('Error checking BLAST results:', error);
            showAlert(error.message, 'danger');
            hideStatusContainer();
        }
    }
    
    /**
     * Update progress bar
     */
    function updateProgress(percent, totalTime) {
        jobProgress.style.width = `${percent}%`;
        jobProgress.setAttribute('aria-valuenow', percent);
        
        if (percent < 33) {
            jobProgress.classList.remove('bg-warning', 'bg-success');
            jobProgress.classList.add('bg-primary');
        } else if (percent < 66) {
            jobProgress.classList.remove('bg-primary', 'bg-success');
            jobProgress.classList.add('bg-warning');
        } else {
            jobProgress.classList.remove('bg-primary', 'bg-warning');
            jobProgress.classList.add('bg-success');
        }
    }
    
    /**
     * Display BLAST results
     */
    function displayResults(results) {
        console.log('Displaying BLAST results:', results);
        
        // Clear previous results
        hitsContainer.innerHTML = '';
        graphicalOverview.innerHTML = '';
        sequences = [];
        
        // Check if we have raw data (string) or parsed JSON
        if (results.rawData) {
            // Handle raw text data from NCBI
            console.log('Received raw data format from NCBI');
            
            const rawData = results.rawData;
            
            // Try to extract basic information
            hitsContainer.innerHTML = `
                <div class="alert alert-info">
                    <h5>BLAST Results Available</h5>
                    <p>The results are available in text format. You can view them on NCBI using the link below.</p>
                    <p><a href="https://blast.ncbi.nlm.nih.gov/Blast.cgi?CMD=Get&RID=${currentRid}" 
                        target="_blank" class="btn btn-primary">
                        <i class="fas fa-external-link-alt"></i> View Results on NCBI
                    </a></p>
                </div>
                <div class="card">
                    <div class="card-header">Raw Response</div>
                    <div class="card-body">
                        <pre class="raw-response">${escapeHtml(rawData.substring(0, 5000))}${rawData.length > 5000 ? '...' : ''}</pre>
                    </div>
                </div>
            `;
            return;
        }
        
        // Check for BlastOutput2 format
        if (results.BlastOutput2) {
            try {
                const report = results.BlastOutput2[0].report;
                const program = report.program || 'blastn';
                const queryDef = report.results.search.query_title || 'Query';
                const queryLen = report.results.search.query_len || 0;
                const hits = report.results.search.hits || [];
                
                // Display summary
                const summaryHTML = `
                    <div class="alert alert-success mb-4">
                        <h5>BLAST Search Completed</h5>
                        <dl class="row mb-0">
                            <dt class="col-sm-3">Query:</dt>
                            <dd class="col-sm-9">${escapeHtml(queryDef)}</dd>
                            <dt class="col-sm-3">Length:</dt>
                            <dd class="col-sm-9">${queryLen} bp</dd>
                            <dt class="col-sm-3">Hits:</dt>
                            <dd class="col-sm-9">${hits.length}</dd>
                        </dl>
                    </div>
                `;
                
                hitsContainer.innerHTML = summaryHTML;
                
                // No hits?
                if (hits.length === 0) {
                    hitsContainer.innerHTML += `
                        <div class="alert alert-warning">
                            <i class="fas fa-exclamation-triangle"></i> No significant matches found.
                        </div>
                    `;
                    return;
                }
                
                // Add query sequence for MSA
                sequences.push({
                    id: 'query',
                    name: 'Query',
                    seq: report.results.search.query_seq || ''
                });
                
                // Process each hit
                hits.forEach((hit, index) => {
                    const hitHTML = displayHit(hit, index);
                    hitsContainer.innerHTML += hitHTML;
                    
                    // Add hit sequence for MSA if available
                    const hsps = hit.hsps || [];
                    if (hsps.length > 0) {
                        sequences.push({
                            id: `hit_${index}`,
                            name: hit.description[0].accession || `Hit ${index + 1}`,
                            seq: hsps[0].hit_seq || ''
                        });
                    }
                });
                
                // Initialize MSA viewer if we have sequences
                if (sequences.length > 1) {
                    initMSAViewer(sequences);
                } else {
                    document.getElementById('msa-tab').classList.add('disabled');
                }
                
                return;
            } catch (error) {
                console.error('Error parsing BlastOutput2 format:', error);
                // Fall through to generic display
            }
        }
        
        // Generic display for unknown format
        hitsContainer.innerHTML = `
            <div class="alert alert-warning">
                <h5>Results Available</h5>
                <p>The results format is not fully supported for detailed visualization. 
                   You can view them on NCBI using the link below.</p>
                <p><a href="https://blast.ncbi.nlm.nih.gov/Blast.cgi?CMD=Get&RID=${currentRid}" 
                    target="_blank" class="btn btn-primary">
                    <i class="fas fa-external-link-alt"></i> View Results on NCBI
                </a></p>
            </div>
            <div class="card">
                <div class="card-header">Response Data</div>
                <div class="card-body">
                    <pre>${escapeHtml(JSON.stringify(results, null, 2))}</pre>
                </div>
            </div>
        `;
    }
    
    /**
     * Escape HTML special characters
     */
    function escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
    
    /**
     * Display a single BLAST hit
     */
    function displayHit(hit, index) {
        // Extract hit information
        const description = hit.description && hit.description.length > 0 ? hit.description[0] : {};
        const title = description.title || 'Unknown';
        const accession = description.accession || '';
        const hsps = hit.hsps || [];
        
        if (hsps.length === 0) {
            return ''; // No HSPs to display
        }
        
        // Get the best HSP (first one)
        const hsp = hsps[0];
        const evalue = hsp.evalue || 0;
        const identity = hsp.identity || 0;
        const alignLen = hsp.align_len || 0;
        const queryFrom = hsp.query_from || 0;
        const queryTo = hsp.query_to || 0;
        const hitFrom = hsp.hit_from || 0;
        const hitTo = hsp.hit_to || 0;
        const positives = hsp.positives || 0;
        const gaps = hsp.gaps || 0;
        const score = hsp.bit_score || 0;
        
        // Calculate identity percentage
        const identityPercent = alignLen > 0 ? ((identity / alignLen) * 100).toFixed(1) : 0;
        
        // Determine class based on identity percentage
        let hitClass = 'secondary';
        if (identityPercent >= 90) {
            hitClass = 'success';
        } else if (identityPercent >= 70) {
            hitClass = 'primary';
        } else if (identityPercent >= 50) {
            hitClass = 'info';
        } else if (identityPercent >= 30) {
            hitClass = 'warning';
        }
        
        // Format the alignment
        let alignmentHTML = '';
        if (hsp.qseq && hsp.hseq && hsp.midline) {
            alignmentHTML = `
                <div class="alignment-view">
                    <div>Query ${queryFrom} ${hsp.qseq} ${queryTo}</div>
                    <div>${hsp.midline}</div>
                    <div>Sbjct ${hitFrom} ${hsp.hseq} ${hitTo}</div>
                </div>
            `;
        }
        
        // Build the hit HTML
        return `
            <div class="blast-hit" id="hit-${index}">
                <div class="hit-header bg-${hitClass} text-white">
                    <div>
                        <strong>${index + 1}.</strong> ${title}
                    </div>
                    <div>
                        Score: ${score} bits
                    </div>
                </div>
                <div class="hit-details">
                    <div>Accession: <a href="https://www.ncbi.nlm.nih.gov/protein/${accession}" target="_blank">${accession}</a></div>
                    <div>E-value: ${evalue}</div>
                    <div>Identity: ${identity}/${alignLen} (${identityPercent}%)</div>
                    <div>Positives: ${positives}/${alignLen} (${alignLen > 0 ? ((positives / alignLen) * 100).toFixed(1) : 0}%)</div>
                    <div>Gaps: ${gaps}/${alignLen} (${alignLen > 0 ? ((gaps / alignLen) * 100).toFixed(1) : 0}%)</div>
                </div>
                ${alignmentHTML}
            </div>
        `;
    }
    
    /**
     * Initialize MSA Viewer
     */
    function initMSAViewer(sequences) {
        // Clear the container
        msaViewerContainer.innerHTML = '';
        
        // Check if we have the MSA library
        if (!window.msa) {
            const errorEl = document.createElement('div');
            errorEl.className = 'alert alert-danger';
            errorEl.textContent = 'MSA Viewer library not loaded. Please check your internet connection.';
            msaViewerContainer.appendChild(errorEl);
            return;
        }
        
        try {
            // Convert sequences to format expected by MSA Viewer
            const msaSeqs = sequences.map((seq, i) => {
                return {
                    name: seq.id,
                    id: i,
                    seq: seq.seq
                };
            });
            
            // Create MSA Viewer instance
            const opts = {
                el: msaViewerContainer,
                vis: {
                    conserv: false,
                    overviewbox: true,
                    seqlogo: true
                },
                zoomer: {
                    labelNameLength: 100,
                    alignmentHeight: 225,
                    rowHeight: 25
                }
            };
            
            const m = new msa.msa(opts);
            
            // Add sequences
            m.seqs.reset(msaSeqs);
            
            // Render
            m.render();
        } catch (error) {
            console.error('Error initializing MSA Viewer:', error);
            const errorEl = document.createElement('div');
            errorEl.className = 'alert alert-danger';
            errorEl.textContent = 'Error initializing MSA Viewer: ' + error.message;
            msaViewerContainer.appendChild(errorEl);
        }
    }
    
    /**
     * Update the NCBI link
     */
    function updateNCBILink(rid) {
        ncbiLink.href = `https://blast.ncbi.nlm.nih.gov/Blast.cgi?CMD=Get&RID=${rid}`;
    }
    
    /**
     * Cancel the current BLAST search
     */
    function cancelSearch() {
        if (pollingTimer) {
            clearTimeout(pollingTimer);
            pollingTimer = null;
        }
        
        currentRid = null;
        hideStatusContainer();
        showAlert('BLAST search cancelled', 'info');
    }
    
    /**
     * Download results
     */
    function downloadResults() {
        if (!searchResults) {
            showAlert('No results to download', 'warning');
            return;
        }
        
        try {
            // Create a download link
            const resultsStr = typeof searchResults === 'string' ? 
                searchResults : JSON.stringify(searchResults, null, 2);
            
            const blob = new Blob([resultsStr], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `blast_results_${currentRid || Date.now()}.txt`;
            a.click();
            
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error downloading results:', error);
            showAlert('Error downloading results: ' + error.message, 'danger');
        }
    }
    
    /**
     * Handle file upload
     */
    function handleFileUpload(event) {
        const file = event.target.files[0];
        
        if (!file) {
            return;
        }
        
        const reader = new FileReader();
        
        reader.onload = function(e) {
            sequenceInput.value = e.target.result;
        };
        
        reader.onerror = function() {
            showAlert('Error reading file', 'danger');
        };
        
        reader.readAsText(file);
    }
    
    /**
     * Load example sequence
     */
    function loadExampleSequence() {
        const program = programSelect.value;
        sequenceInput.value = exampleSequences[program] || '';
    }
    
    /**
     * Clear the form
     */
    function clearForm() {
        sequenceInput.value = '';
        fileUpload.value = '';
        evalueInput.value = '0.01';
        wordSizeInput.value = programSelect.value === 'blastn' ? '11' : '3';
        maxResultsInput.value = '50';
    }
    
    /**
     * Save search to history
     */
    function saveToHistory(search) {
        let history = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || '[]');
        
        // Add new search to beginning of array
        history.unshift(search);
        
        // Limit history size
        if (history.length > MAX_HISTORY_ITEMS) {
            history = history.slice(0, MAX_HISTORY_ITEMS);
        }
        
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
        
        // Update UI
        loadSearchHistory();
    }
    
    /**
     * Load search history
     */
    function loadSearchHistory() {
        const history = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || '[]');
        
        searchHistory.innerHTML = '';
        
        if (history.length === 0) {
            searchHistory.innerHTML = '<p class="text-muted">No recent searches</p>';
            return;
        }
        
        history.forEach(search => {
            const historyItem = document.createElement('div');
            historyItem.className = 'search-history-item';
            
            // Format timestamp
            const date = new Date(search.timestamp);
            const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
            
            historyItem.innerHTML = `
                <div><strong>${search.program}</strong> against <strong>${search.database}</strong></div>
                <div class="text-muted small">${formattedDate}</div>
                <div class="text-truncate small sequence-preview">${search.sequence}</div>
            `;
            
            historyItem.addEventListener('click', () => {
                loadHistoryItem(search);
            });
            
            searchHistory.appendChild(historyItem);
        });
    }
    
    /**
     * Load history item
     */
    function loadHistoryItem(search) {
        // Set form values
        programSelect.value = search.program;
        updateDatabaseOptions();
        databaseSelect.value = search.database;
        
        // If we have the full sequence, use it
        if (!search.sequence.includes('...')) {
            sequenceInput.value = search.sequence;
        }
        
        // Check if we can load results directly using RID
        if (search.rid) {
            currentRid = search.rid;
            startPolling(search.rid, 10);
            updateNCBILink(search.rid);
        }
    }
    
    /**
     * Clear search history
     */
    function clearSearchHistory() {
        if (confirm('Are you sure you want to clear your search history?')) {
            localStorage.removeItem(HISTORY_STORAGE_KEY);
            loadSearchHistory();
        }
    }
    
    /**
     * Validate sequence format
     */
    function isValidSequence(sequence) {
        sequence = sequence.trim();
        
        // Check if it's FASTA format
        if (sequence.startsWith('>')) {
            // FASTA format, validate it has sequence after the header
            const lines = sequence.split('\n');
            if (lines.length < 2) {
                return false;
            }
            
            // Combine all non-header lines
            const seqLines = lines.slice(1).join('').trim();
            return seqLines.length > 0;
        } else {
            // Raw sequence, check if it contains valid nucleotide or protein characters
            const validNucleotides = /^[ACGTURYKMSWBDHVN\s]+$/i;
            const validAminoAcids = /^[ACDEFGHIKLMNPQRSTVWY\s]+$/i;
            
            return validNucleotides.test(sequence) || validAminoAcids.test(sequence);
        }
    }
    
    /**
     * Extract sequence from FASTA format
     */
    function extractSequenceFromFasta(fasta) {
        fasta = fasta.trim();
        
        if (fasta.startsWith('>')) {
            // FASTA format
            const lines = fasta.split('\n');
            if (lines.length < 2) {
                return '';
            }
            
            // Combine all non-header lines
            return lines.slice(1).join('').replace(/\s/g, '');
        } else {
            // Raw sequence
            return fasta.replace(/\s/g, '');
        }
    }
    
    /**
     * Show status container
     */
    function showStatusContainer(message) {
        statusContainer.style.display = 'block';
        jobStatus.textContent = 'Running';
        statusMessage.textContent = message;
    }
    
    /**
     * Hide status container
     */
    function hideStatusContainer() {
        statusContainer.style.display = 'none';
        if (pollingTimer) {
            clearTimeout(pollingTimer);
            pollingTimer = null;
        }
    }
    
    /**
     * Show results container
     */
    function showResultsContainer() {
        resultsContainer.style.display = 'block';
    }
    
    /**
     * Hide results container
     */
    function hideResultsContainer() {
        resultsContainer.style.display = 'none';
    }
    
    /**
     * Show alert message
     */
    function showAlert(message, type = 'info') {
        const alertEl = document.createElement('div');
        alertEl.className = `alert alert-${type} alert-dismissible fade show`;
        alertEl.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;
        
        // Insert at the top of the form
        blastForm.parentNode.insertBefore(alertEl, blastForm);
        
        // Auto dismiss after 5 seconds
        setTimeout(() => {
            alertEl.classList.remove('show');
            setTimeout(() => {
                alertEl.remove();
            }, 150);
        }, 5000);
    }
});