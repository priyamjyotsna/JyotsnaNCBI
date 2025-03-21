class NucleotideDownloader {
    constructor() {
        this.baseUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
        this.email = ''; // Initialize as empty, will be loaded from config
        this.delay = 500;
        this.maxSequenceLimit = 25; // Default limit
        
        // Initialize elements first
        this.initializeElements();
        // Then bind event listeners
        this.bindEventListeners();
        // Load config before any operations
        this.loadConfig().then(() => {
            console.log('Configuration loaded, owner email:', this.email);
        }).catch(err => {
            console.error('Failed to load configuration:', err);
        });
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
        
        // Add validation for accession IDs
        if (this.startIdInput) {
            this.startIdInput.addEventListener('blur', () => this.validateAccessionId(this.startIdInput));
        }
        
        if (this.endIdInput) {
            this.endIdInput.addEventListener('blur', () => this.validateAccessionId(this.endIdInput));
        }
    }

    async loadConfig() {
        try {
            const response = await fetch('/api/config');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const config = await response.json();
            this.email = config.email || 'priyam.jyotsna@gmail.com'; // Use the email from config or fallback to hardcoded value
            this.maxSequenceLimit = config.maxSequenceLimit || 25;
            console.log('Config loaded:', config);
        } catch (error) {
            console.error('Failed to load config:', error);
            // Fallback to the email from .env directly
            this.email = 'priyam.jyotsna@gmail.com';
        }
    }
    
    // Validate Genbank accession ID format
    validateAccessionId(inputElement) {
        const value = inputElement.value.trim();
        const accessionPattern = /^[A-Z]{1,6}\d+(\.\d+)?$/;
        
        if (!value) {
            this.showInputError(inputElement, 'Accession ID is required');
            return false;
        }
        
        if (!accessionPattern.test(value)) {
            this.showInputError(inputElement, 'Invalid Genbank accession ID format');
            return false;
        }
        
        // Clear any error styling
        this.clearInputError(inputElement);
        return true;
    }
    
    showInputError(inputElement, message) {
        // Remove any existing error message
        this.clearInputError(inputElement);
        
        // Add error styling to input
        inputElement.classList.add('input-error');
        
        // Create and append error message
        const errorElement = document.createElement('div');
        errorElement.className = 'error-message';
        errorElement.textContent = message;
        inputElement.parentNode.appendChild(errorElement);
    }
    
    clearInputError(inputElement) {
        // Remove error styling
        inputElement.classList.remove('input-error');
        
        // Remove any existing error message
        const existingError = inputElement.parentNode.querySelector('.error-message');
        if (existingError) {
            existingError.remove();
        }
    }
    
    // Verify if an accession ID exists in NCBI
    async verifyAccessionExists(accessionId) {
        try {
            const response = await fetch(`/api/nucleotide/verify?id=${accessionId}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            return data.success && data.exists;
        } catch (error) {
            console.error(`Error verifying ${accessionId}:`, error);
            throw error;
        }
    }
    
    // Verify both accession IDs are valid and compatible
    async verifyAccessionRange() {
        // First validate individual formats
        const startValid = this.validateAccessionId(this.startIdInput);
        const endValid = this.validateAccessionId(this.endIdInput);
        
        if (!startValid || !endValid) {
            return false;
        }
        
        const startId = this.startIdInput.value.trim();
        const endId = this.endIdInput.value.trim();
        
        // Extract prefixes and numbers
        const startPrefix = startId.match(/^[A-Z]+/)[0];
        const endPrefix = endId.match(/^[A-Z]+/)[0];
        
        // Check if prefixes match
        if (startPrefix !== endPrefix) {
            this.showInputError(this.endIdInput, 'Start and end accessions must have the same prefix');
            return false;
        }
        
        const startNum = parseInt(startId.match(/\d+/)[0]);
        const endNum = parseInt(endId.match(/\d+/)[0]);
        
        // Check if range is valid (end >= start)
        if (endNum < startNum) {
            this.showInputError(this.endIdInput, 'End accession must be greater than or equal to start accession');
            return false;
        }
        
        // Make sure we have the email loaded
        if (!this.email) {
            try {
                await this.loadConfig();
            } catch (error) {
                console.error('Failed to load email for alert:', error);
                // Fallback to hardcoded email if config loading fails
                this.email = 'priyam.jyotsna@gmail.com';
            }
        }
        
        // Check if range is within allowed limit
        const sequenceCount = endNum - startNum + 1;
        if (sequenceCount > this.maxSequenceLimit) {
            alert(`You are trying to download ${sequenceCount} sequences, which exceeds the limit of ${this.maxSequenceLimit}. Please contact ${this.email} for bulk downloads.`);
            return false;
        }
        
        // Skip the separate verification step and proceed directly
        return true;
    }

    // Update the preview display in handleDownload
    async handleDownload() {
        try {
            this.downloadBtn.disabled = true;
            
            // Verify accession IDs before proceeding
            const isValid = await this.verifyAccessionRange();
            if (!isValid) {
                this.downloadBtn.disabled = false;
                return;
            }
            
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
            
            // Use Promise.all with a limited concurrency to avoid overwhelming the server
            const batchSize = 3; // Process 3 sequences at a time
            for (let i = 0; i < accessions.length; i += batchSize) {
                const batch = accessions.slice(i, i + batchSize);
                
                await Promise.all(batch.map(async (accessionId) => {
                    try {
                        const sequence = await this.fetchSequence(accessionId);
                        sequences.push({ accessionId, sequence });
                        successCount++;
                        
                        // Update preview
                        const row = this.previewTable.insertRow();
                        row.insertCell(0).textContent = accessionId;
                        
                        // Update preview with selected length
                        const previewLen = parseInt(this.previewLength.value);
                        row.insertCell(1).textContent = sequence.substring(0, previewLen) + '...';
                    } catch (error) {
                        console.error(`Error with ${accessionId}:`, error);
                        sequences.push({ accessionId, sequence: 'ERROR: ' + error.message });
                        errorCount++;
                        
                        // Add error row to preview
                        const row = this.previewTable.insertRow();
                        row.insertCell(0).textContent = accessionId;
                        const errorCell = row.insertCell(1);
                        errorCell.textContent = 'ERROR: ' + error.message;
                        errorCell.classList.add('error-text');
                    }
                }));
                
                // Add a small delay between batches to be nice to the NCBI API
                if (i + batchSize < accessions.length) {
                    await new Promise(resolve => setTimeout(resolve, 500));
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
    // Fetch a sequence from NCBI
    async fetchSequence(accessionId) {
        try {
            this.updateStatus(`Fetching ${accessionId}...`, 'loading');
            
            // Add timeout and retry logic
            const fetchWithRetry = async (url, retries = 3, delay = 2000) => {
                for (let i = 0; i < retries; i++) {
                    try {
                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout
                        
                        const response = await fetch(url, { 
                            signal: controller.signal,
                            headers: {
                                'Accept': 'application/json',
                                'User-Agent': 'Mozilla/5.0 (compatible; nucleotide-downloader/1.0)'
                            }
                        });
                        
                        clearTimeout(timeoutId);
                        
                        if (!response.ok) {
                            const errorData = await response.json().catch(() => ({ error: `HTTP error! status: ${response.status}` }));
                            throw new Error(errorData.error || `Failed to fetch ${accessionId}`);
                        }
                        
                        return response;
                    } catch (error) {
                        if (error.name === 'AbortError') {
                            throw new Error('Request timed out');
                        }
                        if (i === retries - 1) throw error;
                        console.log(`Retry ${i + 1} for ${accessionId} after ${delay}ms`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        delay *= 2; // Exponential backoff
                    }
                }
            };
            
            const response = await fetchWithRetry(`/api/nucleotide/sequence?id=${accessionId}`);
            const data = await response.json();
            
            if (!data.success || !data.data || !data.data.sequence) {
                throw new Error(`No sequence data returned for ${accessionId}`);
            }
            
            return data.data.sequence;
        } catch (error) {
            console.error(`Error fetching ${accessionId}:`, error);
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