/**
 * Sequence Comparison Tool - Client-side JavaScript
 * Handles file uploads, NCBI sequence fetching, visualization, and export
 */

document.addEventListener('DOMContentLoaded', function() {
    // Set global Chart.js defaults for fonts
    if (typeof Chart !== 'undefined') {
        // Use only web-safe fonts that are guaranteed to be available
        Chart.defaults.font.family = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        Chart.defaults.font.size = 12;
        Chart.defaults.color = '#333';
        
        // Add a global plugin to enhance text rendering
        Chart.register({
            id: 'improvedFonts',
            beforeDraw: function(chart) {
                const ctx = chart.ctx;
                ctx.textBaseline = 'middle';
                ctx.textAlign = 'center';
                // Force font to system default
                ctx.font = '12px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
            }
        });
    }
    
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
    
    // Export functionality has been removed
    
    // Functions
    function initializeDropzone(dropzone, fileInput, processFunction) {
        let clickTimer = null;
        
        // Remove any existing listeners to prevent duplicates
        const newFileInput = fileInput.cloneNode(true);
        fileInput.parentNode.replaceChild(newFileInput, fileInput);
        fileInput = newFileInput;
        
        dropzone.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            // Prevent double clicks
            if (clickTimer !== null) {
                return;
            }
            
            clickTimer = setTimeout(() => {
                clickTimer = null;
            }, 500);
            
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

        fileInput.addEventListener('change', function(e) {
            if (e.target.files.length > 0) {
                processFunction(e.target.files[0]);
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
    
    const timeoutDiv = document.createElement('div');
    timeoutDiv.className = 'timeout-message';
    timeoutDiv.innerHTML = 'Initializing sequence fetch...';
    statusElement.appendChild(timeoutDiv);
    
    let seconds = 0;
    const progressInterval = setInterval(() => {
        seconds++;
        timeoutDiv.innerHTML = `Fetching sequence data... (${seconds}s)`;
        if (seconds >= 15) {
            timeoutDiv.innerHTML = 'Attempting alternative sources...';
        }
    }, 1000);

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        try {
            const response = await fetch(`/sequence-comparison/api/fetch-sequence?id=${encodeURIComponent(accessionId)}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'same-origin',
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (await handleAuthenticationError(response)) {
                clearInterval(progressInterval);
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

            clearInterval(progressInterval);
            const sequence = {
                header: data.header,
                sequence: data.sequence
            };

            handleLargeSequence(sequence, type, accessionId);

        } catch (primaryError) {
            console.warn('Primary endpoint failed:', primaryError);
            timeoutDiv.innerHTML = 'Trying alternative source...';

            // Fallback to EBI or alternative source
            const fallbackController = new AbortController();
            const fallbackTimeoutId = setTimeout(() => fallbackController.abort(), 20000);

            try {
                const response = await fetch(`/api/nucleotide/sequence?id=${encodeURIComponent(accessionId)}`, {
                    method: 'GET',
                    headers: { 'Accept': 'application/json' },
                    signal: fallbackController.signal
                });

                clearTimeout(fallbackTimeoutId);
                
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                
                const data = await response.json();
                if (!data?.success || !data?.data?.sequence) {
                    throw new Error('Invalid response format');
                }

                clearInterval(progressInterval);
                const sequence = {
                    header: data.data.id || accessionId,
                    sequence: data.data.sequence
                };
                handleLargeSequence(sequence, type, accessionId);
            } catch (fallbackError) {
                clearTimeout(fallbackTimeoutId);
                throw fallbackError;
            }
        }
    } catch (error) {
        clearInterval(progressInterval);
        console.error('All fetch attempts failed:', error);
        
        if (error.message.includes('<!DOCTYPE')) {
            window.location.href = '/login';
            return;
        }

        const errorMessage = error.name === 'AbortError' ? 
            'Request timed out. Please try again.' : 
            error.message || 'Failed to fetch sequence';
            
        statusElement.innerHTML = `
            <span class="status-error">✗</span> Error: ${errorMessage}
            <button class="retry-button" onclick="fetchSequenceFromNCBI('${accessionId.replace(/'/g, "\\'")}, '${type}')">
                Retry
            </button>
        `;
        
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

        // Clear any previous comparison results and chart
        if (window.mutationChart instanceof Chart) {
            window.mutationChart.destroy();
            window.mutationChart = null;
        }
        
        // Reset the comparisonResults to null
        comparisonResults = null;
        
        // Clear the results section completely before showing loading spinner
        resultsSection.innerHTML = '';
        resultsSection.style.display = 'block';
        resultsSection.innerHTML = '<div class="loading">Comparing sequences... <div class="spinner"></div></div>';

        compareBtn.disabled = true;

        try {
            console.log('Starting sequence comparison...');
            console.log('Reference sequence length:', referenceSequence.sequence.length);
            console.log('Query sequence length:', querySequence.sequence.length);

            // Ensure we're sending just the sequence strings
            const payload = {
                referenceSequence: referenceSequence.sequence,
                querySequence: querySequence.sequence
            };

            console.log('Sending comparison request...');
            
            const response = await fetch('/sequence-comparison/api/compare-sequences', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            console.log('Response status:', response.status);
            
            // Get the response data
            let data;
            try {
                data = await response.json();
                console.log('Response data:', data);
            } catch (parseError) {
                console.error('Error parsing response:', parseError);
                const text = await response.text();
                console.error('Raw response:', text);
                throw new Error('Invalid response format from server');
            }

            if (!response.ok) {
                throw new Error(data.error || 'Failed to compare sequences');
            }

            // Store the results
            comparisonResults = {
                mutations: data.mutations || [],
                alignment: data.alignment || {},
                distributionStats: data.distributionStats || {},
                metadata: {
                    referenceLength: referenceSequence.sequence.length,
                    queryLength: querySequence.sequence.length,
                    referenceHeader: referenceSequence.header || '',
                    queryHeader: querySequence.header || ''
                }
            };

            console.log('Comparison results:', comparisonResults);

            // Update the results section HTML
            displayResults();

        } catch (error) {
            console.error('Error in sequence comparison:', error);
            resultsSection.innerHTML = `
                <div class="error-message">
                    <h3>Error Comparing Sequences</h3>
                    <p>${error.message}</p>
                    <p>Please try again or contact support if the problem persists.</p>
                </div>
            `;
        } finally {
            compareBtn.disabled = false;
        }
    }

    function displayResults() {
        if (!comparisonResults) return;
        
        const filteredMutations = getFilteredMutations();
        
        // Remove any existing report elements including chart canvases
        const existingReport = document.querySelector('.mutation-report');
        if (existingReport) {
            existingReport.remove();
        }
        
        // Show results section
        resultsSection.style.display = 'block';
        resultsSection.innerHTML = `
            <div class="mutation-report visible">
                <div class="report-header">
                    <h2>Mutation Summary Report</h2>
                    <p class="report-date">Generated on: ${new Date().toLocaleString()}</p>
                </div>

                <div class="overview-stats">
                    <div class="stat-card">
                        <h4>Total Mutations</h4>
                        <div class="stat-value" id="totalMutations">${filteredMutations.length}</div>
                    </div>
                    <div class="stat-card">
                        <h4>Sequence Length</h4>
                        <div class="stat-value" id="sequenceLength">${comparisonResults.metadata.referenceLength}</div>
                    </div>
                    <div class="stat-card">
                        <h4>Mutation Rate</h4>
                        <div class="stat-value" id="mutationRate">
                            ${((filteredMutations.length / comparisonResults.metadata.referenceLength) * 100).toFixed(2)}%
                        </div>
                    </div>
                </div>

                <div class="sequence-info">
                    <div class="info-card">
                        <h4>Reference Sequence</h4>
                        <p>Header: ${comparisonResults.metadata.referenceHeader || 'N/A'}</p>
                        <p>Length: ${comparisonResults.metadata.referenceLength} bp</p>
                    </div>
                    <div class="info-card">
                        <h4>Query Sequence</h4>
                        <p>Header: ${comparisonResults.metadata.queryHeader || 'N/A'}</p>
                        <p>Length: ${comparisonResults.metadata.queryLength} bp</p>
                    </div>
                </div>

                <div class="distribution-graph">
                    <h3>Mutation Distribution</h3>
                    <div class="chart-container">
                        <canvas id="mutationChart"></canvas>
                    </div>
                </div>

                <div class="significant-mutations">
                    <h3>Most Significant Mutations</h3>
                    <div id="significantMutations">
                        ${getSignificantMutations(filteredMutations)}
                    </div>
                </div>

                <div class="sequence-display">
                    <h3>Sequence Alignment with Mutations Highlighted</h3>
                    <div class="sequence-viewer" id="sequenceViewer"></div>
                </div>

                <div class="mutation-list">
                    <h3>Detailed Mutation List</h3>
                    <table id="mutationTable" class="mutation-table">
                        <thead>
                            <tr>
                                <th>Position</th>
                                <th>Reference</th>
                                <th>Query</th>
                                <th>Type</th>
                            </tr>
                        </thead>
                        <tbody></tbody>
                    </table>
                </div>

                <div class="export-options">
                    <button class="export-btn pdf-export">
                        <i class="fas fa-file-pdf"></i> Export as PDF
                    </button>
                    <button class="export-btn image-export">
                        <i class="fas fa-file-image"></i> Export as Image
                    </button>
                </div>
                </div>
            `;

        // Update visualizations
        try {
            createMutationChart();
            displaySequenceAlignment();
            populateMutationTable();

            // Add event listeners to export buttons
            const pdfButton = resultsSection.querySelector('.pdf-export');
            const imageButton = resultsSection.querySelector('.image-export');
            
            if (pdfButton) {
                pdfButton.addEventListener('click', async () => {
                    try {
                        await generatePDF();
                    } catch (error) {
                        console.error('PDF export error:', error);
                        alert('Failed to generate PDF. Please try again.');
                    }
                });
            }

            if (imageButton) {
                imageButton.addEventListener('click', async () => {
                    try {
                        await exportAsImage();
                    } catch (error) {
                        console.error('Image export error:', error);
                        alert('Failed to generate image. Please try again.');
                    }
                });
            }
        } catch (error) {
            console.error('Error updating visualizations:', error);
        }
    }

    // Add new helper function for significant mutations
    function getSignificantMutations(mutations) {
        // Sort mutations by position to find clusters
        const sortedMutations = [...mutations].sort((a, b) => a.position - b.position);
        
        // Find mutation clusters (mutations that are close to each other)
        const clusters = [];
        let currentCluster = [sortedMutations[0]];
        
        for (let i = 1; i < sortedMutations.length; i++) {
            if (sortedMutations[i].position - sortedMutations[i-1].position < 10) {
                currentCluster.push(sortedMutations[i]);
            } else {
                if (currentCluster.length > 1) {
                    clusters.push([...currentCluster]);
                }
                currentCluster = [sortedMutations[i]];
            }
        }
        
        if (currentCluster.length > 1) {
            clusters.push(currentCluster);
        }
        
        // Generate HTML for significant mutations
        let html = '';
        
        // Add mutation clusters
        if (clusters.length > 0) {
            html += '<div class="mutation-highlight"><strong>Mutation Clusters:</strong><br>';
            clusters.forEach(cluster => {
                html += `Positions ${cluster[0].position}-${cluster[cluster.length-1].position}: ${cluster.length} mutations<br>`;
            });
            html += '</div>';
        }
        
        // Add most frequent mutation types
        const typeCounts = {};
        mutations.forEach(mutation => {
            typeCounts[mutation.type] = (typeCounts[mutation.type] || 0) + 1;
        });
        
        const sortedTypes = Object.entries(typeCounts)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 3);
        
        if (sortedTypes.length > 0) {
            html += '<div class="mutation-highlight"><strong>Most Common Mutation Types:</strong><br>';
            sortedTypes.forEach(([type, count]) => {
                html += `${type}: ${count} occurrences<br>`;
            });
            html += '</div>';
        }
        
        return html || '<p>No significant mutations found.</p>';
    }

    // Add export functions
    async function exportAsPDF() {
        try {
            const pdfButton = document.querySelector('.pdf-export');
            pdfButton.disabled = true;
            pdfButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating PDF...';

            // Prepare the data to send to server
            const reportData = {
                metadata: comparisonResults.metadata,
                mutations: getFilteredMutations(),
                stats: {
                    totalMutations: document.getElementById('totalMutations').textContent,
                    sequenceLength: document.getElementById('sequenceLength').textContent,
                    mutationRate: document.getElementById('mutationRate').textContent
                },
                chartData: {
                    labels: window.mutationChart.data.labels,
                    data: window.mutationChart.data.datasets[0].data
                },
                generatedDate: new Date().toLocaleString(),
                currentUrl: window.location.href
            };

            // Send data to server
            const response = await fetch('/sequence-comparison/api/generate-pdf', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(reportData)
            });

            if (!response.ok) {
                throw new Error('Failed to generate PDF');
            }

            // Get the PDF blob
            const blob = await response.blob();
            
            // Create download link
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'mutation-report.pdf';
            
            // Trigger download
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);

        } catch (error) {
            console.error('Error generating PDF:', error);
            alert('Failed to generate PDF. Please try again.');
        } finally {
            const pdfButton = document.querySelector('.pdf-export');
            pdfButton.disabled = false;
            pdfButton.innerHTML = '<i class="fas fa-file-pdf"></i> Export as PDF';
        }
    }

    async function exportAsImage() {
        try {
            const element = document.querySelector('.mutation-report');
            if (!element) {
                throw new Error('Report element not found');
            }

            // Create a clone of the element
            const clone = element.cloneNode(true);
            
            // Remove export buttons from clone
            const exportButtons = clone.querySelector('.export-options');
            if (exportButtons) {
                exportButtons.remove();
            }
            
            // Set styles for proper rendering
            clone.style.position = 'absolute';
            clone.style.left = '-9999px';
            clone.style.width = element.offsetWidth + 'px';
            clone.style.background = 'white';
            clone.style.padding = '20px';
            document.body.appendChild(clone);

            // Get the original chart canvas
            const originalChart = document.getElementById('mutationChart');
            const clonedChart = clone.querySelector('#mutationChart');

            if (originalChart && clonedChart) {
                // Wait for a moment to ensure DOM is updated
                await new Promise(resolve => setTimeout(resolve, 100));

                // Create a new chart in the cloned element with simplified options
                const ctx = clonedChart.getContext('2d');
                new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: window.mutationChart.data.labels,
                        datasets: [{
                            label: 'Mutations',
                            data: window.mutationChart.data.datasets[0].data,
                            backgroundColor: 'rgba(66, 133, 244, 0.7)',
                            borderColor: 'rgba(66, 133, 244, 1)',
                            borderWidth: 1
                        }]
                    },
                    options: {
                        animation: false,
                        responsive: false,
                        maintainAspectRatio: false,
                        scales: {
                            y: {
                                beginAtZero: true,
                                ticks: {
                                    font: { family: 'Arial' }
                                },
                                grid: {
                                    display: true
                                }
                            },
                            x: {
                                ticks: {
                                    font: { family: 'Arial' }
                                },
                                grid: {
                                    display: false
                                }
                            }
                        },
                        plugins: {
                            legend: {
                                display: true,
                                labels: {
                                    font: { family: 'Arial' }
                                }
                            },
                            title: {
                                display: true,
                                text: 'Mutation Distribution',
                                font: { family: 'Arial', size: 16 }
                            }
                        }
                    }
                });

                // Wait for chart to render
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            // Configure html2canvas options
            const options = {
                scale: 2,
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#ffffff',
                logging: false,
                removeContainer: true,
                onclone: function(clonedDoc) {
                    const clonedChart = clonedDoc.querySelector('#mutationChart');
                    if (clonedChart) {
                        clonedChart.style.height = '300px';
                        clonedChart.style.width = '100%';
                    }
                }
            };

            // Generate canvas
            const canvas = await html2canvas(clone, options);
            
            // Convert to image and download
            const image = canvas.toDataURL('image/png', 1.0);
            const link = document.createElement('a');
            link.download = 'mutation-report.png';
            link.href = image;
            link.click();

            // Cleanup
            if (document.body.contains(clone)) {
                document.body.removeChild(clone);
            }

        } catch (error) {
            console.error('Error generating image:', error);
            alert('Failed to generate image. Please try again.');
        }
    }

    // ... existing code ...
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
            // Get the chart container
            const chartContainer = document.querySelector('.chart-container');
            if (!chartContainer) {
                throw new Error('Chart container not found');
            }
            
            // Clear previous chart
            chartContainer.innerHTML = '<h4>Mutation Distribution</h4>';
            
            // Create new canvas
            const canvas = document.createElement('canvas');
            canvas.id = 'mutationChart';
            canvas.style.width = '100%';
            canvas.style.height = '300px';
            chartContainer.appendChild(canvas);
            
            // Set canvas dimensions properly for high-DPI displays
            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.getBoundingClientRect();
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            
            // Get context and scale for high-DPI
            const ctx = canvas.getContext('2d');
            ctx.scale(dpr, dpr);
            
            // Prepare data
            const stats = comparisonResults.distributionStats;
            const labels = [];
            const data = [];
            
            // Set up dimensions and spacing
            const chartWidth = rect.width;
            const chartHeight = rect.height;
            const margin = { top: 40, right: 20, bottom: 60, left: 60 };
            const graphWidth = chartWidth - margin.left - margin.right;
            const graphHeight = chartHeight - margin.top - margin.bottom;
            
            // Extract data from stats or compute from mutations
            if (stats && stats.distribution && Array.isArray(stats.distribution)) {
                const binSize = stats.binSize || Math.floor(comparisonResults.metadata.referenceLength / 10);
                
                stats.distribution.forEach((value, i) => {
                    // Use simple numeric labels only
                    labels.push(`${i+1}`);
                    data.push(value);
                });
            } else {
                // Fallback to computing from mutations directly
                const binSize = Math.floor(comparisonResults.metadata.referenceLength / 10);
                const bins = new Array(Math.ceil(comparisonResults.metadata.referenceLength / binSize)).fill(0);
                
                comparisonResults.mutations.forEach(mutation => {
                    const binIndex = Math.floor((mutation.position - 1) / binSize);
                    if (binIndex >= 0 && binIndex < bins.length) {
                        bins[binIndex]++;
                    }
                });
                
                bins.forEach((value, i) => {
                    // Use simple numeric labels only
                    labels.push(`${i+1}`);
                    data.push(value);
                });
            }
            
            // Find maximum data value for scaling
            const maxValue = Math.max(...data, 1); // Avoid division by zero
            
            // Draw chart background
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, chartWidth, chartHeight);
            
            // Draw axes
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(margin.left, margin.top);
            ctx.lineTo(margin.left, chartHeight - margin.bottom);
            ctx.lineTo(chartWidth - margin.right, chartHeight - margin.bottom);
            ctx.stroke();
            
            // Use web-safe fonts
            const systemFont = 'Arial, sans-serif';
            
            // Draw y-axis title
            ctx.save();
            ctx.font = `14px ${systemFont}`;
            ctx.fillStyle = '#333';
            ctx.translate(12, margin.top + graphHeight / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.textAlign = 'center';
            ctx.fillText('Mutations', 0, 0);
            ctx.restore();
            
            // Draw x-axis title
            ctx.font = `14px ${systemFont}`;
            ctx.fillStyle = '#333';
            ctx.textAlign = 'center';
            ctx.fillText('Regions', margin.left + graphWidth / 2, chartHeight - 10);
            
            // Draw y-axis ticks and labels
            const yTickCount = 5;
            ctx.textAlign = 'right';
            ctx.font = `12px ${systemFont}`;
            
            for (let i = 0; i <= yTickCount; i++) {
                const value = (maxValue / yTickCount) * i;
                const y = chartHeight - margin.bottom - (i / yTickCount) * graphHeight;
                
                // Draw tick line
                ctx.beginPath();
                ctx.moveTo(margin.left - 5, y);
                ctx.lineTo(margin.left, y);
                ctx.stroke();
                
                // Draw label
                ctx.fillText(Math.round(value), margin.left - 8, y);
                
                // Draw grid line
                ctx.strokeStyle = '#eee';
                ctx.beginPath();
                ctx.moveTo(margin.left, y);
                ctx.lineTo(chartWidth - margin.right, y);
                ctx.stroke();
                ctx.strokeStyle = '#333';
            }
            
            // Draw bars and x-axis labels
            const barWidth = graphWidth / data.length * 0.8;
            const barSpacing = graphWidth / data.length * 0.2;
            
            ctx.font = `10px ${systemFont}`;
            ctx.textAlign = 'center';
            
            for (let i = 0; i < data.length; i++) {
                // Calculate positions
                const value = data[i];
                const barHeight = (value / maxValue) * graphHeight;
                const x = margin.left + (i * (barWidth + barSpacing)) + barSpacing / 2;
                const y = chartHeight - margin.bottom - barHeight;
                
                // Draw bar
                ctx.fillStyle = 'rgba(66, 133, 244, 0.7)';
                ctx.fillRect(x, y, barWidth, barHeight);
                
                // Draw bar border
                ctx.strokeStyle = 'rgba(66, 133, 244, 1)';
                ctx.strokeRect(x, y, barWidth, barHeight);
                
                // Draw x-axis label - use simple approach without rotation
                ctx.fillStyle = '#333';
                ctx.fillText(labels[i], x + barWidth / 2, chartHeight - margin.bottom + 15);
                
                // Draw tick
                ctx.beginPath();
                ctx.moveTo(x + barWidth / 2, chartHeight - margin.bottom);
                ctx.lineTo(x + barWidth / 2, chartHeight - margin.bottom + 5);
                ctx.stroke();
            }
            
            // Add chart title
            ctx.font = `bold 16px ${systemFont}`;
            ctx.textAlign = 'center';
            ctx.fillText('Mutation Distribution', chartWidth / 2, 20);
            
            // Store chart data for PDF export
            window.chartData = {
                labels: labels,
                data: data
            };
            
            // Create a high-quality static image for PDF export
            // Create a hidden higher-quality canvas for PDF
            const pdfCanvas = document.createElement('canvas');
            pdfCanvas.width = 1200; // High resolution for PDF
            pdfCanvas.height = 600;
            pdfCanvas.style.display = 'none';
            document.body.appendChild(pdfCanvas);
            
            const pdfCtx = pdfCanvas.getContext('2d');
            pdfCtx.fillStyle = 'white';
            pdfCtx.fillRect(0, 0, pdfCanvas.width, pdfCanvas.height);
            
            // Define margins and dimensions
            const pdfMargin = { top: 50, right: 50, bottom: 80, left: 80 };
            const pdfGraphWidth = pdfCanvas.width - pdfMargin.left - pdfMargin.right;
            const pdfGraphHeight = pdfCanvas.height - pdfMargin.top - pdfMargin.bottom;
            
            // Draw axes
            pdfCtx.strokeStyle = '#333';
            pdfCtx.lineWidth = 2;
            pdfCtx.beginPath();
            pdfCtx.moveTo(pdfMargin.left, pdfMargin.top);
            pdfCtx.lineTo(pdfMargin.left, pdfCanvas.height - pdfMargin.bottom);
            pdfCtx.lineTo(pdfCanvas.width - pdfMargin.right, pdfCanvas.height - pdfMargin.bottom);
            pdfCtx.stroke();
            
            // Draw Y-axis title - use only web-safe fonts
            pdfCtx.save();
            pdfCtx.font = 'bold 24px Arial';
            pdfCtx.fillStyle = '#333';
            pdfCtx.translate(25, pdfCanvas.height/2);
            pdfCtx.rotate(-Math.PI/2);
            pdfCtx.textAlign = 'center';
            pdfCtx.fillText('Mutations', 0, 0);
            pdfCtx.restore();
            
            // Draw X-axis title - use only web-safe fonts
            pdfCtx.font = 'bold 24px Arial';
            pdfCtx.fillStyle = '#333';
            pdfCtx.textAlign = 'center';
            pdfCtx.fillText('Regions', pdfCanvas.width/2, pdfCanvas.height - 20);
            
            // Draw grid lines and Y-axis labels
            pdfCtx.textAlign = 'right';
            pdfCtx.font = '18px Arial';
            
            for (let i = 0; i <= 5; i++) {
                const value = (maxValue / 5) * i;
                const y = pdfCanvas.height - pdfMargin.bottom - (i / 5) * pdfGraphHeight;
                
                // Grid line
                pdfCtx.strokeStyle = '#ddd';
                pdfCtx.beginPath();
                pdfCtx.moveTo(pdfMargin.left, y);
                pdfCtx.lineTo(pdfCanvas.width - pdfMargin.right, y);
                pdfCtx.stroke();
                
                // Y-axis label
                pdfCtx.fillStyle = '#333';
                pdfCtx.fillText(Math.round(value).toString(), pdfMargin.left - 10, y + 6);
            }
            
            // Draw bars
            const pdfBarWidth = pdfGraphWidth / data.length * 0.7;
            const pdfBarSpacing = pdfGraphWidth / data.length * 0.3;
            
            for (let i = 0; i < data.length; i++) {
                const value = data[i];
                const barHeight = (value / maxValue) * pdfGraphHeight;
                const x = pdfMargin.left + (i * (pdfBarWidth + pdfBarSpacing)) + pdfBarSpacing/2;
                const y = pdfCanvas.height - pdfMargin.bottom - barHeight;
                
                // Draw bar
                pdfCtx.fillStyle = 'rgba(66, 133, 244, 0.8)';
                pdfCtx.fillRect(x, y, pdfBarWidth, barHeight);
                
                // Draw border
                pdfCtx.strokeStyle = 'rgba(66, 133, 244, 1)';
                pdfCtx.lineWidth = 1;
                pdfCtx.strokeRect(x, y, pdfBarWidth, barHeight);
                
                // Draw value on top if not zero
                if (value > 0) {
                    pdfCtx.fillStyle = '#333';
                    pdfCtx.textAlign = 'center';
                    pdfCtx.font = '16px Arial';
                    pdfCtx.fillText(value.toString(), x + pdfBarWidth/2, y - 10);
                }
                
                // X-axis label - use simple numeric labels with web-safe font
                pdfCtx.fillStyle = '#333';
                pdfCtx.textAlign = 'center';
                pdfCtx.font = '18px Arial';
                
                // Use only the region number without "Region" text to avoid font issues
                const simpleLabel = `${i+1}`;
                pdfCtx.fillText(simpleLabel, x + pdfBarWidth/2, pdfCanvas.height - pdfMargin.bottom + 25);
                
                // Tick mark
                pdfCtx.strokeStyle = '#333';
                pdfCtx.beginPath();
                pdfCtx.moveTo(x + pdfBarWidth/2, pdfCanvas.height - pdfMargin.bottom);
                pdfCtx.lineTo(x + pdfBarWidth/2, pdfCanvas.height - pdfMargin.bottom + 8);
                pdfCtx.stroke();
            }
            
            // Add title with web-safe font
            pdfCtx.font = 'bold 28px Arial';
            pdfCtx.fillStyle = '#333';
            pdfCtx.textAlign = 'center';
            pdfCtx.fillText('Mutation Distribution by Region', pdfCanvas.width/2, 30);
            
            // Store the PDF image URL for use in generatePDF
            window.pdfChartImageUrl = pdfCanvas.toDataURL('image/png');
            
        } catch (error) {
            console.error('Error creating chart:', error);
            createSimpleMutationChart([], []);
        }
    }
    
    // Function to create a simple HTML-based chart as fallback
    function createSimpleMutationChart(labels, data) {
        try {
            const chartContainer = document.querySelector('.chart-container');
            if (!chartContainer) {
                return;
            }
            
            // Clear previous content
            chartContainer.innerHTML = '<h4>Mutation Distribution</h4>';
            
            // Create a simple message for the user
            const message = document.createElement('div');
            message.className = 'chart-error-message';
            message.style.textAlign = 'center';
            message.style.padding = '20px';
            message.style.color = '#666';
            message.innerHTML = '<p>Could not render the mutation distribution chart.</p><p>A simplified version is shown below.</p>';
            chartContainer.appendChild(message);
            
            // If no data provided, try to use the comparisonResults
            if ((!labels || labels.length === 0) && comparisonResults) {
                const stats = comparisonResults.distributionStats;
                labels = [];
                data = [];
                
                if (stats && stats.distribution && Array.isArray(stats.distribution)) {
                    const binSize = stats.binSize || Math.floor(comparisonResults.metadata.referenceLength / 10);
                    
                    stats.distribution.forEach((value, i) => {
                        const start = i * binSize + 1;
                        const end = Math.min((i + 1) * binSize, comparisonResults.metadata.referenceLength);
                        labels.push(`Region ${i+1}`);
                        data.push(value);
                    });
                }
            }
            
            if (!labels || labels.length === 0) {
                // If still no data, show a placeholder
                const placeholder = document.createElement('div');
                placeholder.style.height = '150px';
                placeholder.style.display = 'flex';
                placeholder.style.alignItems = 'center';
                placeholder.style.justifyContent = 'center';
                placeholder.style.border = '1px dashed #ccc';
                placeholder.style.borderRadius = '4px';
                placeholder.style.margin = '10px 0';
                placeholder.innerHTML = '<p>No mutation data available for distribution chart</p>';
                chartContainer.appendChild(placeholder);
                return;
            }
            
            // Create a simple bar chart with HTML/CSS
            const chartDiv = document.createElement('div');
            chartDiv.className = 'simple-chart';
            chartDiv.style.display = 'flex';
            chartDiv.style.height = '200px';
            chartDiv.style.alignItems = 'flex-end';
            chartDiv.style.borderBottom = '1px solid #ccc';
            chartDiv.style.paddingBottom = '30px';
            chartDiv.style.marginTop = '20px';
            
            const maxValue = Math.max(...data, 1); // Avoid division by zero
            
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
                bar.style.border = '1px solid rgba(66, 133, 244, 1)';
                bar.style.height = `${(value / maxValue) * 100}%`;
                bar.style.minHeight = '1px';
                bar.style.position = 'relative';
                bar.title = `Mutations: ${value}`;
                
                barContainer.appendChild(bar);
                
                const label = document.createElement('div');
                label.style.fontSize = '10px';
                label.style.marginTop = '5px';
                label.style.textAlign = 'center';
                label.style.whiteSpace = 'nowrap';
                label.textContent = labels[index] || index + 1;
                barContainer.appendChild(label);
                
                chartDiv.appendChild(barContainer);
            });
            
            chartContainer.appendChild(chartDiv);
            
            // Store chart data for PDF export
            window.chartData = {
                labels: labels,
                data: data
            };
        } catch (error) {
            console.error('Error creating simple chart:', error);
        }
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
        if (!tableBody || !comparisonResults || !comparisonResults.mutations) {
            console.error('Missing required elements for mutation table');
            return;
        }

        // Clear existing rows
        tableBody.innerHTML = '';
        
        // Get filtered mutations
        const filteredMutations = getFilteredMutations();
        console.log('Filtered mutations:', filteredMutations);
        
        // Sort mutations by position
        const sortedMutations = filteredMutations.sort((a, b) => a.position - b.position);
        
        sortedMutations.forEach(mutation => {
            const row = document.createElement('tr');
            
            // Position cell
            const positionCell = document.createElement('td');
            positionCell.textContent = mutation.position;
            row.appendChild(positionCell);
            
            // Reference base cell
            const refCell = document.createElement('td');
            refCell.textContent = mutation.referenceBase === '-' ? 'Gap' : mutation.referenceBase;
            if (mutation.type === 'deletion') {
                refCell.classList.add('deletion');
            } else if (mutation.type === 'substitution') {
                refCell.classList.add('substitution');
            }
            row.appendChild(refCell);
            
            // Query base cell
            const queryCell = document.createElement('td');
            queryCell.textContent = mutation.queryBase === '-' ? 'Gap' : mutation.queryBase;
            if (mutation.type === 'insertion') {
                queryCell.classList.add('insertion');
            } else if (mutation.type === 'substitution') {
                queryCell.classList.add('substitution');
            }
            row.appendChild(queryCell);
            
            // Mutation type cell
            const typeCell = document.createElement('td');
            typeCell.textContent = mutation.type.charAt(0).toUpperCase() + mutation.type.slice(1);
            typeCell.classList.add(mutation.type.toLowerCase());
            row.appendChild(typeCell);
            
            tableBody.appendChild(row);
        });

        // Update summary counts
        const totalMutations = document.getElementById('totalMutations');
        const sequenceLength = document.getElementById('sequenceLength');
        const mutationRate = document.getElementById('mutationRate');

        if (totalMutations) totalMutations.textContent = sortedMutations.length;
        if (sequenceLength && comparisonResults.metadata) {
            sequenceLength.textContent = comparisonResults.metadata.referenceLength;
        }
        if (mutationRate && comparisonResults.metadata) {
            const rate = ((sortedMutations.length / comparisonResults.metadata.referenceLength) * 100).toFixed(2);
            mutationRate.textContent = rate + '%';
        }
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
    
    // Function to generate PDF with our high-quality chart
    async function generatePDF() {
        try {
            // Show loading indicator
            document.body.classList.add('loading');
            document.body.insertAdjacentHTML('beforeend', 
                '<div id="pdfLoadingOverlay" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999;display:flex;justify-content:center;align-items:center;">' +
                '<div style="background:white;padding:20px;border-radius:5px;text-align:center;">' +
                '<div style="border:5px solid #f3f3f3;border-top:5px solid #3498db;border-radius:50%;width:50px;height:50px;margin:0 auto 15px;animation:spin 2s linear infinite;"></div>' +
                '<p>Generating PDF... Please wait...</p></div></div>'
            );
            
            // Add animation style
            const styleEl = document.createElement('style');
            styleEl.textContent = '@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }';
            document.head.appendChild(styleEl);
            
            // Get data from the page
            const titleText = 'Sequence Comparison Report';
            const dateText = new Date().toLocaleString();
            const totalMutations = document.getElementById('totalMutations')?.textContent || '0';
            const sequenceLength = document.getElementById('sequenceLength')?.textContent || '0';
            const mutationRate = document.getElementById('mutationRate')?.textContent || '0%';
            
            // Create a temporary container for PDF content
            const pdfContainer = document.createElement('div');
            pdfContainer.style.width = '210mm';
            pdfContainer.style.padding = '10mm';
            pdfContainer.style.visibility = 'hidden';
            pdfContainer.style.position = 'absolute';
            pdfContainer.style.top = '-9999px';
            pdfContainer.style.background = 'white';
            pdfContainer.style.fontSize = '10pt';
            pdfContainer.style.fontFamily = 'Arial, Helvetica, sans-serif';
            document.body.appendChild(pdfContainer);
            
            // Build PDF content with styled HTML
            pdfContainer.innerHTML = `
                <div style="text-align:center;margin-bottom:20px;">
                    <h1 style="font-size:18pt;margin-bottom:5px;">${titleText}</h1>
                    <p style="font-size:9pt;color:#666;">Generated: ${dateText}</p>
                </div>
                
                <div style="background:#f5f8ff;padding:15px;border-radius:5px;margin-bottom:20px;">
                    <h2 style="font-size:14pt;margin-top:0;margin-bottom:10px;">Summary</h2>
                    <table style="width:100%;border-collapse:collapse;">
                        <tr>
                            <td style="padding:5px 10px;width:33%;"><b>Total Mutations:</b> ${totalMutations}</td>
                            <td style="padding:5px 10px;width:33%;"><b>Sequence Length:</b> ${sequenceLength}</td>
                            <td style="padding:5px 10px;width:33%;"><b>Mutation Rate:</b> ${mutationRate}</td>
                        </tr>
                    </table>
                </div>
                
                <div style="margin-bottom:20px;">
                    <h2 style="font-size:14pt;margin-bottom:10px;">Sequence Information</h2>
                    <div style="display:flex;justify-content:space-between;flex-wrap:wrap;">
                        <div style="width:48%;background:#f9f9f9;padding:10px;border-radius:5px;">
                            <h3 style="font-size:12pt;margin-top:0;margin-bottom:5px;">Reference Sequence</h3>
                            <div id="pdfRefMetadata"></div>
                        </div>
                        <div style="width:48%;background:#f9f9f9;padding:10px;border-radius:5px;">
                            <h3 style="font-size:12pt;margin-top:0;margin-bottom:5px;">Query Sequence</h3>
                            <div id="pdfQueryMetadata"></div>
                        </div>
                    </div>
                </div>
                
                <div style="margin-bottom:20px;">
                    <h2 style="font-size:14pt;margin-bottom:10px;">Mutation Distribution</h2>
                    <div id="pdfChartContainer" style="width:100%;height:250px;background:#f9f9f9;padding:10px;border-radius:5px;">
                        <div id="pdfChartImageContainer" style="width:100%;height:230px;display:flex;justify-content:center;align-items:center;"></div>
                    </div>
                </div>
                
                <div style="page-break-before:always;">
                    <h2 style="font-size:14pt;margin-top:0;margin-bottom:10px;">Detailed Mutation List</h2>
                    <div id="pdfMutationTable"></div>
                </div>
                
                <div id="pdfCitation" style="page-break-before:always;">
                    <h2 style="font-size:14pt;margin-bottom:10px;text-align:center;">Citation Information</h2>
                    <hr style="border:none;border-top:2px solid #4285f4;width:70%;margin:0 auto 20px;">
                    
                    <h3 style="font-size:12pt;margin-bottom:5px;">How to Cite This Tool</h3>
                    
                    <div style="margin-bottom:15px;">
                        <h4 style="font-size:11pt;margin-bottom:5px;">APA Format:</h4>
                        <p style="background:#f9f9f9;padding:10px;border-radius:5px;font-size:9pt;">
                            Priyam, J. (2025). Jyotsna's NCBI Tools - Sequence Comparison Tool. DOI: 10.5281/zenodo.15069907
                        </p>
                    </div>
                    
                    <div style="margin-bottom:15px;">
                        <h4 style="font-size:11pt;margin-bottom:5px;">MLA Format:</h4>
                        <p style="background:#f9f9f9;padding:10px;border-radius:5px;font-size:9pt;">
                            Priyam, J. "Jyotsna's NCBI Tools - Sequence Comparison Tool." 2025, DOI: 10.5281/zenodo.15069907.
                            Accessed ${new Date().toLocaleDateString('en-US', {month: 'long', day: 'numeric', year: 'numeric'})}.
                        </p>
                    </div>
                    
                    <div style="margin-bottom:15px;">
                        <h4 style="font-size:11pt;margin-bottom:5px;">Chicago Format:</h4>
                        <p style="background:#f9f9f9;padding:10px;border-radius:5px;font-size:9pt;">
                            Priyam, J. "Jyotsna's NCBI Tools - Sequence Comparison Tool." Last modified 2025. DOI: 10.5281/zenodo.15069907.
                        </p>
                    </div>
                    
                    <div style="margin-top:20px;">
                        <h3 style="font-size:12pt;margin-bottom:10px;">Academic Citation Examples</h3>
                        
                        <div style="margin-bottom:15px;">
                            <h4 style="font-size:11pt;margin-bottom:5px;">In a Journal Article:</h4>
                            <p style="background:#f5f5f5;padding:10px;border-radius:5px;font-size:9pt;">
                                In our analysis of genetic mutations across multiple Vibrio strains, we utilized Jyotsna's NCBI 
                                Tools (Priyam, 2025) for sequence comparison, which revealed a 1.19% mutation rate concentrated 
                                primarily in regions 3 and 4 of the genome.
                            </p>
                        </div>
                        
                        <div style="margin-bottom:15px;">
                            <h4 style="font-size:11pt;margin-bottom:5px;">In a Research Report:</h4>
                            <p style="background:#f5f5f5;padding:10px;border-radius:5px;font-size:9pt;">
                                The mutation analysis was performed using the Sequence Comparison Tool<sup>1</sup>, which identified 
                                8 substitution mutations primarily concentrated in regions 3-5.
                                <br><br>
                                <sup>1</sup>Jyotsna's NCBI Tools - Sequence Comparison Tool (v1.0), developed by Priyam, J., 2025. 
                                Available at: 10.5281/zenodo.15069907
                            </p>
                        </div>
                    </div>
                </div>
            `;
            
            // Add reference metadata
            const refMeta = document.getElementById('referenceMetadata');
            if (refMeta) {
                document.getElementById('pdfRefMetadata').innerHTML = refMeta.innerHTML;
            } else {
                document.getElementById('pdfRefMetadata').textContent = 'N/A';
            }
            
            // Add query metadata
            const queryMeta = document.getElementById('queryMetadata');
            if (queryMeta) {
                document.getElementById('pdfQueryMetadata').innerHTML = queryMeta.innerHTML;
            } else {
                document.getElementById('pdfQueryMetadata').textContent = 'N/A';
            }
            
            // Clone mutation table
            const mutationTable = document.getElementById('mutationTable');
            if (mutationTable) {
                const tableClone = mutationTable.cloneNode(true);
                tableClone.style.width = '100%';
                tableClone.style.borderCollapse = 'collapse';
                tableClone.style.fontSize = '9pt';
                
                // Style the table headers and cells
                Array.from(tableClone.querySelectorAll('th')).forEach(th => {
                    th.style.backgroundColor = '#4285f4';
                    th.style.color = 'white';
                    th.style.padding = '8px';
                    th.style.textAlign = 'left';
                    th.style.border = '1px solid #ddd';
                });
                
                Array.from(tableClone.querySelectorAll('td')).forEach(td => {
                    td.style.padding = '6px';
                    td.style.border = '1px solid #ddd';
                    
                    // Style mutation types
                    if (td.textContent.trim() === 'Substitution') {
                        td.style.color = '#007bff';
                    } else if (td.textContent.trim() === 'Insertion') {
                        td.style.color = '#28a745';
                    } else if (td.textContent.trim() === 'Deletion') {
                        td.style.color = '#dc3545';
                    }
                });
                
                // Add alternating row colors
                Array.from(tableClone.querySelectorAll('tr:nth-child(even)')).forEach(tr => {
                    tr.style.backgroundColor = '#f9f9f9';
                });
                
                document.getElementById('pdfMutationTable').appendChild(tableClone);
            }
            
            // Add the mutation distribution chart if available
            /*
            if (window.pdfChartImageUrl) {
                // Insert the high-quality image into the container
                document.getElementById('pdfChartImageContainer').innerHTML = `<img src="${window.pdfChartImageUrl}" alt="Mutation Distribution Chart" style="max-width:100%;max-height:230px;">`;
            } else if (window.chartData && window.chartData.data) {
                // Fallback: Create a simple text representation of the chart data
                const chartData = window.chartData.data;
                const chartLabels = Array.from({length: chartData.length}, (_, i) => `${i+1}`);
                
                let chartHtml = '<div style="text-align:center;color:#333;"><p style="margin-bottom:10px;"><b>Mutation Distribution:</b></p>';
                chartHtml += '<div style="display:flex;justify-content:center;flex-wrap:wrap;">';
                
                for (let i = 0; i < chartData.length; i++) {
                    chartHtml += `<div style="margin:5px;text-align:center;width:60px;">
                        <div style="height:60px;display:flex;flex-direction:column;justify-content:flex-end;">
                            <div style="background-color:rgba(66,133,244,0.7);width:40px;margin:0 auto;height:${Math.min(chartData[i] * 5, 50)}px;"></div>
                        </div>
                        <div style="font-size:8pt;margin-top:5px;">${chartLabels[i]}: ${chartData[i]}</div>
                    </div>`;
                }
                
                chartHtml += '</div></div>';
                document.getElementById('pdfChartImageContainer').innerHTML = chartHtml;
            } else if (comparisonResults && comparisonResults.mutations) {
                // Generate chart data from mutations and create text representation
                const regionCount = 10;
                const chartLabels = Array.from({length: regionCount}, (_, i) => `${i+1}`);
                const chartData = Array(regionCount).fill(0);
                
                const sequenceLength = comparisonResults.metadata.referenceLength;
                const regionSize = Math.ceil(sequenceLength / regionCount);
                
                comparisonResults.mutations.forEach(mutation => {
                    const regionIndex = Math.min(Math.floor(mutation.position / regionSize), regionCount - 1);
                    chartData[regionIndex]++;
                });
                
                let chartHtml = '<div style="text-align:center;color:#333;"><p style="margin-bottom:10px;"><b>Mutation Distribution:</b></p>';
                chartHtml += '<div style="display:flex;justify-content:center;flex-wrap:wrap;">';
                
                for (let i = 0; i < chartData.length; i++) {
                    chartHtml += `<div style="margin:5px;text-align:center;width:60px;">
                        <div style="height:60px;display:flex;flex-direction:column;justify-content:flex-end;">
                            <div style="background-color:rgba(66,133,244,0.7);width:40px;margin:0 auto;height:${Math.min(chartData[i] * 5, 50)}px;"></div>
                        </div>
                        <div style="font-size:8pt;margin-top:5px;">${chartLabels[i]}: ${chartData[i]}</div>
                    </div>`;
                }
                
                chartHtml += '</div></div>';
                document.getElementById('pdfChartImageContainer').innerHTML = chartHtml;
            } else {
                document.getElementById('pdfChartContainer').innerHTML = 
                    '<div style="text-align:center;padding:20px;color:#666;">No mutation data available for visualization</div>';
            }
            */
            
            // Instead of the chart, add a placeholder message
            document.getElementById('pdfChartContainer').innerHTML = 
                '<div style="text-align:center;padding:20px;color:#666;">Chart rendering temporarily disabled</div>';
            
            // Use html2pdf to generate PDF
            const pdfOptions = {
                margin: 10,
                filename: 'sequence-comparison-report.pdf',
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { 
                    scale: 2,
                    useCORS: true,
                    letterRendering: true,
                    allowTaint: true
                },
                jsPDF: { 
                    unit: 'mm', 
                    format: 'a4', 
                    orientation: 'portrait' 
                }
            };
            
            // Wait for chart to render
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Generate and download PDF
            const pdf = await html2pdf().from(pdfContainer).set(pdfOptions).save();
            
            // Clean up
            document.body.removeChild(pdfContainer);
            document.body.removeChild(document.getElementById('pdfLoadingOverlay'));
            document.body.classList.remove('loading');
            document.head.removeChild(styleEl);
            
        } catch (error) {
            console.error('PDF Generation Error:', error);
            alert('Error generating PDF: ' + error.message);
            
            // Clean up on error
            const overlay = document.getElementById('pdfLoadingOverlay');
            if (overlay) document.body.removeChild(overlay);
            document.body.classList.remove('loading');
            
            const pdfContainer = document.querySelector('div[style*="visibility: hidden"][style*="position: absolute"]');
            if (pdfContainer) document.body.removeChild(pdfContainer);
        }
    }
});