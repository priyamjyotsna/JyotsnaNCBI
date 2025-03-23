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
        this.progressDiv = document.getElementById('progress');
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
            console.log(`Verifying accession ID: ${accessionId}`);
            const response = await fetch(`/api/nucleotide/verify?id=${accessionId}`);
            const data = await response.json();
            
            if (!response.ok) {
                console.error(`Verification failed for ${accessionId}:`, data.error);
                throw new Error(data.error || 'Failed to verify sequence');
            }
            
            console.log(`Verification result for ${accessionId}:`, data);
            return data.success && data.exists;
        } catch (error) {
            console.error(`Error verifying ${accessionId}:`, error);
            // Don't throw the error, just return false
            return false;
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
                        sequences.push({ 
                            accessionId, 
                            sequence: sequence,
                            length: sequence.length 
                        });
                        successCount++;
                        
                        // Update preview
                        const row = this.previewTable.insertRow();
                        row.insertCell(0).textContent = accessionId;
                        
                        // Update preview with selected length
                        const previewLen = parseInt(this.previewLength.value);
                        row.insertCell(1).textContent = sequence.sequence.substring(0, previewLen) + '...';
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
            
            // Handle different download formats
            if (sequences.length > 0) {
                const selectedFormat = document.querySelector('input[name="downloadFormat"]:checked');
                if (!selectedFormat) {
                    throw new Error('No download format selected');
                }

                // Sort sequences by accession ID to maintain order
                sequences.sort((a, b) => {
                    const aNum = parseInt(a.accessionId.match(/\d+/)[0]);
                    const bNum = parseInt(b.accessionId.match(/\d+/)[0]);
                    return aNum - bNum;
                });

                const format = selectedFormat.value;
                console.log('Selected format:', format);

                switch (format) {
                    case 'pdf':
                        await this.downloadPDF(sequences);
                        break;
                    case 'separate-fasta':
                        await this.downloadSeparateFiles(sequences, 'fasta');
                        break;
                    case 'separate-txt':
                        await this.downloadSeparateFiles(sequences, 'txt');
                        break;
                    case 'single-fasta':
                        await this.downloadSingleFasta(sequences);
                        break;
                    default:
                        await this.generateCSV(sequences);
                }
            }
            
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
            // Use a helper function with retry capability
            const fetchWithRetry = async (url, retries = 3, delay = 1000) => {
                let lastError;
                
                for (let attempt = 1; attempt <= retries; attempt++) {
                    try {
                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
                        
                        const response = await fetch(url, { signal: controller.signal });
                        clearTimeout(timeoutId);
                        
                        if (!response.ok) {
                            throw new Error(`Server responded with status: ${response.status}`);
                        }
                        
                        return await response.json();
                    } catch (error) {
                        lastError = error;
                        
                        // Don't log timeout errors with full stack traces
                        const isTimeout = error.name === 'AbortError' || error.message.includes('timeout');
                        if (isTimeout) {
                            console.log(`Timeout fetching ${accessionId} (attempt ${attempt}/${retries})`);
                        } else {
                            console.log(`Error fetching ${accessionId} (attempt ${attempt}/${retries}): ${error.message}`);
                        }
                        
                        if (attempt < retries) {
                            await new Promise(resolve => setTimeout(resolve, delay * attempt));
                        } else {
                            throw error;
                        }
                    }
                }
            };
            
            // Use the server-side endpoint to fetch sequences
            const data = await fetchWithRetry(`/api/nucleotide/sequence?id=${accessionId}`);
            
            if (!data.success || !data.data?.sequence) {
                throw new Error(data.error || 'No sequence data returned');
            }
            
            return {
                accessionId,
                sequence: data.data.sequence,
                header: data.data.header || `>${accessionId}`
            };
        } catch (error) {
            // Use a simplified error message for display
            const errorMessage = error.name === 'AbortError' ? 'Request timed out' : 'Failed to fetch sequence';
            console.log(`Error fetching ${accessionId}: ${errorMessage}`);
            throw new Error(errorMessage);
        }
    }

    async generateCSV(sequences) {
        try {
            const validSequences = sequences.filter(seq => !seq.sequence.startsWith('ERROR'));
            const header = 'Accession ID,Sequence Length,Sequence\n';
            const rows = validSequences
                .map(seq => `${seq.accessionId},${seq.length},"${seq.sequence}"`)
                .join('\n');
            
            const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'nucleotide_sequences.csv';
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error creating CSV:', error);
            this.updateStatus('Error creating CSV file.', 'error');
        }
    }

    async downloadPDF(sequences) {
        try {
            if (typeof window.jsPDF !== 'function') {
                throw new Error('jsPDF library not loaded properly');
            }

            const validSequences = sequences.filter(seq => !seq.sequence.startsWith('ERROR'));
            const doc = new window.jsPDF();

            // Add title and date
            doc.setFontSize(16);
            doc.text('Nucleotide Sequences Report', 14, 15);
            doc.setFontSize(10);
            doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 25);

            // Prepare table data
            const tableData = validSequences.map(seq => [
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
                    fontSize: 8
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

            validSequences.forEach(seq => {
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
            this.updateStatus('Error generating PDF. Please try another format.', 'error');
        }
    }

    // Format sequence in FASTA format with 80 characters per line
    formatFastaSequence(accessionId, sequence) {
        const header = `>${accessionId}`;
        const formattedSeq = sequence.match(/.{1,80}/g).join('\n');
        return `${header}\n${formattedSeq}`;
    }

    async downloadSingleFasta(sequences) {
        try {
            const validSequences = sequences.filter(seq => !seq.sequence.startsWith('ERROR'));
            const content = validSequences
                .map(seq => this.formatFastaSequence(seq.accessionId, seq.sequence))
                .join('\n\n');

            const blob = new Blob([content], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'nucleotide_sequences.fasta';
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error creating FASTA file:', error);
            this.updateStatus('Error creating FASTA file. Please try another format.', 'error');
        }
    }

    async downloadSeparateFiles(sequences, format = 'fasta') {
        try {
            const validSequences = sequences.filter(seq => !seq.sequence.startsWith('ERROR'));
            for (let i = 0; i < validSequences.length; i++) {
                const seq = validSequences[i];
                let content;
                let extension;

                if (format === 'fasta') {
                    content = this.formatFastaSequence(seq.accessionId, seq.sequence);
                    extension = 'fasta';
                } else {
                    content = seq.sequence;
                    extension = 'txt';
                }

                const blob = new Blob([content], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                
        const link = document.createElement('a');
                link.href = url;
                link.download = `${seq.accessionId}.${extension}`;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
                URL.revokeObjectURL(url);
                
                // Add delay between downloads
                if (i < validSequences.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }
        } catch (error) {
            console.error('Error creating separate files:', error);
            this.updateStatus(`Error creating ${format.toUpperCase()} files. Please try another format.`, 'error');
        }
    }

    updateProgress(percent) {
        if (this.progressDiv) {
            this.progressDiv.setAttribute('data-progress', Math.round(percent));
            this.progressDiv.style.setProperty('--progress', `${percent}%`);
            this.progressDiv.style.setProperty('--width', `${percent}%`);
        }
    }
}

// Initialize when DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    const downloader = new NucleotideDownloader();
});