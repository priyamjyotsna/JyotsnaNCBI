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
            const response = await fetch(`/sequence-fetch/api/fetch?id=${accessionId}`);
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

function exportToCSV(data) {
    // Headers for CSV
    let csv = 'Accession ID,Organism,Sequence Length,Molecule Type,Update Date,Sequence\n';
    
    // Add each row of data
    data.forEach(item => {
        // Clean and format the sequence data
        const sequence = item.sequence.replace(/,/g, '').replace(/\s+/g, '');
        
        // Format the row with proper escaping
        const row = [
            item.accessionId,
            `"${item.organism.replace(/"/g, '""')}"`,  // Escape quotes in organism name
            item.length,
            item.moleculeType,
            item.updateDate,
            `"${sequence}"`  // Ensure sequence doesn't break CSV format
        ].join(',');
        
        csv += row + '\n';
    });

    // Create and trigger download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', 'sequence_data.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Add this function to handle data display
function updatePreviewTable(data) {
    const tbody = document.querySelector('#previewTable tbody');
    tbody.innerHTML = '';

    data.forEach(item => {
        // Clean the sequence before display
        const cleanSequence = cleanSequenceData(item.sequence || '');
        const previewLength = document.getElementById('previewLength').value;
        const sequencePreview = cleanSequence.substring(0, parseInt(previewLength)) + 
            (cleanSequence.length > parseInt(previewLength) ? '...' : '');

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.accessionId || ''}</td>
            <td class="sequence-cell">${sequencePreview}</td>
            <td>${item.organism || ''}</td>
            <td>${item.length || ''}</td>
            <td>${item.moltype || ''}</td>
            <td>${item.update_date || ''}</td>
        `;
        tbody.appendChild(row);
    });
}

function cleanSequenceData(sequence) {
    // Remove citation text and any non-sequence data
    sequence = sequence.replace(/Priyam,\s*J\..*?from\s*http:\/\/[^\s]+/g, '');  // Remove APA citation
    sequence = sequence.replace(/Priyam,\s*Jyotsna\..*?jyotsnapriyam\.com/g, ''); // Remove MLA citation
    sequence = sequence.replace(/@software{.*?}/gs, '');  // Remove BibTeX citation
    sequence = sequence.replace(/[^ATCG\-\n]/gi, '');  // Keep only valid sequence characters
    return sequence.trim();
}

// Update your data processing function
function processSequenceData(data) {
    return data.map(item => {
        if (item.sequence) {
            item.sequence = cleanSequenceData(item.sequence);
        }
        return item;
    });
}

// Update your fetch function
async function fetchSequences() {
    const startId = document.getElementById('startId').value;
    const endId = document.getElementById('endId').value;
    const previewLength = document.getElementById('previewLength').value;

    try {
        const response = await fetch(`/sequence-fetch/api/fetch?startId=${startId}&endId=${endId}&previewLength=${previewLength}`);
        if (!response.ok) throw new Error('Failed to fetch sequences');
        
        const data = await response.json();
        const cleanedData = processSequenceData(data);
        updatePreviewTable(cleanedData);
        
        // Enable export button if data exists
        if (cleanedData.length > 0) {
            document.getElementById('exportBtn').disabled = false;
        }
    } catch (error) {
        console.error('Error:', error);
        document.getElementById('status').textContent = 'Error processing sequences: ' + error.message;
    }
}

// Add event listener for the fetch button
document.getElementById('fetchBtn').addEventListener('click', fetchSequences);