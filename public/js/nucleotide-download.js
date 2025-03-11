class NucleotideDownloader {
    constructor() {
        this.baseUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
        this.email = 'your.email@example.com';
        this.delay = 500;
        
        // Initialize elements first
        this.initializeElements();
        // Then bind event listeners
        this.bindEventListeners();
        this.loadConfig();
    }

    initializeElements() {
        this.startIdInput = document.getElementById('startId');
        this.endIdInput = document.getElementById('endId');
        this.previewLength = document.getElementById('previewLength');
        this.downloadBtn = document.getElementById('downloadBtn');
        this.statusDiv = document.getElementById('status');
        this.previewTable = document.getElementById('previewTable').querySelector('tbody');
    }

    bindEventListeners() {
        if (this.downloadBtn) {
            this.downloadBtn.addEventListener('click', () => this.handleDownload());
        }
        
        if (this.previewLength) {
            this.previewLength.addEventListener('change', () => {
                const th = document.querySelector('#previewTable thead th:last-child');
                if (th) {
                    th.textContent = `Sequence (first ${this.previewLength.value} bp)`;
                }
            });
        }
    }

    async loadConfig() {
        try {
            const response = await fetch('/api/config');
            const config = await response.json();
            this.email = config.email;
        } catch (error) {
            console.error('Failed to load config:', error);
        }
    }

    // Update the preview display in handleDownload
    async handleDownload() {
        try {
            this.downloadBtn.disabled = true;
            this.updateStatus('Generating accession IDs...', 'loading');
            
            const startId = this.startIdInput.value.trim();
            const endId = this.endIdInput.value.trim();
            
            // Generate filename from range
            const filename = `${startId}-${endId}.csv`;
            
            const accessions = this.generateAccessionRange(startId, endId);
            const sequences = [];
            
            this.updateStatus(`Fetching ${accessions.length} sequences...`, 'loading');
            this.previewTable.innerHTML = '';
            
            let successCount = 0;
            let errorCount = 0;
            
            // Use smaller batch size and longer delay between batches
            const batchSize = 2; // Reduce to 2 sequences at a time
            for (let i = 0; i < accessions.length; i += batchSize) {
                const batch = accessions.slice(i, i + batchSize);
                
                // Process batch concurrently
                const results = await Promise.allSettled(
                    batch.map(accessionId => this.fetchSequence(accessionId))
                );
                
                // Process results
                results.forEach((result, index) => {
                    const accessionId = batch[index];
                    
                    if (result.status === 'fulfilled') {
                        const sequence = result.value;
                        sequences.push({ accessionId, sequence });
                        successCount++;
                        
                        // Update preview
                        const row = this.previewTable.insertRow();
                        row.insertCell(0).textContent = accessionId;
                        
                        // Update preview with selected length
                        const previewLen = parseInt(this.previewLength.value);
                        row.insertCell(1).textContent = sequence.substring(0, previewLen) + '...';
                    } else {
                        console.error(`Error with ${accessionId}:`, result.reason);
                        sequences.push({ accessionId, sequence: 'ERROR: ' + result.reason.message });
                        errorCount++;
                        
                        // Add error row to preview
                        const row = this.previewTable.insertRow();
                        row.insertCell(0).textContent = accessionId;
                        const errorCell = row.insertCell(1);
                        errorCell.textContent = 'ERROR: ' + result.reason.message;
                        errorCell.classList.add('error-text');
                    }
                });
                
                // Add a longer delay between batches to avoid NCBI rate limits
                if (i + batchSize < accessions.length) {
                    this.updateStatus(`Pausing to avoid rate limits... (${i+batchSize}/${accessions.length} processed)`, 'info');
                    await new Promise(resolve => setTimeout(resolve, 2000)); // Increased delay to 2 seconds
                }
            }
            
            // Generate CSV with dynamic filename
            const csvContent = this.generateCSV(sequences);
            this.downloadCSV(csvContent, filename);
            
            const statusMessage = `Download complete! ${successCount} sequences downloaded successfully, ${errorCount} errors.`;
            this.updateStatus(statusMessage, errorCount > 0 ? 'warning' : 'success');
        } catch (error) {
            console.error('Download error:', error);
            this.updateStatus(`Error: ${error.message}`, 'error');
        } finally {
            this.downloadBtn.disabled = false;
        }
    }

    updateStatus(message, type = 'info') {
        if (this.statusDiv) {
            this.statusDiv.textContent = message;
            this.statusDiv.className = `status-section ${type}`;
        }
    }

    generateAccessionRange(start, end) {
        const prefix = start.match(/^[A-Za-z]+/)[0];
        const startNum = parseInt(start.match(/\d+/)[0]);
        const endNum = parseInt(end.match(/\d+/)[0]);
        
        const accessions = [];
        for (let i = startNum; i <= endNum; i++) {
            accessions.push(`${prefix}${i}`);
        }
        return accessions;
    }
    async fetchSequence(accessionId) {
        try {
            this.updateStatus(`Fetching ${accessionId}...`, 'loading');
            
            // Create a controller for timeout handling with longer timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 45000); // Increase timeout to 45 seconds
            
            try {
                // Remove API key and email from client-side request - these should be used server-side
                const response = await fetch(`/api/nucleotide/sequence?id=${accessionId}`, {
                    signal: controller.signal,
                    headers: {
                        'Cache-Control': 'no-cache',
                        'Pragma': 'no-cache'
                    }
                });
                
                // Clear the timeout
                clearTimeout(timeoutId);
                
                if (!response.ok) {
                    const errorText = await response.text();
                    let errorMessage;
                    try {
                        const errorData = JSON.parse(errorText);
                        errorMessage = errorData.error || `HTTP error! status: ${response.status}`;
                    } catch (e) {
                        errorMessage = `HTTP error! status: ${response.status}`;
                    }
                    throw new Error(errorMessage);
                }
                
                const data = await response.json();
                if (!data.success) {
                    throw new Error(data.error || 'Unknown error occurred');
                }
                
                if (!data.data || !data.data.sequence) {
                    throw new Error(`No sequence data returned for ${accessionId}`);
                }
                
                return data.data.sequence;
            } catch (error) {
                // Clear the timeout if there was an error
                clearTimeout(timeoutId);
                
                // Handle abort errors with a more user-friendly message
                if (error.name === 'AbortError') {
                    throw new Error(`Request timed out for ${accessionId}. NCBI servers may be busy.`);
                }
                
                throw error;
            }
        } catch (error) {
            console.error(`Error fetching ${accessionId}:`, error);
            
            // Implement retry logic for timeouts
            if (error.message.includes('timed out')) {
                try {
                    this.updateStatus(`Retrying ${accessionId}...`, 'loading');
                    // Try a different endpoint as fallback
                    const retryResponse = await fetch(`/api/nucleotide/sequence?id=${accessionId}&retry=true`, {
                        timeout: 45000
                    });
                    
                    if (!retryResponse.ok) {
                        throw new Error(`Retry failed for ${accessionId}`);
                    }
                    
                    const data = await retryResponse.json();
                    if (data.success && data.data && data.data.sequence) {
                        return data.data.sequence;
                    }
                    throw new Error(`No sequence data returned on retry for ${accessionId}`);
                } catch (retryError) {
                    console.error(`Retry failed for ${accessionId}:`, retryError);
                    throw error; // Throw the original error if retry fails
                }
            }
            
            throw error;
        }
    }

    generateCSV(sequences) {
        const header = 'Accession ID,Sequence\n';
        const rows = sequences.map(({ accessionId, sequence }) => 
            `${accessionId},"${sequence}"`
        ).join('\n');
        
        return header + rows;
    }

    downloadCSV(content, filename) {
        const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

// Initialize when DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    const downloader = new NucleotideDownloader();
});