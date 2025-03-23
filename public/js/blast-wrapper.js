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
        
        if (!sequence) {
            showAlert('Please enter a sequence or upload a FASTA file', 'danger');
            return;
        }
        
        // Validate sequence format
        if (!isValidSequence(sequence)) {
            showAlert('Invalid sequence format. Please enter a valid FASTA format or raw sequence.', 'danger');
            return;
        }
        
        // Prepare form data
        const formData = new FormData();
        formData.append('sequence', sequence);
        formData.append('program', programSelect.value);
        formData.append('database', databaseSelect.value);
        formData.append('evalue', evalueInput.value);
        formData.append('wordSize', wordSizeInput.value);
        formData.append('maxResults', maxResultsInput.value);
        
        // Show status container
        showStatusContainer('Submitting job to NCBI BLAST...');
        
        try {
            // Submit the search
            const response = await fetch('/blast-wrapper/submit', {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Failed to submit BLAST search');
            }
            
            if (data.success && data.rid) {
                // Store the RID and start polling for results
                currentRid = data.rid;
                startPolling(currentRid, data.estimatedTime || 60);
                
                // Save to history
                saveToHistory({
                    rid: data.rid,
                    program: programSelect.value,
                    database: databaseSelect.value,
                    sequence: sequence.length > 100 ? 
                        (sequence.substring(0, 100) + '...') : sequence,
                    timestamp: new Date().toISOString()
                });
                
                // Update NCBI link
                updateNCBILink(currentRid);
            } else {
                throw new Error('Invalid response from server');
            }
        } catch (error) {
            console.error('Error submitting BLAST search:', error);
            showAlert(error.message, 'danger');
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
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Failed to retrieve BLAST results');
            }
            
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
            } else {
                // Unknown status
                throw new Error('Unknown status from BLAST server. Please try again.');
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
        if (!results) {
            showAlert('No results to display', 'warning');
            return;
        }
        
        try {
            // Parse the JSON results if they're in string format
            if (typeof results === 'string') {
                if (results.startsWith('{')) {
                    results = JSON.parse(results);
                } else {
                    // Handle text format results
                    displayTextResults(results);
                    return;
                }
            }
            
            // Clear previous results
            hitsContainer.innerHTML = '';
            graphicalOverview.innerHTML = '';
            msaViewerContainer.innerHTML = '';
            
            // Initialize an array to store sequences for MSA
            sequences = [];
            
            // Add query sequence to the array
            if (sequenceInput.value) {
                const querySeq = extractSequenceFromFasta(sequenceInput.value);
                if (querySeq) {
                    sequences.push({
                        id: 'Query',
                        seq: querySeq
                    });
                }
            }
            
            // If results are in HTML format, handle differently
            if (results.includes && results.includes('<html>')) {
                displayHtmlResults(results);
                return;
            }
            
            // Display summary information
            const summaryEl = document.createElement('div');
            summaryEl.className = 'alert alert-success';
            summaryEl.innerHTML = `<strong>BLAST search complete!</strong> Program: ${programSelect.value}, Database: ${databaseSelect.value}`;
            hitsContainer.appendChild(summaryEl);
            
            // Process and display hits
            if (results.BlastOutput2 && results.BlastOutput2[0] && 
                results.BlastOutput2[0].report && 
                results.BlastOutput2[0].report.results && 
                results.BlastOutput2[0].report.results.search && 
                results.BlastOutput2[0].report.results.search.hits) {
                
                const hits = results.BlastOutput2[0].report.results.search.hits;
                
                if (hits.length === 0) {
                    const noHitsEl = document.createElement('div');
                    noHitsEl.className = 'alert alert-warning';
                    noHitsEl.textContent = 'No significant matches found. Try adjusting your search parameters.';
                    hitsContainer.appendChild(noHitsEl);
                } else {
                    hits.forEach((hit, index) => {
                        displayHit(hit, index);
                    });
                    
                    // Initialize MSA viewer
                    if (sequences.length > 1) {
                        initMSAViewer(sequences);
                    } else {
                        const noMsaEl = document.createElement('div');
                        noMsaEl.className = 'alert alert-info';
                        noMsaEl.textContent = 'Multiple sequence alignment requires at least 2 sequences.';
                        msaViewerContainer.appendChild(noMsaEl);
                    }
                }
            } else {
                const errorEl = document.createElement('div');
                errorEl.className = 'alert alert-danger';
                errorEl.textContent = 'Invalid or unexpected result format from BLAST server.';
                hitsContainer.appendChild(errorEl);
                console.error('Invalid results format:', results);
            }
        } catch (error) {
            console.error('Error displaying results:', error);
            showAlert('Error displaying results: ' + error.message, 'danger');
        }
    }
    
    /**
     * Display a single BLAST hit
     */
    function displayHit(hit, index) {
        const hitDiv = document.createElement('div');
        hitDiv.className = 'blast-hit';
        
        // Get the description and score from the hit
        const description = hit.description[0].title || 'Unknown sequence';
        const accession = hit.description[0].accession || '';
        const hsps = hit.hsps[0];
        const score = hsps.bit_score || 0;
        const evalue = hsps.evalue || 0;
        const identity = hsps.identity || 0;
        const querySeq = hsps.qseq || '';
        const hitSeq = hsps.hseq || '';
        const alignLength = hsps.align_len || 0;
        
        // Calculate percent identity
        const percentIdentity = alignLength > 0 ? Math.round((identity / alignLength) * 100) : 0;
        
        // Create hit header
        const hitHeader = document.createElement('div');
        hitHeader.className = 'hit-header';
        hitHeader.innerHTML = `
            <div>
                <strong>${index + 1}. ${description}</strong>
                <small class="d-block text-muted">Accession: ${accession}</small>
            </div>
            <div>
                <span class="badge bg-primary">${score.toFixed(1)} bits</span>
                <span class="badge bg-secondary">E: ${evalue.toExponential(2)}</span>
            </div>
        `;
        
        // Create hit details
        const hitDetails = document.createElement('div');
        hitDetails.className = 'hit-details';
        hitDetails.innerHTML = `
            <div><strong>Identity:</strong> ${percentIdentity}% (${identity}/${alignLength})</div>
            <div><strong>Score:</strong> ${score.toFixed(1)} bits</div>
            <div><strong>E-value:</strong> ${evalue.toExponential(2)}</div>
            <div><strong>Length:</strong> ${alignLength}</div>
        `;
        
        // Create alignment view
        const alignmentView = document.createElement('div');
        alignmentView.className = 'alignment-view';
        
        // Format the alignment display
        let midline = '';
        for (let i = 0; i < querySeq.length; i++) {
            if (querySeq[i] === hitSeq[i]) {
                midline += '|';
            } else if (querySeq[i] === ' ' || hitSeq[i] === ' ') {
                midline += ' ';
            } else {
                midline += '.';
            }
        }
        
        alignmentView.textContent = `Query: ${querySeq}\n       ${midline}\nSbjct: ${hitSeq}`;
        
        // Add elements to hit div
        hitDiv.appendChild(hitHeader);
        hitDiv.appendChild(hitDetails);
        hitDiv.appendChild(alignmentView);
        
        // Add to hits container
        hitsContainer.appendChild(hitDiv);
        
        // Add sequence to array for MSA
        if (hitSeq) {
            sequences.push({
                id: `Hit ${index + 1} (${accession})`,
                seq: hitSeq.replace(/-/g, '')
            });
        }
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
     * Display HTML results
     */
    function displayHtmlResults(html) {
        // Create an iframe to display the HTML
        const iframe = document.createElement('iframe');
        iframe.style.width = '100%';
        iframe.style.height = '600px';
        iframe.style.border = 'none';
        
        // Append the iframe
        hitsContainer.innerHTML = '';
        hitsContainer.appendChild(iframe);
        
        // Set the HTML content
        const doc = iframe.contentWindow.document;
        doc.open();
        doc.write(html);
        doc.close();
    }
    
    /**
     * Display text results
     */
    function displayTextResults(text) {
        // Create a pre element for the text
        const pre = document.createElement('pre');
        pre.className = 'text-results';
        pre.style.maxHeight = '600px';
        pre.style.overflow = 'auto';
        pre.style.whiteSpace = 'pre-wrap';
        pre.style.fontFamily = 'monospace';
        pre.style.fontSize = '0.8rem';
        pre.textContent = text;
        
        // Append the pre
        hitsContainer.innerHTML = '';
        hitsContainer.appendChild(pre);
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