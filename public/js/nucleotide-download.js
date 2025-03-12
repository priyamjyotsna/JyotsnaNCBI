class NucleotideDownloader {
    constructor() {
        this.downloadBtn = document.getElementById('downloadBtn');
        this.statusDiv = document.getElementById('status');
        this.progressDiv = document.getElementById('progress');
        this.hasCredentials = false;
        this.init();
    }

    async init() {
        await this.checkCredentials();
        this.attachEventListeners();
    }

    async checkCredentials() {
        try {
            const response = await fetch('/api/user/ncbi-credentials', {
                credentials: 'include'
            });
            const data = await response.json();
            
            this.hasCredentials = data.success && data.credentials;
            
            if (!this.hasCredentials) {
                this.updateStatus('Please add your NCBI credentials in your profile settings to download sequences. <a href="/profile">Go to Profile</a>', 'warning');
                if (this.downloadBtn) {
                    this.downloadBtn.disabled = true;
                }
                return false;
            }
            return true;
        } catch (error) {
            console.error('Error checking credentials:', error);
            this.updateStatus('Failed to verify NCBI credentials. Please try again.', 'error');
            return false;
        }
    }

    async fetchSequence(accessionId) {
        if (!this.hasCredentials) {
            await this.checkCredentials();
            if (!this.hasCredentials) {
                throw new Error('NCBI credentials required');
            }
        }

        const response = await fetch(`/api/nucleotide/sequence?id=${accessionId}`, {
            credentials: 'include',
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to fetch sequence ${accessionId}`);
        }

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || `Failed to fetch sequence ${accessionId}`);
        }

        return data.data;
    }

    updateStatus(message, type = 'info') {
        if (this.statusDiv) {
            this.statusDiv.innerHTML = message;
            this.statusDiv.className = `status ${type}`;
        }
    }

    updateProgress(current, total) {
        if (this.progressDiv) {
            const percentage = Math.round((current / total) * 100);
            this.progressDiv.textContent = `Progress: ${current}/${total} (${percentage}%)`;
            this.progressDiv.style.width = `${percentage}%`;
        }
    }

    async handleDownload(e) {
        e.preventDefault();
        
        // Clear previous results
        this.resultDiv.innerHTML = '';
        
        // Get sequence IDs
        const ids = this.sequenceInput.value
            .split(/[\s,]+/)
            .map(id => id.trim())
            .filter(id => id);
            
        if (ids.length === 0) {
            this.updateStatus('Please enter at least one sequence ID.', 'danger');
            return;
        }
        
        this.downloadButton.disabled = true;
        this.updateStatus('Downloading sequences...', 'info');
        
        try {
            // Download sequences in parallel with rate limiting
            const results = await Promise.allSettled(
                ids.map(id => this.fetchSequence(id))
            );
            
            // Process results
            let successCount = 0;
            const sequences = [];
            
            results.forEach((result, index) => {
                const id = ids[index];
                if (result.status === 'fulfilled') {
                    successCount++;
                    sequences.push(result.value);
                } else {
                    console.error(`Error with ${id}:`, result.reason);
                    this.appendError(id, result.reason.message);
                }
                this.updateProgress(index + 1, ids.length);
            });
            
            // Display final status
            if (successCount > 0) {
                this.displayResults(sequences);
                this.updateStatus(
                    `Downloaded ${successCount} of ${ids.length} sequences successfully.`,
                    successCount < ids.length ? 'warning' : 'success'
                );
            } else {
                this.updateStatus('Failed to download any sequences.', 'danger');
            }
        } catch (error) {
            console.error('Download error:', error);
            this.updateStatus('Error downloading sequences: ' + error.message, 'danger');
        } finally {
            this.downloadButton.disabled = false;
        }
    }

    async loadConfig() {
        try {
            const response = await fetch('/api/config');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const config = await response.json();
            this.email = config.email;
            this.apiKey = config.apiKey;
        } catch (error) {
            console.error('Failed to load config:', error);
            this.updateStatus('Failed to load configuration. Please try again.', 'error');
        }
    }

    displayResults(sequences) {
        // Create a container for the download button
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'mb-3';
        
        // Add download button
        const downloadBtn = document.createElement('button');
        downloadBtn.textContent = 'Download FASTA';
        downloadBtn.className = 'btn btn-success';
        downloadBtn.onclick = () => this.downloadFasta(sequences);
        buttonContainer.appendChild(downloadBtn);
        
        // Create sequence display
        const pre = document.createElement('pre');
        pre.className = 'sequence-result';
        pre.textContent = sequences.join('\n\n');
        
        // Add to result div
        this.resultDiv.appendChild(buttonContainer);
        this.resultDiv.appendChild(pre);
    }

    appendError(id, error) {
        const div = document.createElement('div');
        div.className = 'alert alert-danger';
        div.textContent = `Error downloading ${id}: ${error}`;
        this.resultDiv.appendChild(div);
    }

    downloadFasta(sequences) {
        const blob = new Blob([sequences.join('\n\n')], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'sequences.fasta';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    }
}

// Initialize the downloader when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new NucleotideDownloader();
});