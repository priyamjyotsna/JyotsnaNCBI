class VariantAnalyzer {
    constructor() {
        this.initializeElements();
        this.bindEventListeners();
    }

    initializeElements() {
        this.fileInput = document.getElementById('variantFile');
        this.fileName = document.getElementById('fileName');
        this.analyzeBtn = document.getElementById('analyzeBtn');
        this.batchSize = document.getElementById('batchSize');
        this.statusDiv = document.getElementById('status');
        this.resultsTable = document.getElementById('resultsTable').querySelector('tbody');
        this.checkboxes = document.querySelectorAll('.checkbox-group input[type="checkbox"]');
    }

    bindEventListeners() {
        if (this.fileInput) {
            this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        }
        if (this.analyzeBtn) {
            this.analyzeBtn.addEventListener('click', () => this.handleAnalysis());
        }
    }

    handleFileSelect(event) {
        const file = event.target.files[0];
        if (file) {
            this.fileName.textContent = file.name;
            this.analyzeBtn.disabled = false;
        } else {
            this.fileName.textContent = 'No file chosen';
            this.analyzeBtn.disabled = true;
        }
    }

    async handleAnalysis() {
        try {
            if (!this.fileInput.files[0]) {
                throw new Error('Please select a file first');
            }

            this.analyzeBtn.disabled = true;
            this.updateStatus('Processing file...', 'info');

            const formData = new FormData();
            formData.append('variantFile', this.fileInput.files[0]);
            formData.append('batchSize', this.batchSize.value);
            formData.append('options', JSON.stringify(Array.from(this.checkboxes)
                .filter(cb => cb.checked)
                .map(cb => cb.value)));

            const response = await fetch('/api/analyze-variants', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to process variants');
            }

            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || 'Failed to process variants');
            }

            this.displayResults(result.data);
            this.updateStatus('Analysis complete!', 'success');

        } catch (error) {
            console.error('Analysis error:', error);
            this.updateStatus(error.message, 'error');
        } finally {
            this.analyzeBtn.disabled = false;
        }
    }

    displayResults(variants) {
        this.resultsTable.innerHTML = '';
        
        variants.forEach(variant => {
            const row = this.resultsTable.insertRow();
            
            // Add cells in the same order as table headers
            const cells = [
                variant.id || 'N/A',
                variant.location || 'N/A',
                variant.type || 'N/A',
                variant.gene || 'N/A',
                variant.clinical_significance || 'N/A',
                variant.population_maf || 'N/A',
                variant.protein_impact || 'N/A',
                Array.isArray(variant.publications) ? variant.publications.join(', ') : 'N/A'
            ];

            cells.forEach(content => {
                const cell = row.insertCell();
                cell.textContent = content;
            });
        });
    }

    updateStatus(message, type = 'info') {
        if (this.statusDiv) {
            this.statusDiv.textContent = message;
            this.statusDiv.className = `status-section ${type}`;
            this.statusDiv.style.display = 'block';
        }
    }
}

// Initialize after DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    const analyzer = new VariantAnalyzer();
});