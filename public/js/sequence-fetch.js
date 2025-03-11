class SequenceFetcher {
    constructor() {
        this.baseUrl = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
        this.email = 'your.email@example.com';
        this.delay = 500;
        
        this.initializeElements();
        this.bindEventListeners();
        this.loadConfig();
    }

    initializeElements() {
        this.startIdInput = document.getElementById('startId');
        this.endIdInput = document.getElementById('endId');
        this.fetchBtn = document.getElementById('fetchBtn');
        this.statusDiv = document.getElementById('status');
        this.previewTable = document.getElementById('previewTable').querySelector('tbody');
        this.previewLength = document.getElementById('previewLength');
        this.checkboxes = document.querySelectorAll('.checkbox-group input[type="checkbox"]');
    }

    bindEventListeners() {
        if (this.fetchBtn) {
            this.fetchBtn.addEventListener('click', () => this.handleFetch());
        }
        
        if (this.previewLength) {
            this.previewLength.addEventListener('change', () => {
                this.updatePreviewLengths();
            });
        }
    }

    updatePreviewLengths() {
        const previewLen = parseInt(this.previewLength.value);
        const rows = this.previewTable.getElementsByTagName('tr');
        
        for (const row of rows) {
            const sequenceCell = row.cells[1];
            const sequence = sequenceCell.getAttribute('data-sequence') || '';
            
            if (previewLen === -1) {
                sequenceCell.textContent = sequence;
            } else {
                sequenceCell.textContent = sequence.substring(0, previewLen) + '...';
            }
        }
    }

    updatePreviewRow(row, data, selectedFields) {
        row.insertCell(0).textContent = data.accessionId;
        
        const sequenceCell = row.insertCell(1);
        sequenceCell.setAttribute('data-sequence', data.sequence || '');
        const previewLen = parseInt(this.previewLength.value);
        
        if (previewLen === -1) {
            sequenceCell.textContent = data.sequence || 'N/A';
        } else {
            sequenceCell.textContent = (data.sequence?.substring(0, previewLen) + '...') || 'N/A';
        }
        
        if (selectedFields.includes('organism')) {
            row.insertCell(2).textContent = data.organism || 'N/A';
        }
        if (selectedFields.includes('length')) {
            row.insertCell(3).textContent = data.sequence?.length || 'N/A';
        }
        if (selectedFields.includes('moltype')) {
            row.insertCell(4).textContent = data.moltype || 'N/A';
        }
        if (selectedFields.includes('update_date')) {
            row.insertCell(5).textContent = data.update_date || 'N/A';
        }
    }

    generateCSV(sequences, selectedFields) {
        const headers = ['Accession ID', 'Sequence', ...selectedFields.map(f => f.charAt(0).toUpperCase() + f.slice(1))];
        const rows = sequences.map(seq => {
            const row = [seq.accessionId, seq.sequence || ''];
            selectedFields.forEach(field => row.push(seq[field] || ''));
            return row.map(cell => `"${cell}"`).join(',');
        });
        
        return [headers.join(','), ...rows].join('\n');
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

    async loadConfig() {
        try {
            const response = await fetch('/api/config');
            const config = await response.json();
            this.email = config.email;
        } catch (error) {
            console.error('Failed to load config:', error);
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

    async handleFetch() {
        try {
            this.fetchBtn.disabled = true;
            this.updateStatus('Generating accession IDs...', 'loading');
            
            const startId = this.startIdInput.value.trim();
            const endId = this.endIdInput.value.trim();
            const selectedFields = this.getSelectedFields();
            
            const accessions = this.generateAccessionRange(startId, endId);
            const sequences = [];
            
            this.updateStatus(`Fetching ${accessions.length} sequences...`, 'loading');
            this.previewTable.innerHTML = '';
            
            for (const accessionId of accessions) {
                try {
                    const data = await this.fetchSequenceData(accessionId);
                    sequences.push({ accessionId, ...data });
                    
                    const row = this.previewTable.insertRow();
                    this.updatePreviewRow(row, { accessionId, ...data }, selectedFields);
                    
                    await new Promise(resolve => setTimeout(resolve, this.delay));
                } catch (error) {
                    console.error(`Error with ${accessionId}:`, error);
                    sequences.push({ accessionId, error: error.message });
                }
            }
            
            const csvContent = this.generateCSV(sequences, selectedFields);
            this.downloadCSV(csvContent, `${startId}-${endId}_sequences.csv`);
            
            this.updateStatus('Download complete!', 'success');
        } catch (error) {
            console.error('Fetch error:', error);
            this.updateStatus(`Error: ${error.message}`, 'error');
        } finally {
            this.fetchBtn.disabled = false;
        }
    }

    async fetchSequenceData(accessionId) {
        try {
            const response = await fetch(`/api/sequence/fetch?id=${accessionId}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            if (!data.success) {
                throw new Error(data.error || 'Failed to fetch sequence data');
            }
            return {
                accessionId,
                sequence: data.data.sequence,
                organism: data.data.organism,
                length: data.data.length,
                moltype: data.data.moltype,
                update_date: data.data.update_date
            };
        } catch (error) {
            console.error(`Error fetching ${accessionId}:`, error);
            throw error;
        }
    }

    getSelectedFields() {
        return Array.from(this.checkboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.value);
    }

    updateStatus(message, type = 'info') {
        if (this.statusDiv) {
            this.statusDiv.textContent = message;
            this.statusDiv.className = `status-section ${type}`;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const fetcher = new SequenceFetcher();
});