class NucleotideDownloader {
    constructor() {
        this.initializeElements();
        this.bindEventListeners();
    }

    initializeElements() {
        this.startIdInput = document.getElementById('startId');
        this.endIdInput = document.getElementById('endId');
        this.previewLength = document.getElementById('previewLength');
        this.downloadBtn = document.getElementById('downloadBtn');
        this.statusDiv = document.getElementById('status');
        this.progressDiv = document.getElementById('progress');
        this.previewTable = document.getElementById('previewTable').querySelector('tbody');
        this.downloadForm = document.getElementById('download-form');
    }

    bindEventListeners() {
        this.downloadForm.addEventListener('submit', (e) => this.handleDownload(e));
        
        this.previewLength.addEventListener('change', () => {
            const th = document.querySelector('#previewTable thead th:last-child');
            if (th) {
                th.textContent = `Sequence (first ${this.previewLength.value} bp)`;
            }
        });
    }

    generateAccessionRange(startId, endId) {
        const prefix = startId.match(/^[A-Za-z]+/)[0];
        const startNum = parseInt(startId.match(/\d+/)[0]);
        const endNum = parseInt(endId.match(/\d+/)[0]);
        
        const accessions = [];
        for (let i = startNum; i <= endNum; i++) {
            accessions.push(`${prefix}${i}`);
        }
        return accessions;
    }

    async fetchSequence(accessionId) {
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
            this.statusDiv.className = `alert alert-${type} mt-3`;
        }
    }

    updateProgress(current, total) {
        if (this.progressDiv) {
            const percentage = Math.round((current / total) * 100);
            this.progressDiv.style.width = `${percentage}%`;
            this.progressDiv.textContent = `Progress: ${current}/${total} (${percentage}%)`;
        }
    }

    async handleDownload(e) {
        e.preventDefault();
        
        const startId = this.startIdInput.value.trim();
        const endId = this.endIdInput.value.trim();
        
        if (!startId || !endId) {
            this.updateStatus('Please enter both start and end accession IDs.', 'danger');
            return;
        }

        this.downloadBtn.disabled = true;
        this.previewTable.innerHTML = '';
        this.updateStatus('Generating accession IDs...', 'info');
        
        try {
            const accessions = this.generateAccessionRange(startId, endId);
            const sequences = [];
            let successCount = 0;
            
            this.updateStatus(`Fetching ${accessions.length} sequences...`, 'info');
            
            const batchSize = 2;
            for (let i = 0; i < accessions.length; i += batchSize) {
                const batch = accessions.slice(i, i + batchSize);
                
                const results = await Promise.allSettled(
                    batch.map(id => this.fetchSequence(id))
                );
                
                results.forEach((result, index) => {
                    const accessionId = batch[index];
                    const row = this.previewTable.insertRow();
                    
                    if (result.status === 'fulfilled') {
                        const sequence = result.value;
                        sequences.push({ accessionId, sequence });
                        successCount++;
                        
                        const previewLen = parseInt(this.previewLength.value);
                        row.insertCell(0).textContent = accessionId;
                        row.insertCell(1).textContent = sequence.substring(0, previewLen) + '...';
                    } else {
                        row.insertCell(0).textContent = accessionId;
                        const errorCell = row.insertCell(1);
                        errorCell.textContent = 'ERROR: ' + result.reason.message;
                        errorCell.className = 'error-text';
                    }
                    
                    this.updateProgress(i + index + 1, accessions.length);
                });
                
                if (i + batchSize < accessions.length) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
            
            if (successCount > 0) {
                this.downloadFasta(sequences);
                this.updateStatus(
                    `Downloaded ${successCount} of ${accessions.length} sequences successfully.`,
                    successCount < accessions.length ? 'warning' : 'success'
                );
            } else {
                this.updateStatus('Failed to download any sequences.', 'danger');
            }
            
        } catch (error) {
            console.error('Download error:', error);
            this.updateStatus('Error downloading sequences: ' + error.message, 'danger');
        } finally {
            this.downloadBtn.disabled = false;
        }
    }

    downloadFasta(sequences) {
        const fastaContent = sequences
            .map(({accessionId, sequence}) => `>${accessionId}\n${sequence}`)
            .join('\n\n');
        
        const blob = new Blob([fastaContent], { type: 'text/plain' });
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

document.addEventListener('DOMContentLoaded', () => {
    new NucleotideDownloader();
});