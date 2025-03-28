document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const LARGE_SEQUENCE_THRESHOLD = 50000;
    const allMutations = document.getElementById('allMutations');
    const substitutionMutations = document.getElementById('substitutionMutations');
    const insertionMutations = document.getElementById('insertionMutations');
    const deletionMutations = document.getElementById('deletionMutations');



    const referenceDropzone = document.getElementById('referenceDropzone');
    const queryDropzone = document.getElementById('queryDropzone');
    const referenceFileInput = document.getElementById('referenceFileInput');
    const queryFileInput = document.getElementById('queryFileInput');
    const referenceAccession = document.getElementById('referenceAccession');
    const queryAccession = document.getElementById('queryAccession');
    const fetchReferenceBtn = document.getElementById('fetchReferenceBtn');
    const fetchQueryBtn = document.getElementById('fetchQueryBtn');
    const referenceStatus = document.getElementById('referenceStatus');
    const queryStatus = document.getElementById('queryStatus');
    const compareBtn = document.getElementById('compareBtn');
    const clearBtn = document.getElementById('clearBtn');
    const resultsSection = document.getElementById('resultsSection');
    


    // State variables
    let referenceSequence = null;
    let querySequence = null;
    let comparisonResults = null;
    
    // Initialize dropzone functionality
    initializeDropzone(referenceDropzone, referenceFileInput, processReferenceFile);
    initializeDropzone(queryDropzone, queryFileInput, processQueryFile);
    
    


    // Export functionality removed
    
    // Update the fetchSequenceFromNCBI function
    // Update the fetch URL to match your Express route
// Replace your existing fetchSequenceFromNCBI function in sequence-comparison.js with this:
async function handleLargeSequence(sequence, type, filename) {
    console.log('DEBUG: Entering handleLargeSequence');
    console.log('DEBUG: Sequence length:', sequence.sequence.length);
    console.log('DEBUG: Type:', type);
    console.log('DEBUG: LARGE_SEQUENCE_THRESHOLD:', LARGE_SEQUENCE_THRESHOLD);
    
    try {
        // Remove any existing modals first
        const existingModal = document.querySelector('.sequence-modal');
        if (existingModal) {
            document.body.removeChild(existingModal);
        }

        if (sequence.sequence.length > LARGE_SEQUENCE_THRESHOLD) {
            console.log('DEBUG: Large sequence detected, showing modal');
            document.body.style.overflow = 'hidden'; // Prevent background scrolling
            
            const choice = await showLargeSequenceModal(sequence.sequence.length);
            console.log('DEBUG: Modal choice:', choice);
            
            switch (choice) {
                case 'server':
                    if (type === 'reference') {
                        referenceSequence = { ...sequence, processOnServer: true };
                        referenceStatus.innerHTML = `<span class="status-success">✓</span> Loaded: ${filename} (${sequence.sequence.length} bp) - Will process on server`;
                    } else {
                        querySequence = { ...sequence, processOnServer: true };
                        queryStatus.innerHTML = `<span class="status-success">✓</span> Loaded: ${filename} (${sequence.sequence.length} bp) - Will process on server`;
                    }
                    break;
                case 'browser':
                    if (type === 'reference') {
                        referenceSequence = sequence;
                        referenceStatus.innerHTML = `<span class="status-warning">⚠</span> Loaded: ${filename} (${sequence.sequence.length} bp) - Large sequence`;
                    } else {
                        querySequence = sequence;
                        queryStatus.innerHTML = `<span class="status-warning">⚠</span> Loaded: ${filename} (${sequence.sequence.length} bp) - Large sequence`;
                    }
                    break;
                case 'cancel':
                    if (type === 'reference') {
                        referenceSequence = null;
                        referenceStatus.innerHTML = 'Operation cancelled';
                    } else {
                        querySequence = null;
                        queryStatus.innerHTML = 'Operation cancelled';
                    }
                    break;
            }
        } else {
            console.log('DEBUG: Normal size sequence, processing directly');
            if (type === 'reference') {
                referenceSequence = sequence;
                referenceStatus.innerHTML = `<span class="status-success">✓</span> Loaded: ${filename} (${sequence.sequence.length} bp)`;
            } else {
                querySequence = sequence;
                queryStatus.innerHTML = `<span class="status-success">✓</span> Loaded: ${filename} (${sequence.sequence.length} bp)`;
            }
        }
    } catch (error) {
        console.error('Error in handleLargeSequence:', error);
        const statusElement = type === 'reference' ? referenceStatus : queryStatus;
        statusElement.innerHTML = `<span class="status-error">✗</span> Error processing sequence: ${error.message}`;
        if (type === 'reference') referenceSequence = null;
        else querySequence = null;
    } finally {
        // Cleanup: ensure modal and body overflow are properly reset
        const modal = document.querySelector('.sequence-modal');
        if (modal) {
            document.body.removeChild(modal);
        }
        document.body.style.overflow = '';
        updateCompareButtonState();
    }
}


function showLargeSequenceModal(sequenceLength) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'sequence-modal';  // Changed from 'modal' to match cleanup selector
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        modal.style.display = 'flex';
        modal.style.justifyContent = 'center';
        modal.style.alignItems = 'center';
        modal.style.zIndex = '9999';
        
        modal.innerHTML = `
            <div class="modal-content" style="background-color: white; padding: 20px; border-radius: 8px; max-width: 500px; width: 90%; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);">
                <h2>Large Sequence Detected</h2>
                <p>The sequence you've loaded is ${(sequenceLength/1000).toFixed(1)}kb in length, which may impact browser performance.</p>
                <div class="modal-options" style="display: flex; gap: 10px; margin: 20px 0; justify-content: center;">
                    <button class="server-option" style="background-color: #4285f4; color: white; border: none; border-radius: 4px; padding: 8px 16px; cursor: pointer;">Process on Server</button>
                    <button class="browser-option" style="background-color: #34a853; color: white; border: none; border-radius: 4px; padding: 8px 16px; cursor: pointer;">Continue in Browser</button>
                    <button class="cancel-option" style="background-color: #ea4335; color: white; border: none; border-radius: 4px; padding: 8px 16px; cursor: pointer;">Cancel</button>
                </div>
                <p class="modal-info" style="font-size: 0.9em; color: #666; margin-top: 10px; text-align: center;">
                    Server processing is recommended for sequences larger than 50kb.
                    ${sequenceLength > 500000 ? '<br>Note: Sequences over 500kb will be queued for processing.' : ''}
                </p>
            </div>
        `;

        document.body.appendChild(modal);

        // Prevent clicks from bubbling up from the modal content
        modal.querySelector('.modal-content').addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // Close modal on background click
        modal.addEventListener('click', () => {
            document.body.removeChild(modal);
            resolve('cancel');
        });

        modal.querySelector('.server-option').onclick = () => {
            document.body.removeChild(modal);
            resolve('server');
        };
        modal.querySelector('.browser-option').onclick = () => {
            document.body.removeChild(modal);
            resolve('browser');
        };
        modal.querySelector('.cancel-option').onclick = () => {
            document.body.removeChild(modal);
            resolve('cancel');
        };
    });
}

function fetchSequenceFromNCBI(accessionId, type) {
    const statusElement = type === 'reference' ? referenceStatus : queryStatus;
    statusElement.innerHTML = '<span class="status-loading">⟳</span> Fetching from NCBI...';
    
    // Add a timeout indicator
    const timeoutDiv = document.createElement('div');
    timeoutDiv.className = 'timeout-message';
    timeoutDiv.innerHTML = 'Fetching sequence data...';
    statusElement.appendChild(timeoutDiv);
    
    // Add a progress indicator that updates every second
    let seconds = 0;
    const progressInterval = setInterval(() => {
        seconds++;
        timeoutDiv.innerHTML = `Fetching sequence data... (${seconds}s)`;
        if (seconds >= 30) {
            timeoutDiv.innerHTML = `Still working... NCBI API might be slow today`;
        }
    }, 1000);
    
    // First try the working endpoint directly
    fetch(`/api/nucleotide/sequence?id=${encodeURIComponent(accessionId)}`, {
        method: 'GET',
        headers: {
            'Accept': 'application/json'
        }
    })
    .then(response => {
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return response.json();
    })
    .then(data => {
        clearInterval(progressInterval);
        if (!data || !data.success || !data.data || !data.data.sequence) {
            throw new Error('Invalid response format');
        }
        
        // Transform the data to match expected format
        const sequenceData = {
            header: data.data.id || accessionId,
            sequence: data.data.sequence
        };
        
        processSequenceData(sequenceData, type);
    })
    .catch(error => {
        console.error('Fetch error from direct endpoint:', error);
        
        // Fall back to the comparison endpoint if direct fails
        timeoutDiv.innerHTML = 'Primary fetch failed, trying alternative method...';
        
        fetch(`/sequence-comparison/api/fetch-sequence?id=${encodeURIComponent(accessionId)}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        })
        .then(response => {
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.json();
        })
        .then(data => {
            clearInterval(progressInterval);
            if (!data || !data.sequence) {
                throw new Error('Invalid response format');
            }
            processSequenceData(data, type);
        })
        .catch(secondError => {
            clearInterval(progressInterval);
            console.error('All fetch methods failed:', secondError);
            statusElement.innerHTML = `
                <span class="status-error">✗</span> Error: Unable to fetch sequence
                <button class="retry-button" onclick="fetchSequenceFromNCBI('${accessionId.replace(/'/g, "\\'")}', '${type}')">
                    Retry
                </button>
            `;
            if (type === 'reference') referenceSequence = null;
            else querySequence = null;
            updateCompareButtonState();
        });
    });
}


function processSequenceData(data, type) {
    try {
        console.log('DEBUG: Processing sequence data:', type);
        const sequence = {
            header: data.header || 'Unknown',
            sequence: data.sequence
        };

        // Handle large sequences consistently
        handleLargeSequence(sequence, type, sequence.header)
            .then(() => {
                console.log('DEBUG: Sequence processed successfully');
                updateCompareButtonState();
            })
            .catch(error => {
                console.error('Error in sequence processing:', error);
                const statusElement = type === 'reference' ? referenceStatus : queryStatus;
                statusElement.innerHTML = `<span class="status-error">✗</span> Error: ${error.message}`;
                if (type === 'reference') referenceSequence = null;
                else querySequence = null;
                updateCompareButtonState();
            });

    } catch (error) {
        console.error('Processing error:', error);
        throw new Error('Failed to process sequence data');
    }
}

    // Add helper function to process sequence data
    function parseFasta(text) {
        const lines = text.split('\n');
        let header = '';
        let sequence = '';
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.length === 0) continue;
            
            if (line[0] === '>') {
                if (i > 0 && sequence.length === 0) {
                    throw new Error('Invalid FASTA format: header without sequence');
                }
                if (i === 0) {
                    header = line.substring(1);
                } else {
                    // We only support single sequence FASTA files for now
                    break;
                }
            } else {
                sequence += line.replace(/\s/g, '');
            }
        }
        
        if (sequence.length === 0) {
            // Check if it's just a plain sequence without a header
            if (header && !header.startsWith('>')) {
                sequence = header;
                header = 'Unnamed Sequence';
            } else {
                throw new Error('No sequence found in the file');
            }
        }
        
        return { header, sequence };
    }
    
    function updateCompareButtonState() {
        if (referenceSequence && querySequence) {
            compareBtn.disabled = false;
        } else {
            compareBtn.disabled = true;
        }
    }
    
    function compareSequences() {
        if (!referenceSequence || !querySequence) {
            alert('Please load both reference and query sequences');
            return;
        }
        
        // Show loading state
        const loadingIndicator = document.createElement('div');
        loadingIndicator.className = 'loading-indicator';
        loadingIndicator.innerHTML = '<span class="spinner"></span> Analyzing sequences...';
        document.querySelector('.tool-container').appendChild(loadingIndicator);
        
        // Calculate total payload size
        const payloadSize = referenceSequence.sequence.length + querySequence.sequence.length;
        
        // If payload is large, use chunked processing
        if (payloadSize > 1000000) { // 1MB threshold
            processLargeSequences();
        } else {
            fetch('/sequence-comparison/api/compare-sequences', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    referenceSequence: referenceSequence.sequence,
                    querySequence: querySequence.sequence
                })
            })
            .then(response => {
                if (!response.ok) {
                    return response.json().then(err => {
                        throw new Error(err.error || 'Failed to compare sequences');
                    });
                }
                return response.json();
            })
            .then(data => {
                // Set all required properties for the comparison results
                comparisonResults = {
                    ...data,
                    referenceHeader: referenceSequence.header,
                    queryHeader: querySequence.header,
                    referenceLength: referenceSequence.sequence.length,
                    queryLength: querySequence.sequence.length
                };
                document.querySelector('.loading-indicator')?.remove();
                displayResults();
            })
            .catch(error => {
                console.error('Comparison error:', error);
                document.querySelector('.loading-indicator')?.remove();
                alert(`Error: ${error.message}`);
            });
        }
    }

    async function processLargeSequences() {
        try {
            // First, get a session ID for this comparison
            const sessionResponse = await fetch('/sequence-comparison/api/create-session', {
                method: 'POST'
            });
            const { sessionId } = await sessionResponse.json();
    
            // Upload reference sequence in chunks
            await uploadSequenceInChunks(referenceSequence.sequence, sessionId, 'reference');
            
            // Upload query sequence in chunks
            await uploadSequenceInChunks(querySequence.sequence, sessionId, 'query');
            
            // Start the comparison
            const comparisonResponse = await fetch(`/sequence-comparison/api/compare-session/${sessionId}`, {
                method: 'POST'
            });
            
            const data = await comparisonResponse.json();
            
            // Process results as before
            comparisonResults = {
                referenceHeader: referenceSequence.header,
                queryHeader: querySequence.header,
                referenceLength: referenceSequence.sequence.length,
                queryLength: querySequence.sequence.length,
                mutations: data.mutations,
                alignment: data.alignment,
                distributionStats: data.distributionStats
            };
            
            // Remove loading indicator and display results
            document.querySelector('.loading-indicator')?.remove();
            displayResults();
            
        } catch (error) {
            console.error('Large sequence processing error:', error);
            alert(`Error: ${error.message}`);
            document.querySelector('.loading-indicator')?.remove();
        }
    }
    

    function displayResults() {
        if (!comparisonResults) return;
        
        const filteredMutations = getFilteredMutations();
        
        // Show results section
        resultsSection.style.display = 'block';
        
        // Update summary statistics
        document.getElementById('totalMutations').textContent = filteredMutations.length;
        document.getElementById('sequenceLength').textContent = comparisonResults.referenceLength;
        document.getElementById('mutationRate').textContent = 
            ((filteredMutations.length / comparisonResults.referenceLength) * 100).toFixed(2) + '%';

        // Update visualizations with filtered mutations
        createMutationChart(filteredMutations);
        displaySequenceAlignment(filteredMutations);
        populateMutationTable(filteredMutations);
    }









    async function uploadSequenceInChunks(sequence, sessionId, type) {
        const chunkSize = 500000; // 500KB chunks
        const chunks = Math.ceil(sequence.length / chunkSize);
        
        for (let i = 0; i < chunks; i++) {
            const start = i * chunkSize;
            const end = Math.min(start + chunkSize, sequence.length);
            const chunk = sequence.slice(start, end);
            
            await fetch('/sequence-comparison/api/upload-chunk', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    sessionId,
                    type,
                    chunk,
                    chunkIndex: i,
                    totalChunks: chunks
                })
            });
        }
    }



    // Add these functions after the compareSequences function
    function getFilteredMutations() {
        if (!comparisonResults || !comparisonResults.mutations) return [];
        
        if (allMutations.checked) {
            return comparisonResults.mutations;
        }

        return comparisonResults.mutations.filter(mutation => {
            return (substitutionMutations.checked && mutation.type.toLowerCase() === 'substitution') ||
                   (insertionMutations.checked && mutation.type.toLowerCase() === 'insertion') ||
                   (deletionMutations.checked && mutation.type.toLowerCase() === 'deletion');
        });
    }

    function updateResults() {
        if (comparisonResults) {
            displayResults();
        }
    }
    
    function createMutationChart() {
        const ctx = document.getElementById('mutationChart').getContext('2d');
        
        // Use distribution data from the API if available
        let labels = [];
        let data = [];
        
        if (comparisonResults.distributionStats) {
            // Use the pre-calculated distribution from the API
            const stats = comparisonResults.distributionStats;
            const binSize = stats.binSize;
            
            for (let i = 0; i < stats.distribution.length; i++) {
                const start = i * binSize + 1;
                const end = Math.min((i + 1) * binSize, comparisonResults.referenceLength);
                labels.push(`${start}-${end}`);
                data.push(stats.distribution[i]);
            }
        } else {
            // Fall back to client-side calculation if API doesn't provide distribution
            const binSize = Math.max(1, Math.floor(comparisonResults.referenceLength / 20));
            const bins = {};
            
            comparisonResults.mutations.forEach(mutation => {
                const binIndex = Math.floor((mutation.position - 1) / binSize);
                bins[binIndex] = (bins[binIndex] || 0) + 1;
            });
            
            for (let i = 0; i < Math.ceil(comparisonResults.referenceLength / binSize); i++) {
                const start = i * binSize + 1;
                const end = Math.min((i + 1) * binSize, comparisonResults.referenceLength);
                labels.push(`${start}-${end}`);
                data.push(bins[i] || 0);
            }
        }
        
        // Check if Chart.js is available
        if (typeof Chart === 'undefined') {
            // If Chart.js is not available, create a simple HTML chart
            createSimpleMutationChart(labels, data);
            return;
        }
        
        // Destroy previous chart if it exists
        if (window.mutationChart && typeof window.mutationChart.destroy === 'function') {
            window.mutationChart.destroy();
        }
        
        try {
            window.mutationChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Mutations',
                        data: data,
                        backgroundColor: 'rgba(66, 133, 244, 0.7)',
                        borderColor: 'rgba(66, 133, 244, 1)',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'Number of Mutations'
                            }
                        },
                        x: {
                            title: {
                                display: true,
                                text: 'Sequence Position'
                            }
                        }
                    }
                }
            });
        } catch (error) {
            console.error('Error creating chart:', error);
            // Fallback to simple chart if Chart.js fails
            createSimpleMutationChart(labels, data);
        }
    }
    
    // Function to create a simple HTML-based chart as fallback
    function createSimpleMutationChart(labels, data) {
        const chartContainer = document.getElementById('mutationChart').parentNode;
        chartContainer.innerHTML = '';
        
        const maxValue = Math.max(...data, 1); // Avoid division by zero
        
        const chartDiv = document.createElement('div');
        chartDiv.className = 'simple-chart';
        chartDiv.style.display = 'flex';
        chartDiv.style.height = '300px';
        chartDiv.style.alignItems = 'flex-end';
        chartDiv.style.borderBottom = '1px solid #ccc';
        chartDiv.style.paddingBottom = '30px';
        chartDiv.style.position = 'relative';
        
        // Create bars
        data.forEach((value, index) => {
            const barContainer = document.createElement('div');
            barContainer.style.flex = '1';
            barContainer.style.display = 'flex';
            barContainer.style.flexDirection = 'column';
            barContainer.style.alignItems = 'center';
            barContainer.style.margin = '0 2px';
            
            const bar = document.createElement('div');
            bar.style.width = '80%';
            bar.style.backgroundColor = 'rgba(66, 133, 244, 0.7)';
            bar.style.borderColor = 'rgba(66, 133, 244, 1)';
            bar.style.borderWidth = '1px';
            bar.style.height = `${(value / maxValue) * 100}%`;
            bar.style.minHeight = '1px';
            bar.style.position = 'relative';
            
            const tooltip = document.createElement('div');
            tooltip.style.position = 'absolute';
            tooltip.style.top = '-20px';
            tooltip.style.left = '50%';
            tooltip.style.transform = 'translateX(-50%)';
            tooltip.style.backgroundColor = '#333';
            tooltip.style.color = 'white';
            tooltip.style.padding = '2px 5px';
            tooltip.style.borderRadius = '3px';
            tooltip.style.fontSize = '12px';
            tooltip.textContent = value;
            
            bar.appendChild(tooltip);
            barContainer.appendChild(bar);
            
            const label = document.createElement('div');
            label.style.fontSize = '10px';
            label.style.marginTop = '5px';
            label.style.textAlign = 'center';
            label.style.transform = 'rotate(-45deg)';
            label.style.transformOrigin = 'center';
            label.style.whiteSpace = 'nowrap';
            label.textContent = labels[index];
            barContainer.appendChild(label);
            
            chartDiv.appendChild(barContainer);
        });
        
        // Add title
        const title = document.createElement('h4');
        title.textContent = 'Mutation Distribution';
        title.style.textAlign = 'center';
        title.style.marginBottom = '10px';
        
        chartContainer.appendChild(title);
        chartContainer.appendChild(chartDiv);
        
        // Add legend
        const legend = document.createElement('div');
        legend.style.textAlign = 'center';
        legend.style.marginTop = '10px';
        legend.innerHTML = '<span style="display: inline-block; width: 12px; height: 12px; background-color: rgba(66, 133, 244, 0.7); margin-right: 5px;"></span> Mutations';
        
        chartContainer.appendChild(legend);
    }
    
    function displaySequenceAlignment() {
        const sequenceViewer = document.getElementById('sequenceViewer');
        
        // Check if we have alignment data from the API
        if (comparisonResults.alignment) {
            const alignment = comparisonResults.alignment;
            const refSeq = alignment.alignedReference;
            const querySeq = alignment.alignedQuery;
            
            // Generate HTML for sequence display with line numbers and highlighting
            let html = '';
            const charsPerLine = 60;
            const lines = Math.ceil(refSeq.length / charsPerLine);
            
            for (let i = 0; i < lines; i++) {
                const start = i * charsPerLine;
                const end = Math.min(start + charsPerLine, refSeq.length);
                const lineNumber = start + 1;
                
                // Reference sequence line
                html += `<div class="sequence-line">`;
                html += `<span class="line-number">${lineNumber}</span>`;
                html += `<span class="sequence-label">Ref</span>`;
                html += `<span class="sequence-text">`;
                
                for (let j = start; j < end; j++) {
                    const refChar = refSeq[j];
                    const queryChar = querySeq[j];
                    const isMatch = refChar === queryChar && refChar !== '-';
                    const isDeletion = refChar === '-';
                    
                    if (!isMatch) {
                        html += `<span class="mutation ref-base">${refChar}</span>`;
                    } else {
                        html += refChar;
                    }
                }
                
                html += `</span></div>`;
                
                // Mutation markers line
                html += `<div class="sequence-line">`;
                html += `<span class="line-number"></span>`;
                html += `<span class="sequence-label"></span>`;
                html += `<span class="sequence-text">`;
                
                for (let j = start; j < end; j++) {
                    const refChar = refSeq[j];
                    const queryChar = querySeq[j];
                    const isMatch = refChar === queryChar && refChar !== '-';
                    
                    html += isMatch ? ' ' : '|';
                }
                
                html += `</span></div>`;
                
                // Query sequence line
                html += `<div class="sequence-line">`;
                html += `<span class="line-number">${lineNumber}</span>`;
                html += `<span class="sequence-label">Query</span>`;
                html += `<span class="sequence-text">`;
                
                for (let j = start; j < end; j++) {
                    const refChar = refSeq[j];
                    const queryChar = querySeq[j];
                    const isMatch = refChar === queryChar && refChar !== '-';
                    const isInsertion = queryChar === '-';
                    
                    if (!isMatch) {
                        html += `<span class="mutation query-base">${queryChar}</span>`;
                    } else {
                        html += queryChar;
                    }
                }
                
                html += `</span></div>`;
                
                // Add a spacer between blocks
                html += `<div class="sequence-spacer"></div>`;
            }
            
            sequenceViewer.innerHTML = html;
        } else {
            // Fall back to the original implementation if no alignment data
            const refSeq = referenceSequence.sequence;
            const querySeq = querySequence.sequence;
            
            // Create a map of mutation positions for quick lookup
            const mutationMap = {};
            comparisonResults.mutations.forEach(mutation => {
                mutationMap[mutation.position - 1] = true;
            });
            
            // Generate HTML for sequence display with line numbers and highlighting
            let html = '';
            const charsPerLine = 60;
            const lines = Math.ceil(Math.max(refSeq.length, querySeq.length) / charsPerLine);
            
            for (let i = 0; i < lines; i++) {
                const start = i * charsPerLine;
                const end = Math.min(start + charsPerLine, Math.max(refSeq.length, querySeq.length));
                const lineNumber = start + 1;
                
                // Reference sequence line
                html += `<div class="sequence-line">`;
                html += `<span class="line-number">${lineNumber}</span>`;
                html += `<span class="sequence-label">Ref</span>`;
                html += `<span class="sequence-text">`;
                
                for (let j = start; j < end; j++) {
                    if (j < refSeq.length) {
                        if (mutationMap[j]) {
                            html += `<span class="mutation ref-base">${refSeq[j]}</span>`;
                        } else {
                            html += refSeq[j];
                        }
                    } else {
                        html += ' ';
                    }
                }
                
                html += `</span></div>`;
                
                // Mutation markers line
                html += `<div class="sequence-line">`;
                html += `<span class="line-number"></span>`;
                html += `<span class="sequence-label"></span>`;
                html += `<span class="sequence-text">`;
                
                for (let j = start; j < end; j++) {
                    const refChar = refSeq[j];
                    const queryChar = querySeq[j];
                    const isMatch = refChar === queryChar && refChar !== '-';
                    
                    html += isMatch ? ' ' : '|';
                }
                
                html += `</span></div>`;
                
                // Query sequence line
                html += `<div class="sequence-line">`;
                html += `<span class="line-number">${lineNumber}</span>`;
                html += `<span class="sequence-label">Query</span>`;
                html += `<span class="sequence-text">`;
                
                for (let j = start; j < end; j++) {
                    if (j < querySeq.length) {
                        if (mutationMap[j]) {
                            html += `<span class="mutation query-base">${querySeq[j]}</span>`;
                        } else {
                            html += querySeq[j];
                        }
                    } else {
                        html += ' ';
                    }
                }
                
                html += `</span></div>`;
                
                // Add a spacer between blocks
                html += `<div class="sequence-spacer"></div>`;
            }
            
            sequenceViewer.innerHTML = html;
        }
    }
    
    function populateMutationTable() {
        const tableBody = document.querySelector('#mutationTable tbody');
        tableBody.innerHTML = '';
        
        const filteredMutations = getFilteredMutations();
        
        filteredMutations.forEach(mutation => {
            const row = document.createElement('tr');
            
            const positionCell = document.createElement('td');
            positionCell.textContent = mutation.position;
            row.appendChild(positionCell);
            
            const refCell = document.createElement('td');
            refCell.textContent = mutation.reference === '-' || !mutation.reference ? '-' : mutation.reference;
            row.appendChild(refCell);
            
            const queryCell = document.createElement('td');
            queryCell.textContent = mutation.query === '-' || !mutation.query ? '-' : mutation.query;
            row.appendChild(queryCell);
            
            const typeCell = document.createElement('td');
            typeCell.textContent = mutation.type || 'Unknown';
            row.appendChild(typeCell);
            
            tableBody.appendChild(row);
        });
    }
    
    function clearAll() {
        // Reset file inputs
        referenceFileInput.value = '';
        queryFileInput.value = '';
        
        // Reset accession inputs
        referenceAccession.value = '';
        queryAccession.value = '';
        
        // Reset status indicators
        referenceStatus.innerHTML = 'No sequence loaded';
        queryStatus.innerHTML = 'No sequence loaded';
        
        // Reset state variables
        referenceSequence = null;
        querySequence = null;
        comparisonResults = null;
        
        // Hide results section
        resultsSection.style.display = 'none';
        
        // Disable compare button
        compareBtn.disabled = true;
    }
    
    // Export functionality has been removed
});