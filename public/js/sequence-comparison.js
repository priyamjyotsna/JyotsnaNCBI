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
    
    document.getElementById('exportExcel').addEventListener('click', function() {
        exportResults('excel');
    });
    
    document.getElementById('exportPDF').addEventListener('click', function() {
        exportResults('pdf');
    });
    
    document.getElementById('exportCSV').addEventListener('click', function() {
        exportResults('csv');
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
            // Ensure we're sending the correct sequence data
            const payload = {
                referenceSequence: {
                    header: referenceSequence.header || '',
                    sequence: referenceSequence.sequence.trim()
                },
                querySequence: {
                    header: querySequence.header || '',
                    sequence: querySequence.sequence.trim()
                }
            };

            console.log('Sending comparison request with payload:', {
                refLength: payload.referenceSequence.sequence.length,
                queryLength: payload.querySequence.sequence.length
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

            comparisonResults = {
                mutations: data.mutations || [],
                alignment: data.alignment || null,
                distributionStats: data.distributionStats || {},
                metadata: {
                    referenceLength: referenceSequence.sequence.length,
                    queryLength: querySequence.sequence.length,
                    referenceHeader: referenceSequence.header,
                    queryHeader: querySequence.header,
                    ...data.metadata
                }
            };

            displayResults();
            createMutationChart();
            displaySequenceAlignment();
            populateMutationTable();
            resultsSection.style.display = 'block';

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
    
    function exportResults(format) {
        if (!comparisonResults) {
            alert('No comparison results to export');
            return;
        }
        
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
    }
    
    function exportToExcel() {
        // Create a workbook with a worksheet
        const workbook = {
            SheetNames: ['Mutations'],
            Sheets: {}
        };
        
        // Prepare data for the worksheet
        const data = [
            ['Position', 'Reference', 'Query', 'Type']
        ];
        
        comparisonResults.mutations.forEach(mutation => {
            data.push([
                mutation.position,
                mutation.reference,
                mutation.query,
                mutation.type
            ]);
        });
        
        // Add summary information
        data.push([]);
        data.push(['Summary Information']);
        data.push(['Reference Sequence', comparisonResults.referenceHeader]);
        data.push(['Reference Length', comparisonResults.referenceLength]);
        data.push(['Query Sequence', comparisonResults.queryHeader]);
        data.push(['Query Length', comparisonResults.queryLength]);
        data.push(['Total Mutations', comparisonResults.mutations.length]);
        data.push(['Mutation Rate', ((comparisonResults.mutations.length / comparisonResults.referenceLength) * 100).toFixed(2) + '%']);
        
        // Convert data to worksheet
        const worksheet = {};
        const range = { s: { c: 0, r: 0 }, e: { c: 3, r: data.length - 1 } };
        
        for (let R = 0; R < data.length; ++R) {
            for (let C = 0; C < data[R].length; ++C) {
                const cell_ref = XLSX.utils.encode_cell({ c: C, r: R });
                worksheet[cell_ref] = { v: data[R][C] };
            }
        }
        
        worksheet['!ref'] = XLSX.utils.encode_range(range);
        workbook.Sheets['Mutations'] = worksheet;
        
        // Generate Excel file
        const excelData = XLSX.write(workbook, { bookType: 'xlsx', type: 'binary' });
        
        // Convert to blob and download
        const blob = new Blob([s2ab(excelData)], { type: 'application/octet-stream' });
        saveAs(blob, 'sequence_comparison_results.xlsx');
    }
    
    function s2ab(s) {
        const buf = new ArrayBuffer(s.length);
        const view = new Uint8Array(buf);
        for (let i = 0; i < s.length; i++) {
            view[i] = s.charCodeAt(i) & 0xFF;
        }
        return buf;
    }
    
    function exportToPDF() {
        try {
            // Check if jsPDF is available
            if (typeof jspdf === 'undefined') {
                throw new Error('jsPDF library not loaded');
            }
            
            // Create a new PDF document using the proper UMD format
            const doc = new jspdf.jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });
            
            // Add title
            doc.setFontSize(18);
            doc.text('Sequence Comparison Results', 105, 15, { align: 'center' });
            
            // Add metadata
            doc.setFontSize(12);
            doc.text(`Reference: ${comparisonResults.referenceHeader}`, 20, 30);
            doc.text(`Query: ${comparisonResults.queryHeader}`, 20, 40);
            
            // Add summary statistics
            doc.setFontSize(14);
            doc.text('Summary Statistics', 20, 55);
            doc.setFontSize(12);
            doc.text(`Total Mutations: ${comparisonResults.mutations.length}`, 25, 65);
            doc.text(`Sequence Length: ${comparisonResults.referenceLength}`, 25, 75);
            doc.text(`Mutation Rate: ${((comparisonResults.mutations.length / comparisonResults.referenceLength) * 100).toFixed(2)}%`, 25, 85);
            
            // Add mutation table
            doc.setFontSize(14);
            doc.text('Mutation List', 20, 100);
            
            // Table headers
            doc.setFontSize(12);
            doc.text('Position', 25, 110);
            doc.text('Reference', 65, 110);
            doc.text('Query', 105, 110);
            doc.text('Type', 145, 110);
            
            // Draw a line under headers
            doc.line(25, 112, 185, 112);
            
            // Table rows
            let y = 120;
            const maxRowsPerPage = 25;
            let rowCount = 0;
            
            comparisonResults.mutations.forEach((mutation, index) => {
                // Add a new page if needed
                if (rowCount >= maxRowsPerPage) {
                    doc.addPage();
                    y = 30;
                    rowCount = 0;
                    
                    // Add headers on new page
                    doc.text('Position', 25, 20);
                    doc.text('Reference', 65, 20);
                    doc.text('Query', 105, 20);
                    doc.text('Type', 145, 20);
                    doc.line(25, 22, 185, 22);
                }
                
                // Fix for empty or undefined values
                const position = mutation.position.toString();
                const reference = mutation.reference === '-' || !mutation.reference ? '-' : mutation.reference;
                const query = mutation.query === '-' || !mutation.query ? '-' : mutation.query;
                
                // Determine mutation type
                let type = mutation.type || 'Unknown';
                if (!type || type === 'Unknown') {
                    if (reference === '-') {
                        type = 'Insertion';
                    } else if (query === '-') {
                        type = 'Deletion';
                    } else if (reference !== query) {
                        type = 'Substitution';
                    }
                }
                
                // Write values to PDF
                doc.text(position, 25, y);
                doc.text(reference, 65, y);
                doc.text(query, 105, y);
                doc.text(type, 145, y);
                
                y += 10;
                rowCount++;
            });
            
            // Save the PDF
            doc.save('sequence-comparison-results.pdf');
            
        } catch (error) {
            console.error('Error generating PDF:', error);
            alert('Failed to generate PDF. Make sure jsPDF library is properly loaded.');
            
            // Fallback to CSV export if PDF fails
            if (confirm('PDF export failed. Would you like to export as CSV instead?')) {
                exportToCSV();
            }
        }
    }
    
    function exportToCSV() {
        // Prepare CSV content
        let csvContent = 'Position,Reference,Query,Type\n';
        
        comparisonResults.mutations.forEach(mutation => {
            csvContent += `${mutation.position},${mutation.reference},${mutation.query},${mutation.type}\n`;
        });
        
        // Add summary information
        csvContent += '\nSummary Information\n';
        csvContent += `Reference Sequence,${comparisonResults.referenceHeader}\n`;
        csvContent += `Reference Length,${comparisonResults.referenceLength}\n`;
        csvContent += `Query Sequence,${comparisonResults.queryHeader}\n`;
        csvContent += `Query Length,${comparisonResults.queryLength}\n`;
        csvContent += `Total Mutations,${comparisonResults.mutations.length}\n`;
        csvContent += `Mutation Rate,${((comparisonResults.mutations.length / comparisonResults.referenceLength) * 100).toFixed(2)}%\n`;
        
        // Create blob and download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        saveAs(blob, 'sequence_comparison_results.csv');
    }
    
    // Helper function for saving files
    function saveAs(blob, filename) {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
        setTimeout(() => {
            URL.revokeObjectURL(link.href);
        }, 100);
    }
});