/**
 * Sequence Comparison Tool - Client-side JavaScript
 * Handles file uploads, NCBI sequence fetching, visualization, and export
 */

document.addEventListener('DOMContentLoaded', function() {
    // Set global Chart.js defaults for fonts
    if (typeof Chart !== 'undefined') {
        // Use only web-safe fonts that are guaranteed to be available
        Chart.defaults.font.family = 'Helvetica, Arial, sans-serif';
        Chart.defaults.font.size = 12;
        Chart.defaults.color = '#333';
        
        // Add a global plugin to enhance text rendering
        Chart.register({
            id: 'improvedFonts',
            beforeDraw: function(chart) {
                const ctx = chart.ctx;
                ctx.textBaseline = 'middle';
                ctx.textAlign = 'center';
                // Force font to standard web safe font
                ctx.font = '12px Helvetica, Arial, sans-serif';
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
            }
        });
        
        // Override the default Chart.js render function to ensure high quality rendering
        const originalRender = Chart.prototype.render;
        Chart.prototype.render = function() {
            const ctx = this.ctx;
            if (ctx) {
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.textRendering = 'geometricPrecision';
                
                // Set higher DPI for chart rendering
                const canvas = this.canvas;
                const rect = canvas.getBoundingClientRect();
                canvas.width = rect.width * 2;
                canvas.height = rect.height * 2;
                ctx.scale(2, 2);
                canvas.style.width = rect.width + 'px';
                canvas.style.height = rect.height + 'px';
            }
            return originalRender.apply(this, arguments);
        };
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
    async function generatePDF() {
        try {
            // Step 1: First, capture the chart as a high-quality image
            const chartElement = document.getElementById('mutationChart');
            if (!chartElement) {
                throw new Error('Chart element not found');
            }

            // Set up a loading indicator
            const loadingIndicator = document.createElement('div');
            loadingIndicator.style.position = 'fixed';
            loadingIndicator.style.top = '50%';
            loadingIndicator.style.left = '50%';
            loadingIndicator.style.transform = 'translate(-50%, -50%)';
            loadingIndicator.style.padding = '20px';
            loadingIndicator.style.background = 'rgba(255, 255, 255, 0.9)';
            loadingIndicator.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.3)';
            loadingIndicator.style.borderRadius = '5px';
            loadingIndicator.style.zIndex = '9999';
            loadingIndicator.innerHTML = 'Generating PDF... Please wait';
            document.body.appendChild(loadingIndicator);

            // Use html2canvas to capture the chart with high quality
            console.log('Capturing chart...');
            const chartCanvas = await html2canvas(chartElement, {
                scale: 3, // Higher scale for better quality
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#ffffff'
            });
            
            // Convert canvas to image data
            const chartImage = chartCanvas.toDataURL('image/png', 1.0);
            console.log('Chart captured as image');

            // Step 2: Now create the PDF with the captured chart image
            console.log('Creating PDF...');
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF('portrait', 'mm', 'a4');

            // Set document properties
            doc.setProperties({
                title: 'Sequence Comparison Report',
                subject: 'Mutation Analysis',
                author: 'Jyotsna\'s NCBI Tools',
                creator: 'Sequence Comparison Tool'
            });

            // Get citation information
            let citationInfo;
            try {
                const response = await fetch('/api/citation-config');
                citationInfo = await response.json();
            } catch (error) {
                console.error('Error fetching citation info:', error);
                citationInfo = {
                    author: 'Priyam, J.',
                    title: 'Jyotsna\'s NCBI Tools',
                    year: new Date().getFullYear(),
                    doi: '10.5281/zenodo.15069907',
                    url: window.location.href
                };
            }

            // Get data for the report
            const totalMutations = document.getElementById('totalMutations').textContent;
            const sequenceLength = document.getElementById('sequenceLength').textContent;
            const mutationRate = document.getElementById('mutationRate').textContent;
            const currentDate = new Date().toLocaleDateString('en-US', {
                day: 'numeric', month: 'long', year: 'numeric'
            });

            // Function to add footer to each page
            const addFooter = function(doc) {
                // Get the current number of pages
                const pageCount = doc.internal.getNumberOfPages();
                
                // Loop through each page
                for (let i = 1; i <= pageCount; i++) {
                    // Set current page
                    doc.setPage(i);
                    
                    // Draw footer line
                    doc.setDrawColor(0, 0, 0);
                    doc.setLineWidth(0.5);
                    doc.line(10, 282, 200, 282);
                    
                    // Add citation text
                    const citationText = `${citationInfo.author} (${citationInfo.year}). ${citationInfo.title} - Sequence Comparison Tool. DOI: ${citationInfo.doi}`;
                    doc.setFont("helvetica", "normal");
                    doc.setFontSize(8);
                    doc.setTextColor(0, 0, 0);
                    doc.text(citationText, 105, 287, { align: 'center', maxWidth: 180 });
                    
                    // Add page numbers
                    doc.setFont("helvetica", "bold");
                    doc.text(`Page ${i} of ${pageCount}`, 195, 292, { align: 'right' });
                }
            };

            // START PAGE 1 - TITLE AND SUMMARY
            let yPos = 20;
            
            // Title
            doc.setFont("helvetica", "bold");
            doc.setFontSize(20);
            doc.setTextColor(0, 0, 0);
            doc.text('Sequence Comparison Report', 105, yPos, { align: 'center' });
            yPos += 15;

            // Date
            doc.setFont("helvetica", "normal");
            doc.setFontSize(10);
            doc.text(`Generated: ${currentDate}`, 20, yPos);
            yPos += 20;

            // Summary heading
            doc.setFont("helvetica", "bold");
            doc.setFontSize(14);
            doc.text('Summary Statistics', 20, yPos);
            yPos += 10;

            // Summary data
            doc.setFont("helvetica", "normal");
            doc.setFontSize(11);
            doc.text(`Total Mutations: ${totalMutations}`, 25, yPos);
            yPos += 8;
            doc.text(`Sequence Length: ${sequenceLength}`, 25, yPos);
            yPos += 8;
            doc.text(`Mutation Rate: ${mutationRate}`, 25, yPos);
            yPos += 20;

            // Chart heading
            doc.setFont("helvetica", "bold");
            doc.setFontSize(14);
            doc.text('Mutation Distribution', 105, yPos, { align: 'center' });
            yPos += 10;

            // Add the chart image to the PDF
            try {
                // Calculate dimensions to fit the page while maintaining aspect ratio
                const chartAspectRatio = chartCanvas.height / chartCanvas.width;
                const chartWidth = 160; // mm - width on the PDF page
                const chartHeight = chartWidth * chartAspectRatio;
                
                // Calculate position to center the chart
                const leftMargin = (210 - chartWidth) / 2; // A4 width is 210mm
                
                // Add image to PDF
                doc.addImage(
                    chartImage, 
                    'PNG', 
                    leftMargin, 
                    yPos, 
                    chartWidth, 
                    chartHeight, 
                    undefined, 
                    'FAST'
                );
                
                yPos += chartHeight + 20;
            } catch (chartError) {
                console.error('Error adding chart to PDF:', chartError);
                doc.setFont("helvetica", "italic");
                doc.setFontSize(10);
                doc.text('Chart could not be included in the PDF. Please check the application interface.', 105, yPos, { align: 'center' });
                yPos += 20;
            }

            // START PAGE 2 - MUTATION TABLE
            doc.addPage();
            yPos = 20;

            // Mutation table heading
            doc.setFont("helvetica", "bold");
            doc.setFontSize(14);
            doc.text('Mutation Details', 20, yPos);
            yPos += 10;

            // Add mutation table
            const table = document.getElementById('mutationTable');
            if (table) {
                doc.autoTable({
                    html: '#mutationTable',
                    startY: yPos,
                    styles: {
                        fontSize: 9,
                        font: 'helvetica',
                        cellPadding: 3
                    },
                    headStyles: {
                        fillColor: [40, 40, 40],
                        textColor: [255, 255, 255],
                        fontStyle: 'bold',
                        halign: 'center'
                    },
                    columnStyles: {
                        0: { halign: 'center' }, // Position
                        3: { halign: 'center' }  // Type
                    },
                    margin: { top: 20, bottom: 30 },
                    didDrawPage: function(data) {
                        // Update yPos after table
                        yPos = data.cursor.y;
                    }
                });
            }

            // START PAGE 3 - CITATION INFORMATION
            doc.addPage();
            yPos = 20;

            // Citation heading
            doc.setFont("helvetica", "bold");
            doc.setFontSize(16);
            doc.text('How to Cite This Tool', 105, yPos, { align: 'center' });
            yPos += 20;

            // APA format
            doc.setFont("helvetica", "bold");
            doc.setFontSize(12);
            doc.text('APA Format:', 20, yPos);
            yPos += 10;
            
            doc.setFont("helvetica", "normal");
            doc.setFontSize(10);
            doc.text(`${citationInfo.author} (${citationInfo.year}). ${citationInfo.title} - Sequence Comparison Tool. DOI: ${citationInfo.doi}`, 30, yPos, {
                maxWidth: 160
            });
            yPos += 20;

            // MLA format
            doc.setFont("helvetica", "bold");
            doc.setFontSize(12);
            doc.text('MLA Format:', 20, yPos);
            yPos += 10;
            
            doc.setFont("helvetica", "normal");
            doc.setFontSize(10);
            doc.text(`${citationInfo.author} "${citationInfo.title} - Sequence Comparison Tool." ${citationInfo.year}, ${citationInfo.url}. DOI: ${citationInfo.doi}. Accessed ${currentDate}.`, 30, yPos, {
                maxWidth: 160
            });
            yPos += 20;

            // BibTeX format
            doc.setFont("helvetica", "bold");
            doc.setFontSize(12);
            doc.text('BibTeX Format:', 20, yPos);
            yPos += 10;
            
            const bibtexText = 
`@software{${citationInfo.doi.replace(/\./g, '_').replace(/\//g, '_')},
  title={{${citationInfo.title} - Sequence Comparison Tool}},
  author={${citationInfo.author}},
  year={${citationInfo.year}},
  doi={${citationInfo.doi}},
  url={${citationInfo.url}},
  note={Accessed: ${currentDate}}
}`;
            
            doc.setFont("courier", "normal");
            doc.setFontSize(9);
            doc.text(bibtexText, 30, yPos, {
                maxWidth: 160
            });

            // THIS IS CRITICAL - Add footer to all pages
            console.log('Adding footer to all pages...');
            addFooter(doc);

            // Save the PDF
            doc.save('sequence-comparison-report.pdf');
            console.log('PDF saved successfully');

            // Remove loading indicator
            document.body.removeChild(loadingIndicator);

        } catch (error) {
            console.error('PDF Generation Error:', error);
            alert('Error generating PDF: ' + error.message);
            
            // Ensure loading indicator is removed even on error
            const loadingIndicator = document.querySelector('[style*="position: fixed"][style*="top: 50%"]');
            if (loadingIndicator) {
                document.body.removeChild(loadingIndicator);
            }
        }
    }

    // Add this function before generatePDF
    function prepareChartForExport() {
        // Get the current chart if it exists
        const chartElement = document.getElementById('mutationChart');
        if (!chartElement || !window.mutationChart) {
            console.log('No chart available for export preparation');
            return null;
        }
        
        try {
            // Create a temporary canvas with higher resolution
            const tempCanvas = document.createElement('canvas');
            tempCanvas.id = 'exportChart';
            tempCanvas.style.display = 'none';
            document.body.appendChild(tempCanvas);
            
            // Set high resolution
            const width = chartElement.width;
            const height = chartElement.height;
            tempCanvas.width = width * 3; // 3x resolution
            tempCanvas.height = height * 3;
            
            // Get chart data
            const chartData = window.chartData || {
                labels: [],
                data: []
            };
            
            // Create a new chart with higher quality settings
            const ctx = tempCanvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            
            // Create a high-resolution version of the chart
            const exportChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: chartData.labels,
                    datasets: [{
                        label: 'Mutations',
                        data: chartData.data,
                        backgroundColor: 'rgba(66, 133, 244, 0.8)',
                        borderColor: 'rgba(50, 100, 200, 1)',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: false,
                    maintainAspectRatio: false,
                    devicePixelRatio: 3,
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: {
                                color: 'rgba(200, 200, 200, 0.3)',
                                lineWidth: 0.5
                            },
                            ticks: {
                                font: {
                                    family: 'Helvetica, Arial, sans-serif',
                                    size: 14
                                }
                            }
                        },
                        x: {
                            grid: {
                                display: false
                            },
                            ticks: {
                                font: {
                                    family: 'Helvetica, Arial, sans-serif',
                                    size: 14
                                }
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            enabled: false
                        }
                    }
                }
            });
            
            // Return the canvas for later use
            return {
                canvas: tempCanvas,
                chart: exportChart
            };
        } catch (error) {
            console.error('Error preparing chart for export:', error);
            return null;
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
            
            // Enable high-quality rendering
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.textRendering = 'geometricPrecision';
            
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
            
            // Store data for PDF export
            window.chartData = { labels, data };
            
            // Use Chart.js for better rendering
            if (window.Chart) {
                // Destroy previous chart instance if it exists
                if (window.mutationChart) {
                    window.mutationChart.destroy();
                }
                
                // Create new chart with high-quality settings
                window.mutationChart = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Mutations',
                            data: data,
                            backgroundColor: 'rgba(66, 133, 244, 0.8)',
                            borderColor: 'rgba(66, 133, 244, 1)',
                            borderWidth: 1
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        devicePixelRatio: dpr,
                        animation: {
                            duration: 500
                        },
                        plugins: {
                            legend: {
                                display: false
                            },
                            tooltip: {
                                titleFont: {
                                    family: 'Helvetica, Arial, sans-serif',
                                    size: 12
                                },
                                bodyFont: {
                                    family: 'Helvetica, Arial, sans-serif',
                                    size: 12
                                },
                                padding: 10,
                                displayColors: false
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                title: {
                                    display: true,
                                    text: 'Mutations',
                                    font: {
                                        family: 'Helvetica, Arial, sans-serif',
                                        size: 12,
                                        weight: 'bold'
                                    }
                                },
                                ticks: {
                                    font: {
                                        family: 'Helvetica, Arial, sans-serif',
                                        size: 10
                                    }
                                },
                                grid: {
                                    color: 'rgba(200, 200, 200, 0.3)',
                                    lineWidth: 0.5
                                }
                            },
                            x: {
                                title: {
                                    display: true,
                                    text: 'Regions',
                                    font: {
                                        family: 'Helvetica, Arial, sans-serif',
                                        size: 12,
                                        weight: 'bold'
                                    }
                                },
                                ticks: {
                                    font: {
                                        family: 'Helvetica, Arial, sans-serif',
                                        size: 10
                                    },
                                    maxRotation: 0,
                                    autoSkip: true,
                                    maxTicksLimit: 10
                                },
                                grid: {
                                    display: false
                                }
                            }
                        }
                    }
                });
                
                return;
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
            
            // Use web-safe fonts for better rendering
            const systemFont = 'Helvetica, Arial, sans-serif';
            
            // Draw y-axis title
            ctx.save();
            ctx.font = `bold 14px ${systemFont}`;
            ctx.fillStyle = '#333';
            ctx.translate(12, margin.top + graphHeight / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.textAlign = 'center';
            ctx.fillText('Mutations', 0, 0);
            ctx.restore();
            
            // Draw x-axis title
            ctx.font = `bold 14px ${systemFont}`;
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
    

}); // End of DOMContentLoaded

function validateSequence(sequence) {
    // Remove whitespace and non-sequence characters
    sequence = sequence.replace(/\s+/g, '');
    
    // Check if sequence only contains valid nucleotides
    const validSequence = sequence.match(/^[ATCG\-]+$/i);
    
    if (!validSequence) {
        throw new Error('Invalid sequence. Only A, T, C, G characters and gaps (-) are allowed.');
    }
    
    return sequence.toUpperCase();
}

function cleanSequence(sequence) {
    // Remove any citation text that might have been copied
    sequence = sequence.replace(/DNA\s*Analysis\s*Tool.*?localhost:[0-9]+\/[a-zA-Z-]+/g, '');
    // Remove any non-sequence characters, keeping only valid nucleotides and gaps
    sequence = sequence.replace(/[^ATCG\-]/gi, '');
    return sequence.toUpperCase();
}

function compareSequences() {
    try {
        let seq1 = document.getElementById('referenceSequence').value;
        let seq2 = document.getElementById('querySequence').value;
        
        // Clean sequences before comparison
        seq1 = cleanSequence(seq1);
        seq2 = cleanSequence(seq2);
        
        // Rest of your comparison code...
    } catch (error) {
        console.error('Comparison error:', error);
        alert('Error comparing sequences: ' + error.message);
    }
}