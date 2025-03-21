class NucleotideDownloader {
    constructor() {
        this.form = document.getElementById('downloadForm');
        this.downloadBtn = document.getElementById('downloadBtn');
        this.statusDiv = document.getElementById('status');
        this.progressDiv = document.getElementById('progress');
        this.previewLength = document.getElementById('previewLength');
        this.downloadFormat = document.getElementsByName('downloadFormat');
        this.sequences = [];
        
        this.downloadBtn.addEventListener('click', () => this.handleDownload());
    }

    async handleDownload() {
        const startId = document.getElementById('startId').value.trim();
        const endId = document.getElementById('endId').value.trim() || startId;
        
        if (!startId) {
            this.updateStatus('Please enter at least one accession ID', 'error');
            return;
        }

        this.downloadBtn.disabled = true;
        this.sequences = [];
        this.updateStatus('Fetching sequences...', 'info');
        this.updateProgress(0);

        try {
            const accessionIds = this.generateAccessionIds(startId, endId);
            const total = accessionIds.length;
            
            for (let i = 0; i < total; i++) {
                const id = accessionIds[i];
                try {
                    const sequence = await this.fetchSequence(id);
                    if (sequence) {
                        this.sequences.push(sequence);
                        this.updatePreviewTable(sequence);
                    }
                } catch (error) {
                    console.error(`Error fetching sequence ${id}:`, error);
                    this.updateStatus(`Failed to fetch ${id}: ${error.message}`, 'error');
                }
                this.updateProgress(((i + 1) / total) * 100);
                if (i < total - 1) await this.delay(1000);
            }

            if (this.sequences.length > 0) {
                const selectedFormat = document.querySelector('input[name="downloadFormat"]:checked');
                if (!selectedFormat) {
                    throw new Error('No download format selected');
                }
                
                const format = selectedFormat.value;
                console.log('Selected format:', format); // Debug log
                
                switch (format) {
                    case 'pdf':
                        await this.downloadPDF();
                        break;
                    case 'separate':
                        await this.downloadSeparateFiles();
                        break;
                    default:
                        await this.downloadCSV();
                }
                
                this.updateStatus('Download complete!', 'success');
            } else {
                this.updateStatus('No sequences were successfully fetched.', 'error');
            }
        } catch (error) {
            console.error('Download error:', error);
            this.updateStatus(`Error: ${error.message}`, 'error');
        } finally {
            this.downloadBtn.disabled = false;
        }
    }

    async fetchSequence(id) {
        const response = await fetch(`/api/nucleotide/${id}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (!data.sequence) {
            throw new Error('No sequence data received');
        }
        return {
            accessionId: id,
            sequence: data.sequence,
            length: data.sequence.length
        };
    }

    downloadResults(format) {
        switch (format) {
            case 'csv':
                this.downloadCSV();
                break;
            case 'pdf':
                this.downloadPDF();
                break;
            case 'separate':
                this.downloadSeparateFiles();
                break;
        }
    }

    downloadCSV() {
        const csvContent = this.sequences.map(seq => 
            `${seq.accessionId},${seq.length},${seq.sequence}`
        ).join('\n');
        
        const header = 'Accession ID,Sequence Length,Sequence\n';
        const blob = new Blob([header + csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        this.triggerDownload(url, 'nucleotide_sequences.csv');
    }

    async downloadPDF() {
        try {
            if (typeof window.jsPDF !== 'function') {
                throw new Error('jsPDF library not loaded properly');
            }

            const doc = new window.jsPDF();

            // Add title and date
            doc.setFontSize(16);
            doc.text('Nucleotide Sequences Report', 14, 15);
            doc.setFontSize(10);
            doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 25);

            // Prepare table data
            const tableData = this.sequences.map(seq => [
                seq.accessionId,
                seq.length.toString(),
                seq.sequence.substring(0, 50) + (seq.sequence.length > 50 ? '...' : '')
            ]);

            // Add summary table
            doc.autoTable({
                head: [['Accession ID', 'Length', 'Sequence Preview']],
                body: tableData,
                startY: 30,
                margin: { top: 30 },
                theme: 'grid',
                columnStyles: {
                    0: { cellWidth: 30 },
                    1: { cellWidth: 30 },
                    2: { cellWidth: 'auto' }
                },
                styles: {
                    overflow: 'linebreak',
                    cellPadding: 2,
                    fontSize: 8,
                    textColor: [0, 0, 0]
                },
                headStyles: {
                    fillColor: [33, 150, 243],
                    textColor: [255, 255, 255],
                    fontSize: 9,
                    fontStyle: 'bold'
                }
            });

            // Add full sequences
            let y = doc.lastAutoTable.finalY + 10;
            doc.setFontSize(12);
            doc.text('Full Sequences:', 14, y);
            y += 10;

            this.sequences.forEach(seq => {
                if (y > 270) {
                    doc.addPage();
                    y = 20;
                }
                doc.setFontSize(10);
                doc.text(`${seq.accessionId}:`, 14, y);
                y += 5;

                const sequenceLines = seq.sequence.match(/.{1,80}/g) || [];
                sequenceLines.forEach(line => {
                    if (y > 270) {
                        doc.addPage();
                        y = 20;
                    }
                    doc.setFontSize(8);
                    doc.text(line, 14, y);
                    y += 4;
                });
                y += 6;
            });

            doc.save('nucleotide_sequences.pdf');
        } catch (error) {
            console.error('PDF generation error:', error);
            throw new Error('Failed to generate PDF. Please try another format.');
        }
    }

    async downloadSeparateFiles() {
        try {
            for (let i = 0; i < this.sequences.length; i++) {
                const seq = this.sequences[i];
                const content = `>${seq.accessionId}\n${seq.sequence}`;
                const blob = new Blob([content], { type: 'text/plain' });
                const url = window.URL.createObjectURL(blob);
                
                // Create and trigger download
                const a = document.createElement('a');
                a.href = url;
                a.download = `${seq.accessionId}.txt`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
                
                // Add delay between downloads
                if (i < this.sequences.length - 1) {
                    await this.delay(500);
                }
            }
        } catch (error) {
            console.error('Error creating separate files:', error);
            throw new Error('Failed to create separate files. Please try another format.');
        }
    }

    triggerDownload(url, filename) {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }

    generateAccessionIds(start, end) {
        if (start === end || !end) return [start];
        
        const prefix = start.match(/^[A-Za-z]+/)[0];
        const startNum = parseInt(start.match(/\d+/)[0]);
        const endNum = parseInt(end.match(/\d+/)[0]);
        
        const ids = [];
        for (let i = startNum; i <= endNum; i++) {
            ids.push(`${prefix}${i}`);
        }
        return ids;
    }

    updateStatus(message, type = 'info') {
        this.statusDiv.textContent = message;
        this.statusDiv.className = `status-section ${type}`;
    }

    updateProgress(percent) {
        this.progressDiv.style.width = `${percent}%`;
    }

    updatePreviewTable(sequence) {
        const table = document.querySelector('table tbody');
        const previewLength = parseInt(this.previewLength.value);
        
        const row = table.insertRow();
        row.insertCell().textContent = sequence.accessionId;
        row.insertCell().textContent = sequence.length;
        row.insertCell().textContent = sequence.sequence.substring(0, previewLength);
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Initialize the downloader when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new NucleotideDownloader();
});