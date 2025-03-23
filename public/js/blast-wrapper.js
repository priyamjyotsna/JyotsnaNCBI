/**
 * BLAST Wrapper - Client-side JavaScript
 * Handles sequence validation, BLAST search submission, and result visualization
 */

document.addEventListener('DOMContentLoaded', function() {
    // Elements
    const searchForm = document.getElementById('blastSearchForm');
    const sequenceInput = document.getElementById('sequenceInput');
    const programSelect = document.getElementById('programSelect');
    const databaseSelect = document.getElementById('databaseSelect');
    const submitBtn = document.getElementById('submitSearch');
    const resetBtn = document.getElementById('resetForm');
    const fileUploadInput = document.getElementById('sequenceFile');
    const advancedOptionsBtn = document.getElementById('advancedOptionsToggle');
    const advancedOptionsContent = document.getElementById('advancedOptionsContent');
    const statusContainer = document.getElementById('statusContainer');
    const progressBar = document.getElementById('progressBar');
    const statusMessage = document.getElementById('statusMessage');
    const resultsContainer = document.getElementById('resultsContainer');
    const searchHistoryContainer = document.getElementById('searchHistory');
    const clearHistoryBtn = document.getElementById('clearHistory');
    
    let searchHistory = JSON.parse(localStorage.getItem('blastSearchHistory') || '[]');
    let currentRid = null;
    let pollingInterval = null;
    
    // Initialize
    renderSearchHistory();
    setupEventListeners();
    
    // Functions
    function setupEventListeners() {
        searchForm.addEventListener('submit', handleFormSubmit);
        resetBtn.addEventListener('click', resetForm);
        fileUploadInput.addEventListener('change', handleFileUpload);
        advancedOptionsBtn.addEventListener('click', toggleAdvancedOptions);
        clearHistoryBtn && clearHistoryBtn.addEventListener('click', clearSearchHistory);
        
        // Add load example button listener
        const loadExampleBtn = document.getElementById('loadExample');
        if (loadExampleBtn) {
            loadExampleBtn.addEventListener('click', loadExampleSequence);
        }
        
        // Add cancel search button listener
        const cancelSearchBtn = document.getElementById('cancelSearch');
        if (cancelSearchBtn) {
            cancelSearchBtn.addEventListener('click', cancelSearch);
        }
    }
    
    function toggleAdvancedOptions() {
        advancedOptionsContent.classList.toggle('active');
        const isExpanded = advancedOptionsContent.classList.contains('active');
        advancedOptionsBtn.innerHTML = isExpanded ? 
            '<i class="fa fa-angle-up"></i> Hide Advanced Options' : 
            '<i class="fa fa-angle-down"></i> Show Advanced Options';
    }
    
    async function handleFormSubmit(e) {
        e.preventDefault();
        
        const sequence = sequenceInput.value.trim();
        if (!sequence) {
            showAlert('Please enter a sequence or upload a file', 'danger');
            return;
        }
        
        submitBtn.disabled = true;
        
        // Get form values
        const formData = new FormData();
        formData.append('sequence', sequence);
        formData.append('program', programSelect.value);
        formData.append('database', databaseSelect.value);
        
        // Add file if present
        if (fileUploadInput.files && fileUploadInput.files.length > 0) {
            formData.append('fastaFile', fileUploadInput.files[0]);
        }
        
        // Add advanced parameters if they exist
        const evalueInput = document.getElementById('evalue');
        const wordSizeInput = document.getElementById('wordSize');
        const maxResultsInput = document.getElementById('maxResults');
        
        if (evalueInput) formData.append('evalue', evalueInput.value);
        if (wordSizeInput) formData.append('wordSize', wordSizeInput.value);
        if (maxResultsInput) formData.append('maxResults', maxResultsInput.value);
        
        try {
            showStatus('Submitting BLAST search...', 10);
            const response = await fetch('/blast-wrapper/submit', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || errorData.error || 'Failed to submit BLAST search');
            }
            
            const data = await response.json();
            if (data.rid) {
                currentRid = data.rid;
                addToSearchHistory(data.rid, sequence, programSelect.value, databaseSelect.value);
                startPolling(data.rid);
                showStatus(`Search submitted (RID: ${data.rid}). Waiting for results...`, 30);
            } else {
                throw new Error('No RID received from NCBI');
            }
        } catch (err) {
            console.error('BLAST search submission error:', err);
            
            let errorMsg = err.message;
            
            // Check for timeout messages
            if (errorMsg.includes('timeout') || errorMsg.includes('ETIMEDOUT') || errorMsg.includes('ECONNABORTED')) {
                errorMsg = 'Connection to NCBI BLAST servers timed out. Please try again later or check your internet connection.';
            }
            
            showAlert(`Error: ${errorMsg}`, 'danger');
            hideStatus();
            submitBtn.disabled = false;
        }
    }
    
    function startPolling(rid) {
        let attempts = 0;
        const maxAttempts = 120; // 10 minutes (5s intervals)
        
        pollingInterval = setInterval(async () => {
            attempts++;
            try {
                showStatus(`Checking search status (attempt ${attempts})...`, 30 + Math.min(attempts * 0.5, 50));
                
                const response = await fetch(`/blast-wrapper/status?rid=${rid}`);
                if (!response.ok) {
                    throw new Error('Failed to check search status');
                }
                
                const data = await response.json();
                
                if (data.status === 'READY') {
                    clearInterval(pollingInterval);
                    showStatus('Results ready! Fetching...', 90);
                    fetchResults(rid);
                } else if (data.status === 'FAILED') {
                    clearInterval(pollingInterval);
                    throw new Error('BLAST search failed: ' + (data.message || 'Unknown error'));
                } else if (attempts >= maxAttempts) {
                    clearInterval(pollingInterval);
                    throw new Error('Search timed out after 10 minutes');
                }
            } catch (err) {
                clearInterval(pollingInterval);
                console.error('Error checking BLAST status:', err);
                showAlert(`Error: ${err.message}`, 'danger');
                hideStatus();
                submitBtn.disabled = false;
            }
        }, 5000);
    }
    
    async function fetchResults(rid) {
        try {
            const response = await fetch(`/blast-wrapper/results?rid=${rid}`);
            if (!response.ok) {
                throw new Error('Failed to fetch BLAST results');
            }
            
            const data = await response.json();
            showStatus('Rendering results...', 100);
            
            // Update the search history item with result info
            updateSearchHistoryItem(rid, data);
            
            // Render results
            renderResults(data);
            
            setTimeout(() => {
                hideStatus();
                submitBtn.disabled = false;
                
                // Scroll to results
                resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 1000);
        } catch (err) {
            console.error('Error fetching BLAST results:', err);
            showAlert(`Error: ${err.message}`, 'danger');
            hideStatus();
            submitBtn.disabled = false;
        }
    }
    
    function renderResults(data) {
        const resultsHTML = `
        <div class="card">
            <div class="card-header">
                <h3>BLAST Results</h3>
            </div>
            <div class="tabs-container">
                <div class="tabs">
                    <button class="tab-btn active" data-tab="summary">Summary</button>
                    <button class="tab-btn" data-tab="hits">Hits (${data.hitCount || 0})</button>
                    <button class="tab-btn" data-tab="alignments">Alignments</button>
                    <button class="tab-btn" data-tab="taxonomy">Taxonomy</button>
                </div>
                <div class="tab-content">
                    <div class="tab-pane active" id="summary-tab">
                        ${renderSummaryTab(data)}
                    </div>
                    <div class="tab-pane" id="hits-tab">
                        ${renderHitsTab(data)}
                    </div>
                    <div class="tab-pane" id="alignments-tab">
                        ${renderAlignmentsTab(data)}
                    </div>
                    <div class="tab-pane" id="taxonomy-tab">
                        ${renderTaxonomyTab(data)}
                    </div>
                </div>
            </div>
            <div class="card-body">
                <div class="results-actions">
                    <button class="secondary-btn" id="downloadResults">
                        <i class="fa fa-download"></i> Download Results
                    </button>
                    <button class="primary-btn" id="newSearch">
                        <i class="fa fa-search"></i> New Search
                    </button>
                </div>
            </div>
        </div>
        `;
        
        resultsContainer.innerHTML = resultsHTML;
        
        // Set up tab switching
        document.querySelectorAll('.tab-btn').forEach(button => {
            button.addEventListener('click', function() {
                // Remove active class from all tabs and panes
                document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
                document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
                
                // Add active class to this tab and its content
                this.classList.add('active');
                document.getElementById(`${this.getAttribute('data-tab')}-tab`).classList.add('active');
            });
        });
        
        // Set up button actions
        document.getElementById('downloadResults').addEventListener('click', () => downloadResults(data));
        document.getElementById('newSearch').addEventListener('click', resetForm);
    }
    
    function renderSummaryTab(data) {
        return `
        <div class="summary-content">
            <div class="info-card">
                <h4>Query Information</h4>
                <ul>
                    <li><strong>Program:</strong> ${data.program}</li>
                    <li><strong>Database:</strong> ${data.database}</li>
                    <li><strong>Query Length:</strong> ${data.queryLength} bp</li>
                    <li><strong>RID:</strong> ${data.rid}</li>
                </ul>
            </div>
            
            <div class="info-card">
                <h4>Search Statistics</h4>
                <ul>
                    <li><strong>Total Hits:</strong> ${data.hitCount || 0}</li>
                    <li><strong>E-value Threshold:</strong> ${data.params?.expect || 10}</li>
                    <li><strong>Word Size:</strong> ${data.params?.wordSize || 'N/A'}</li>
                    <li><strong>Filter:</strong> ${data.params?.filter ? 'Yes' : 'No'}</li>
                </ul>
            </div>
        </div>
        `;
    }
    
    function renderHitsTab(data) {
        if (!data.hits || data.hits.length === 0) {
            return `<p class="empty-message">No hits found for this query.</p>`;
        }
        
        let hitsHTML = '';
        
        data.hits.forEach((hit, i) => {
            // Use different background colors based on score
            const scorePercent = Math.min(100, (hit.score / data.hits[0].score) * 100);
            let bgColor = '';
            
            if (scorePercent > 90) bgColor = '#6c5ce7';
            else if (scorePercent > 70) bgColor = '#74b9ff';
            else if (scorePercent > 50) bgColor = '#00b894';
            else if (scorePercent > 30) bgColor = '#fdcb6e';
            else bgColor = '#e17055';
            
            hitsHTML += `
            <div class="blast-hit">
                <div class="hit-header" style="background-color: ${bgColor}">
                    <h4>${hit.title || 'Unknown Sequence'}</h4>
                    <span>Score: ${hit.score}</span>
                </div>
                <div class="hit-details">
                    <div class="detail-item">
                        <span class="detail-label">Accession:</span>
                        <span class="detail-value">${hit.accession || 'N/A'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">E-value:</span>
                        <span class="detail-value">${hit.evalue}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Identity:</span>
                        <span class="detail-value">${hit.identity || 'N/A'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Coverage:</span>
                        <span class="detail-value">${hit.queryCoverage || 'N/A'}</span>
                    </div>
                </div>
            </div>
            `;
        });
        
        return hitsHTML;
    }
    
    function renderAlignmentsTab(data) {
        if (!data.alignments || data.alignments.length === 0) {
            return `<p class="empty-message">No alignment data available.</p>`;
        }
        
        let alignmentsHTML = '';
        
        data.alignments.forEach((aln, i) => {
            alignmentsHTML += `
            <div class="blast-hit">
                <div class="hit-header" style="background-color: #6c5ce7">
                    <h4>${aln.title || `Alignment ${i+1}`}</h4>
                </div>
                <div class="alignment-view">
${aln.qseq ? `Query  ${aln.qstart} ${aln.qseq} ${aln.qend}` : ''}
${aln.midline ? `       ${aln.midline}` : ''}
${aln.hseq ? `Sbjct  ${aln.hstart} ${aln.hseq} ${aln.hend}` : ''}
                </div>
            </div>
            `;
        });
        
        return alignmentsHTML;
    }
    
    function renderTaxonomyTab(data) {
        if (!data.taxonomy || data.taxonomy.length === 0) {
            return `<p class="empty-message">No taxonomy data available.</p>`;
        }
        
        let taxonomyHTML = '<ul class="taxonomy-list">';
        
        data.taxonomy.forEach(item => {
            taxonomyHTML += `
            <li class="taxonomy-item">
                <span class="taxon-name">${item.name}</span>
                <span class="taxon-rank">${item.rank}</span>
            </li>
            `;
        });
        
        taxonomyHTML += '</ul>';
        return taxonomyHTML;
    }
    
    function addToSearchHistory(rid, sequence, program, database) {
        const timestamp = new Date().toISOString();
        const entry = {
            rid,
            timestamp,
            sequence: sequence.substring(0, 30) + (sequence.length > 30 ? '...' : ''),
            program,
            database,
            hasResults: false
        };
        
        searchHistory.unshift(entry);
        
        // Limit history to 10 items
        if (searchHistory.length > 10) {
            searchHistory = searchHistory.slice(0, 10);
        }
        
        localStorage.setItem('blastSearchHistory', JSON.stringify(searchHistory));
        renderSearchHistory();
    }
    
    function updateSearchHistoryItem(rid, results) {
        const index = searchHistory.findIndex(item => item.rid === rid);
        if (index !== -1) {
            searchHistory[index].hasResults = true;
            searchHistory[index].hitCount = results.hitCount || 0;
            localStorage.setItem('blastSearchHistory', JSON.stringify(searchHistory));
            renderSearchHistory();
        }
    }
    
    function renderSearchHistory() {
        if (!searchHistoryContainer) return;
        
        if (searchHistory.length === 0) {
            searchHistoryContainer.innerHTML = `<p class="empty-message">No recent searches</p>`;
            if (clearHistoryBtn) clearHistoryBtn.style.display = 'none';
            return;
        }
        
        let historyHTML = '';
        
        searchHistory.forEach(entry => {
            const date = new Date(entry.timestamp).toLocaleString();
            historyHTML += `
            <div class="search-history-item" data-rid="${entry.rid}">
                <div>
                    <strong>${entry.program}</strong> vs ${entry.database}
                </div>
                <div class="history-sequence">${entry.sequence}</div>
                <div class="history-meta">
                    <span>${date}</span>
                    ${entry.hasResults ? `<span class="hit-count">${entry.hitCount} hits</span>` : ''}
                </div>
            </div>
            `;
        });
        
        searchHistoryContainer.innerHTML = historyHTML;
        if (clearHistoryBtn) clearHistoryBtn.style.display = 'block';
        
        // Add click event to history items
        document.querySelectorAll('.search-history-item').forEach(item => {
            item.addEventListener('click', function() {
                const rid = this.getAttribute('data-rid');
                const historyItem = searchHistory.find(entry => entry.rid === rid);
                
                if (historyItem && historyItem.hasResults) {
                    currentRid = rid;
                    showStatus('Fetching previous results...', 50);
                    fetchResults(rid);
                } else {
                    showAlert('Results for this search are no longer available', 'warning');
                }
            });
        });
    }
    
    function clearSearchHistory() {
        searchHistory = [];
        localStorage.removeItem('blastSearchHistory');
        renderSearchHistory();
        showAlert('Search history cleared', 'info');
    }
    
    async function handleFileUpload(e) {
        const file = fileUploadInput.files[0];
        if (!file) return;
        
        try {
            const text = await readFileAsText(file);
            sequenceInput.value = text;
        } catch (err) {
            console.error('Error reading file:', err);
            showAlert('Error reading file', 'danger');
        }
    }
    
    function readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = e => reject(e);
            reader.readAsText(file);
        });
    }
    
    function resetForm() {
        searchForm.reset();
        sequenceInput.value = '';
        if (pollingInterval) clearInterval(pollingInterval);
        hideStatus();
        resultsContainer.innerHTML = '';
        submitBtn.disabled = false;
    }
    
    function showStatus(message, progress) {
        statusContainer.style.display = 'block';
        statusMessage.textContent = message;
        progressBar.style.width = `${progress}%`;
    }
    
    function hideStatus() {
        statusContainer.style.display = 'none';
    }
    
    function showAlert(message, type) {
        const alertContainer = document.getElementById('alertContainer');
        if (!alertContainer) return;
        
        const alert = document.createElement('div');
        alert.className = `alert alert-${type}`;
        alert.innerHTML = `
            <span>${message}</span>
            <button class="close-alert">&times;</button>
        `;
        
        alertContainer.appendChild(alert);
        
        // Set up close button
        alert.querySelector('.close-alert').addEventListener('click', () => {
            alert.remove();
        });
        
        // Auto dismiss after 5 seconds
        setTimeout(() => {
            alert.remove();
        }, 5000);
    }
    
    function downloadResults(data) {
        const resultsText = JSON.stringify(data, null, 2);
        const blob = new Blob([resultsText], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `blast-results-${data.rid}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
    }
    
    function loadExampleSequence() {
        // Example FASTA sequence (Green Fluorescent Protein)
        const exampleSequence = ">GFP|Green_Fluorescent_Protein\nATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGACGGCGACGTAAACGGCCACAAGTTCAGCGTGTCCGGCGAGGGCGAGGGCGATGCCACCTACGGCAAGCTGACCCTGAAGTTCATCTGCACCACCGGCAAGCTGCCCGTGCCCTGGCCCACCCTCGTGACCACCCTGACCTACGGCGTGCAGTGCTTCAGCCGCTACCCCGACCACATGAAGCAGCACGACTTCTTCAAGTCCGCCATGCCCGAAGGCTACGTCCAGGAGCGCACCATCTTCTTCAAGGACGACGGCAACTACAAGACCCGCGCCGAGGTGAAGTTCGAGGGCGACACCCTGGTGAACCGCATCGAGCTGAAGGGCATCGACTTCAAGGAGGACGGCAACATCCTGGGGCACAAGCTGGAGTACAACTACAACAGCCACAACGTCTATATCATGGCCGACAAGCAGAAGAACGGCATCAAGGTGAACTTCAAGATCCGCCACAACATCGAGGACGGCAGCGTGCAGCTCGCCGACCACTACCAGCAGAACACCCCCATCGGCGACGGCCCCGTGCTGCTGCCCGACAACCACTACCTGAGCACCCAGTCCGCCCTGAGCAAAGACCCCAACGAGAAGCGCGATCACATGGTCCTGCTGGAGTTCGTGACCGCCGCCGGGATCACTCTCGGCATGGACGAGCTGTACAAGTAA";
        
        sequenceInput.value = exampleSequence;
        
        // Set default selection for protein example
        if (programSelect.value === 'blastp') {
            databaseSelect.value = 'nr';
        } else {
            programSelect.value = 'blastn';
            databaseSelect.value = 'nt';
        }
    }
    
    function cancelSearch() {
        if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
        }
        
        hideStatus();
        submitBtn.disabled = false;
        showAlert('Search cancelled', 'info');
    }
});