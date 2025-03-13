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
    
    


        // ... existing event listeners ...
    
    // Add mutation filter event listeners
    allMutations.addEventListener('change', function() {
        if (this.checked) {
            substitutionMutations.checked = false;
            insertionMutations.checked = false;
            deletionMutations.checked = false;
        }
        updateResults();
    });

    [substitutionMutations, insertionMutations, deletionMutations].forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            if (this.checked) {
                allMutations.checked = false;
            }
            if (!substitutionMutations.checked && 
                !insertionMutations.checked && 
                !deletionMutations.checked) {
                allMutations.checked = true;
            }
            updateResults();
        });
    });

    // ... rest of the code ...
    // Event listeners
    referenceFileInput.addEventListener('change', function(e) {
        if (e.target.files.length > 0) {
            processReferenceFile(e.target.files[0]);
        }
    });
    
    queryFileInput.addEventListener('change', function(e) {
        if (e.target.files.length > 0) {
            processQueryFile(e.target.files[0]);
        }
    });
    
    fetchReferenceBtn.addEventListener('click', function() {
        const accessionId = referenceAccession.value.trim();
        if (accessionId) {
            fetchSequenceFromNCBI(accessionId, 'reference');
        } else {
            alert('Please enter a valid accession ID');
        }
    });
    
    fetchQueryBtn.addEventListener('click', function() {
        const accessionId = queryAccession.value.trim();
        if (accessionId) {
            fetchSequenceFromNCBI(accessionId, 'query');
        } else {
            alert('Please enter a valid accession ID');
        }
    });
    
    compareBtn.addEventListener('click', compareSequences);
    
    clearBtn.addEventListener('click', clearAll);
    
    document.addEventListener('DOMContentLoaded', function() {
        const resultsSection = document.getElementById('resultsSection');
        if (resultsSection) {
            resultsSection.addEventListener('click', function(e) {
                if (e.target.matches('.export-excel-btn')) {
                    exportToExcel();
                }
                if (e.target.matches('.export-csv-btn')) {
                    exportToCSV();
                }
                if (e.target.matches('.export-pdf-btn')) {
                    exportToPDF();
                }
            });
        }
    });
    
    // Functions
    function initializeDropzone(dropzone, fileInput, processFunction) {
        dropzone.addEventListener('click', function() {
            fileInput.click();
        });
        
        dropzone.addEventListener('dragover', function(e) {
            e.preventDefault();
            dropzone.classList.add('dragover');
        });
        
        dropzone.addEventListener('dragleave', function() {
            dropzone.classList.remove('dragover');
        });
        
        dropzone.addEventListener('drop', function(e) {
            e.preventDefault();
            dropzone.classList.remove('dragover');
            
            if (e.dataTransfer.files.length > 0) {
                processFunction(e.dataTransfer.files[0]);
            }
        });
    }
    
    function processReferenceFile(file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const sequence = parseFasta(e.target.result);
                handleLargeSequence(sequence, 'reference', file.name);
            } catch (error) {
                referenceStatus.innerHTML = `<span class="status-error">✗</span> Error: ${error.message}`;
                referenceSequence = null;
                updateCompareButtonState();
            }
        };
        reader.readAsText(file);
    }
    
    function processQueryFile(file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const sequence = parseFasta(e.target.result);
                handleLargeSequence(sequence, 'query', file.name);
            } catch (error) {
                queryStatus.innerHTML = `<span class="status-error">✗</span> Error: ${error.message}`;
                querySequence = null;
                updateCompareButtonState();
            }
        };
        reader.readAsText(file);
    }
    

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

async function handleAuthenticationError(response) {
    if (response.status === 401 || response.status === 403) {
        // Save current state if needed
        sessionStorage.setItem('lastPath', window.location.pathname);
        // Redirect to login page
        window.location.href = '/login';
        return true;
    }
    return false;
}

async function fetchSequenceFromNCBI(accessionId, type) {
    const statusElement = type === 'reference' ? referenceStatus : queryStatus;
    statusElement.innerHTML = '<span class="status-loading">⌛</span> Fetching sequence...';
    
    try {
        const response = await fetch(`/sequence-comparison/api/fetch-sequence?id=${encodeURIComponent(accessionId)}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'same-origin'
        });

        // Check for authentication errors first
        if (await handleAuthenticationError(response)) {
            return;
        }

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to fetch sequence');
        }

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || 'Failed to fetch sequence');
        }

        const sequence = {
            header: data.header,
            sequence: data.sequence
        };

        handleLargeSequence(sequence, type, accessionId);

    } catch (error) {
        console.error('Error fetching sequence:', error);
        if (error.message.includes('<!DOCTYPE')) {
            // If we get HTML response, likely a session timeout
            window.location.href = '/login';
            return;
        }
        statusElement.innerHTML = `<span class="status-error">✗</span> Error: ${error.message}`;
        if (type === 'reference') referenceSequence = null;
        else querySequence = null;
        updateCompareButtonState();
    }
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
    
    async function compareSequences() {
        if (!referenceSequence || !querySequence) {
            alert('Please provide both reference and query sequences');
            return;
        }

        compareBtn.disabled = true;
        resultsSection.innerHTML = '<div class="loading">Comparing sequences... <div class="spinner"></div></div>';

        try {
            // Ensure we're sending just the sequence strings as expected by the server
            const payload = {
                referenceSequence: referenceSequence.sequence.toString().trim(),
                querySequence: querySequence.sequence.toString().trim()
            };

            console.log('Sending comparison request with payload:', {
                refLength: payload.referenceSequence.length,
                queryLength: payload.querySequence.length,
                refType: typeof payload.referenceSequence,
                queryType: typeof payload.querySequence
            });

            const response = await fetch('/sequence-comparison/api/compare-sequences', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                credentials: 'same-origin',
                body: JSON.stringify(payload)
            });

            // First try to get the response as JSON
            let data;
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
            } else {
                // If not JSON, get the text and log it for debugging
                const text = await response.text();
                console.error('Received non-JSON response:', text);
                throw new Error('Server returned invalid format');
            }

            if (!response.ok) {
                throw new Error(data.error || 'Failed to compare sequences');
            }

            if (!data.success) {
                throw new Error(data.error || 'Failed to compare sequences');
            }

            // Store the results with metadata
            comparisonResults = {
                mutations: data.mutations || [],
                alignment: data.alignment || null,
                distributionStats: data.distributionStats || {},
                metadata: {
                    referenceLength: referenceSequence.sequence.length,
                    queryLength: querySequence.sequence.length,
                    referenceHeader: referenceSequence.header || '',
                    queryHeader: querySequence.header || '',
                    ...data.metadata
                }
            };

            // Show results section before updating content
            resultsSection.style.display = 'block';
            resultsSection.innerHTML = `
                <div class="results-header">
                    <h2>Comparison Results</h2>
                    <div class="export-options">
                        <button class="export-excel-btn">Export to Excel</button>
                        <button class="export-pdf-btn">Export to PDF</button>
                        <button class="export-csv-btn">Export to CSV</button>
                    </div>
                </div>

                <div class="summary-stats">
                    <div class="stat-card">
                        <h4>Total Mutations</h4>
                        <div class="stat-value" id="totalMutations">0</div>
                    </div>
                    <div class="stat-card">
                        <h4>Sequence Length</h4>
                        <div class="stat-value" id="sequenceLength">0</div>
                    </div>
                    <div class="stat-card">
                        <h4>Mutation Rate</h4>
                        <div class="stat-value" id="mutationRate">0%</div>
                    </div>
                </div>

                <div class="visualization-section">
                    <div class="chart-container">
                        <h4>Mutation Distribution</h4>
                        <canvas id="mutationChart" style="width: 100%; height: 300px;"></canvas>
                    </div>
                </div>

                <div class="sequence-display">
                    <h4>Sequence Alignment with Mutations Highlighted</h4>
                    <div class="sequence-viewer" id="sequenceViewer">
                        <!-- Sequence alignment will be displayed here -->
                    </div>
                </div>

                <div class="mutation-list">
                    <h4>Detailed Mutation List</h4>
                    <table id="mutationTable">
                        <thead>
                            <tr>
                                <th>Position</th>
                                <th>Reference</th>
                                <th>Query</th>
                                <th>Type</th>
                            </tr>
                        </thead>
                        <tbody>
                            <!-- Mutation details will be added here -->
                        </tbody>
                    </table>
                </div>
            `;

            // Now that the elements exist, update them
            displayResults();

        } catch (error) {
            console.error('Error comparing sequences:', error);
            resultsSection.innerHTML = `<div class="error">Error: ${error.message}</div>`;
        } finally {
            compareBtn.disabled = false;
        }
    }

    function displayResults() {
        if (!comparisonResults) return;
        
        const filteredMutations = getFilteredMutations();
        
        // Show results section
        if (resultsSection) {
            resultsSection.style.display = 'block';
        }
        
        // Update summary statistics with null checks
        const totalMutationsElement = document.getElementById('totalMutations');
        const sequenceLengthElement = document.getElementById('sequenceLength');
        const mutationRateElement = document.getElementById('mutationRate');
        
        if (totalMutationsElement) {
            totalMutationsElement.textContent = filteredMutations.length;
        }
        
        if (sequenceLengthElement && comparisonResults.metadata && comparisonResults.metadata.referenceLength) {
            sequenceLengthElement.textContent = comparisonResults.metadata.referenceLength;
        }
        
        if (mutationRateElement && comparisonResults.metadata && comparisonResults.metadata.referenceLength) {
            const rate = ((filteredMutations.length / comparisonResults.metadata.referenceLength) * 100).toFixed(2);
            mutationRateElement.textContent = rate + '%';
        }

        // Update visualizations with filtered mutations
        try {
            if (document.getElementById('mutationChart')) {
                createMutationChart(filteredMutations);
            }
            
            if (document.getElementById('sequenceViewer')) {
                displaySequenceAlignment();
            }
            
            if (document.getElementById('mutationTable')) {
                populateMutationTable(filteredMutations);
            }
        } catch (error) {
            console.error('Error updating visualizations:', error);
        }
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
        try {
            const canvas = document.getElementById('mutationChart');
            if (!canvas) {
                throw new Error('Mutation chart canvas element not found');
            }

            // Get the data ready
            const stats = comparisonResults.distributionStats;
            const labels = [];
            const data = [];
            
            if (stats && stats.distribution && Array.isArray(stats.distribution)) {
                const binSize = stats.binSize || Math.floor(comparisonResults.metadata.referenceLength / 20);
                
                stats.distribution.forEach((value, i) => {
                    const start = i * binSize + 1;
                    const end = Math.min((i + 1) * binSize, comparisonResults.metadata.referenceLength);
                    labels.push(`${start}-${end}`);
                    data.push(value);
                });
            } else {
                // Fallback to using mutations directly
                const binSize = Math.floor(comparisonResults.metadata.referenceLength / 20);
                const bins = new Array(Math.ceil(comparisonResults.metadata.referenceLength / binSize)).fill(0);
                
                comparisonResults.mutations.forEach(mutation => {
                    const binIndex = Math.floor((mutation.position - 1) / binSize);
                    if (binIndex >= 0 && binIndex < bins.length) {
                        bins[binIndex]++;
                    }
                });
                
                bins.forEach((value, i) => {
                    const start = i * binSize + 1;
                    const end = Math.min((i + 1) * binSize, comparisonResults.metadata.referenceLength);
                    labels.push(`${start}-${end}`);
                    data.push(value);
                });
            }

            // Destroy existing chart if it exists
            if (window.mutationChart instanceof Chart) {
                window.mutationChart.destroy();
            }

            // Create new chart
            window.mutationChart = new Chart(canvas.getContext('2d'), {
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
            createSimpleMutationChart([], []);
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
        if (!sequenceViewer) {
            console.error('Sequence viewer element not found');
            return;
        }

        if (!comparisonResults || !referenceSequence || !querySequence) {
            console.error('Missing sequence data for alignment');
            sequenceViewer.innerHTML = '<div class="error">Unable to display sequence alignment: Missing data</div>';
            return;
        }

        try {
            // Always use simple comparison since we're getting raw sequences
            const refSeq = referenceSequence.sequence;
            const querySeq = querySequence.sequence;
            
            // Create a map of mutation positions for quick lookup
            const mutationMap = {};
            if (comparisonResults.mutations && Array.isArray(comparisonResults.mutations)) {
                comparisonResults.mutations.forEach(mutation => {
                    if (mutation && typeof mutation.position === 'number') {
                        mutationMap[mutation.position - 1] = true;
                    }
                });
            }
            
            // Generate HTML for sequence display
            let html = generateSimpleComparisonHTML(refSeq, querySeq, mutationMap);
            sequenceViewer.innerHTML = html;

        } catch (error) {
            console.error('Error displaying sequence alignment:', error);
            sequenceViewer.innerHTML = `<div class="error">Error displaying alignment: ${error.message}</div>`;
        }
    }
    
    // Helper function to generate simple comparison HTML
    function generateSimpleComparisonHTML(refSeq, querySeq, mutationMap) {
        let html = '';
        const charsPerLine = 60;
        const maxLength = Math.max(refSeq.length, querySeq.length);
        const lines = Math.ceil(maxLength / charsPerLine);
        
        for (let i = 0; i < lines; i++) {
            const start = i * charsPerLine;
            const end = Math.min(start + charsPerLine, maxLength);
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
                    html += '-';
                }
            }
            
            html += `</span></div>`;
            
            // Mutation markers line
            html += `<div class="sequence-line">`;
            html += `<span class="line-number"></span>`;
            html += `<span class="sequence-label"></span>`;
            html += `<span class="sequence-text">`;
            
            for (let j = start; j < end; j++) {
                if (j < refSeq.length && j < querySeq.length) {
                    const refChar = refSeq[j];
                    const queryChar = querySeq[j];
                    html += refChar === queryChar ? ' ' : '|';
                } else {
                    html += '|';
                }
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
                    html += '-';
                }
            }
            
            html += `</span></div>`;
            
            // Add a spacer between blocks
            html += `<div class="sequence-spacer"></div>`;
        }
        
        return html;
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
    
    function exportResults(format) {
        if (!comparisonResults || !comparisonResults.mutations) {
            alert('No comparison results available to export');
            return;
        }
        
        try {
            switch (format) {
                case 'excel':
                    exportToExcel();
                    break;
                case 'pdf':
                    exportToPDF();
                    break;
                case 'csv':
                    exportToCSV();
                    break;
                default:
                    alert('Unsupported export format');
            }
        } catch (error) {
            console.error('Export error:', error);
            alert('Failed to export results. Please try again.');
        }
    }
    
    function getComparisonData() {
        if (!comparisonResults || !comparisonResults.mutations) {
            return [];
        }

        return comparisonResults.mutations.map(mutation => ({
            position: mutation.position,
            reference: mutation.reference || '-',
            query: mutation.query || '-',
            type: mutation.type || 'Unknown',
            // Add metadata
            referenceHeader: comparisonResults.metadata.referenceHeader,
            queryHeader: comparisonResults.metadata.queryHeader
        }));
    }

    function exportToExcel() {
        try {
            if (!comparisonResults || !comparisonResults.mutations) {
                throw new Error('No comparison results available');
            }

            const data = getComparisonData();
            if (!data.length) {
                throw new Error('No data to export');
            }

            const ws = XLSX.utils.json_to_sheet(data);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Sequence Comparison");
            XLSX.writeFile(wb, "sequence-comparison.xlsx");
        } catch (error) {
            console.error('Excel export error:', error);
            alert('Failed to export to Excel: ' + error.message);
        }
    }
    
    function exportToCSV() {
        try {
            if (!comparisonResults || !comparisonResults.mutations) {
                throw new Error('No comparison results available');
            }

            const data = getComparisonData();
            if (!data.length) {
                throw new Error('No data to export');
            }

            const ws = XLSX.utils.json_to_sheet(data);
            const csv = XLSX.utils.sheet_to_csv(ws);
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = "sequence-comparison.csv";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) {
            console.error('CSV export error:', error);
            alert('Failed to export to CSV: ' + error.message);
        }
    }

    function exportToPDF() {
        try {
            if (!comparisonResults || !comparisonResults.mutations) {
                throw new Error('No comparison results available');
            }

            const { jsPDF } = window.jspdf;
            if (!jsPDF) {
                throw new Error('PDF library not loaded');
            }

            const doc = new jsPDF();
            
            // Add title
            doc.setFontSize(16);
            doc.text('Sequence Comparison Results', 10, 10);
            
            // Add metadata
            doc.setFontSize(12);
            doc.text(`Reference: ${comparisonResults.metadata.referenceHeader}`, 10, 20);
            doc.text(`Query: ${comparisonResults.metadata.queryHeader}`, 10, 30);
            
            // Add table
            const data = getComparisonData();
            doc.autoTable({
                head: [['Position', 'Reference', 'Query', 'Type']],
                body: data.map(row => [row.position, row.reference, row.query, row.type]),
                startY: 40,
                margin: { top: 40 }
            });

            doc.save("sequence-comparison.pdf");
        } catch (error) {
            console.error('PDF export error:', error);
            alert('Failed to export to PDF: ' + error.message);
        }
    }
});