class PrimerDesigner {
    constructor() {
        this.initializeElements();
        this.bindEventListeners();
    }

    initializeElements() {
        this.sequenceInput = document.getElementById('sequence');
        this.snpPositionInput = document.getElementById('snpPosition');
        this.ampliconLengthInput = document.getElementById('ampliconLength');
        this.primerLengthInput = document.getElementById('primerLength');
        this.designBtn = document.getElementById('designBtn');
        this.statusDiv = document.getElementById('status');
        this.resultsDiv = document.getElementById('results');
        this.copyBtn = document.getElementById('copyBtn');

        // Fallback if statusDiv is not found
        if (!this.statusDiv) {
            console.error('Status div not found in DOM');
            this.statusDiv = document.createElement('div');
            this.statusDiv.id = 'status';
            this.statusDiv.className = 'status-section';
            document.querySelector('.container').appendChild(this.statusDiv);
        }

        console.log('Initialized elements:', {
            sequenceInput: this.sequenceInput,
            snpPositionInput: this.snpPositionInput,
            ampliconLengthInput: this.ampliconLengthInput,
            primerLengthInput: this.primerLengthInput,
            designBtn: this.designBtn,
            statusDiv: this.statusDiv,
            resultsDiv: this.resultsDiv,
            copyBtn: this.copyBtn
        });
    }

    bindEventListeners() {
        this.designBtn.addEventListener('click', () => this.designPrimers());
        this.copyBtn.addEventListener('click', () => this.copyResults());
    }

    validateInputs() {
        const sequence = this.sequenceInput.value.toUpperCase().trim();
        const snpPosition = parseInt(this.snpPositionInput.value);
        const ampliconLength = parseInt(this.ampliconLengthInput.value);
        const primerLength = parseInt(this.primerLengthInput.value);
        const warnings = [];

        // Basic validations
        if (!sequence || !/^[ATGC]+$/.test(sequence)) {
            throw new Error('Invalid sequence. Use only A, T, G, C nucleotides.');
        }
        if (isNaN(snpPosition) || snpPosition < 0 || snpPosition >= sequence.length) {
            throw new Error(`SNP position must be between 0 and ${sequence.length - 1}.`);
        }
        if (isNaN(ampliconLength) || ampliconLength <= 0) {
            throw new Error('Amplicon length must be positive.');
        }
        if (isNaN(primerLength) || primerLength <= 0) {
            throw new Error('Primer length must be positive.');
        }
        if (primerLength * 2 > ampliconLength) {
            throw new Error('Primer length must not exceed half the amplicon length to avoid overlap.');
        }

        // Warning checks
        if (ampliconLength < 50) {
            warnings.push('Amplicon < 50 bp may reduce PCR efficiency');
        }
        if (primerLength < 15) {
            warnings.push('Primer < 15 bp may lack specificity');
        }

        console.log('Validating inputs, warnings:', warnings);

        return {
            sequence,
            snpPosition,
            ampliconLength,
            primerLength,
            warnings
        };
    }

    designPrimers() {
        try {
            // Validate inputs and get parameters with warnings
            const params = this.validateInputs();
            
            // Calculate primers and their properties, passing warnings
            const results = this.calculatePrimers(
                params.sequence,
                params.snpPosition,
                params.ampliconLength,
                params.primerLength,
                params.warnings // Pass warnings to calculatePrimers
            );
    
            console.log('Design results, warnings:', { paramsWarnings: params.warnings, resultsWarnings: results.warnings });
    
            // Display results and any warnings
            this.displayResults(results);
            
            // Show warnings if any (combine with results warnings)
            const allWarnings = [...params.warnings, ...results.warnings];
            if (allWarnings.length > 0) {
                this.updateStatus(allWarnings.join('\n'), 'warning');
            } else {
                this.updateStatus('Primers designed successfully!', 'info');
            }
    
        } catch (error) {
            this.updateStatus(error.message, 'error');
            console.error('Primer design error:', error);
        }
    }

    calculatePrimers(sequence, snpPosition, ampliconLength, primerLength, warnings = []) {
        // Calculate amplicon boundaries centered on SNP
        let start = Math.max(0, snpPosition - Math.floor(ampliconLength / 2));
        let end = Math.min(sequence.length, snpPosition + Math.ceil(ampliconLength / 2));
        
        // Dynamically adjust if amplicon exceeds sequence length, prioritizing SNP inclusion
        let adjustedAmpliconLength = end - start;
        if (adjustedAmpliconLength < ampliconLength) {
            if (start === 0) {
                end = Math.min(start + ampliconLength, sequence.length);
            } else if (end === sequence.length) {
                start = Math.max(end - ampliconLength, 0);
            }
            adjustedAmpliconLength = end - start;
            warnings.push('Amplicon adjusted to fit sequence boundaries');
        }
    
        // Ensure SNP is included in amplicon
        if (snpPosition < start || snpPosition >= end) {
            throw new Error('SNP position must be within the amplicon');
        }
    
        // Extract forward primer from the beginning of amplicon
        const forwardPrimer = sequence.slice(start, start + primerLength);
    
        // Extract reverse primer from the end of amplicon and apply reverse complement
        const reverseSeqStart = end - primerLength;
        const reverseSeq = sequence.slice(reverseSeqStart, end);
        const reversePrimer = this.getReverseComplement(reverseSeq);
    
        // Validate primer extraction
        if (start + primerLength > end - primerLength) {
            throw new Error('Primers overlap or exceed amplicon');
        }
    
        // Calculate properties
        const forwardStats = this.calculatePrimerStats(forwardPrimer);
        const reverseStats = this.calculatePrimerStats(reversePrimer);
    
        console.log('Calculate primers, warnings:', warnings);
    
        return {
            forwardPrimer,
            forwardTm: forwardStats.tm,
            forwardGc: forwardStats.gc,
            reversePrimer,
            reverseTm: reverseStats.tm,
            reverseGc: reverseStats.gc,
            warnings
        };
    }

    calculatePrimerStats(primer) {
        if (!primer || primer.length === 0) {
            throw new Error('Invalid primer sequence');
        }

        const counts = {
            G: (primer.match(/G/g) || []).length,
            C: (primer.match(/C/g) || []).length,
            A: (primer.match(/A/g) || []).length,
            T: (primer.match(/T/g) || []).length
        };

        // Calculate Tm using exact formula: 4(G+C) + 2(A+T)
        const tm = 4 * (counts.G + counts.C) + 2 * (counts.A + counts.T);

        // Calculate GC content with exact precision, ensuring no division by zero
        const gc = primer.length > 0 ? Number(((counts.G + counts.C) / primer.length * 100).toFixed(2)) : 0;

        return { tm, gc };
    }

    getReverseComplement(sequence) {
        const complementMap = {
            'A': 'T',
            'T': 'A',
            'G': 'C',
            'C': 'G'
        };
        
        return sequence
            .split('')
            .reverse()
            .map(base => complementMap[base] || base)
            .join('');
    }

    displayResults(results) {
        // Update the display with calculated values, ensuring proper formatting
        document.getElementById('forwardPrimer').textContent = results.forwardPrimer || 'N/A';
        document.getElementById('forwardTm').textContent = results.forwardTm !== undefined ? `${results.forwardTm}` : 'N/A';
        document.getElementById('forwardGc').textContent = results.forwardGc !== undefined ? `${results.forwardGc}` : 'N/A';
        document.getElementById('reversePrimer').textContent = results.reversePrimer || 'N/A';
        document.getElementById('reverseTm').textContent = results.reverseTm !== undefined ? `${results.reverseTm}` : 'N/A';
        document.getElementById('reverseGc').textContent = results.reverseGc !== undefined ? `${results.reverseGc}` : 'N/A';
        this.resultsDiv.style.display = 'block';

        // Display warnings if any
        if (results.warnings && results.warnings.length > 0) {
            this.updateStatus(results.warnings.join('\n'), 'warning');
        }
    }

    copyResults() {
        const results = {
            forwardPrimer: document.getElementById('forwardPrimer').textContent,
            reversePrimer: document.getElementById('reversePrimer').textContent,
            forwardTm: document.getElementById('forwardTm').textContent,
            reverseTm: document.getElementById('reverseTm').textContent,
            forwardGc: document.getElementById('forwardGc').textContent,
            reverseGc: document.getElementById('reverseGc').textContent
        };

        const text = `Forward Primer: ${results.forwardPrimer}
Tm: ${results.forwardTm}°C, GC: ${results.forwardGc}%

Reverse Primer: ${results.reversePrimer}
Tm: ${results.reverseTm}°C, GC: ${results.reverseGc}%`;

        navigator.clipboard.writeText(text)
            .then(() => this.updateStatus('Results copied to clipboard!', 'info'))
            .catch(error => {
                console.error('Clipboard error:', error);
                this.updateStatus('Failed to copy results: ' + (error.message || 'Unknown error'), 'error');
            });
    }

    updateStatus(message, type = 'info') {
        if (this.statusDiv) {
            this.statusDiv.textContent = message;
            this.statusDiv.className = `status-section ${type}`;
            this.statusDiv.style.display = 'block';
            setTimeout(() => {
                this.statusDiv.style.display = 'none';
            }, 3000);
        } else {
            console.error('Status div not found in DOM');
        }
    }
}

// Initialize the designer when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    try {
        const designer = new PrimerDesigner();
    } catch (error) {
        console.error('Failed to initialize Primer Designer:', error);
    }
});