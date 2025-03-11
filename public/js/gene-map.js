class GeneMapVisualizer {
    constructor() {
        this.initializeElements();
        this.bindEventListeners();
        // Update the colorSchemes object in the constructor
        this.colorSchemes = {
            type: {
                'SNV': '#4299E1',
                'deletion': '#F56565',
                'insertion': '#48BB78',
                'substitution': '#805AD5',
                'indel': '#ED8936',
                'default': '#A0AEC0'
            },
            significance: {
                'pathogenic': '#DC2626',
                'likely_pathogenic': '#EA580C',
                'uncertain_significance': '#EAB308',
                'likely_benign': '#16A34A',
                'benign': '#059669',
                'default': '#A0AEC0'
            },
            impact: {
                'high': '#DC2626',
                'moderate': '#EA580C',
                'low': '#16A34A',
                'modifier': '#059669',
                'default': '#A0AEC0'
            }
        };
        this.currentZoom = 1;
    }

    initializeElements() {
        this.fileInput = document.getElementById('variantFile');
        this.fileName = document.getElementById('fileName');
        this.visualizeBtn = document.getElementById('visualizeBtn');
        this.viewMode = document.getElementById('viewMode');
        this.colorBy = document.getElementById('colorBy');
        this.markerSize = document.getElementById('markerSize');
        this.statusDiv = document.getElementById('status');
        this.geneMap = document.getElementById('geneMap');
        
        // Verify all elements exist
        if (!this.fileInput || !this.geneMap) {
            console.error('Required elements not found');
            return;
        }
    }

    // Add to the bindEventListeners method
    // In bindEventListeners method, add these event listeners
    bindEventListeners() {
        if (this.fileInput) {
            this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        }
        if (this.visualizeBtn) {
            this.visualizeBtn.addEventListener('click', () => this.generateVisualization());
        }
        if (this.viewMode) {
            this.viewMode.addEventListener('change', () => this.updatePlot());
        }
        if (this.colorBy) {
            this.colorBy.addEventListener('change', () => this.updatePlot());
        }
        if (this.markerSize) {
            this.markerSize.addEventListener('input', () => this.updatePlot());
        }
        
        const zoomIn = document.getElementById('zoomIn');
        const zoomOut = document.getElementById('zoomOut');
        const resetZoom = document.getElementById('resetZoom');

        if (zoomIn) zoomIn.addEventListener('click', () => this.handleZoom('in'));
        if (zoomOut) zoomOut.addEventListener('click', () => this.handleZoom('out'));
        if (resetZoom) resetZoom.addEventListener('click', () => this.resetZoom());
    
        // Add download button listeners
        const downloadPNG = document.getElementById('downloadPNG');
        const downloadSVG = document.getElementById('downloadSVG');
    
        if (downloadPNG) {
            downloadPNG.addEventListener('click', () => this.downloadPlot('png'));
        }
        if (downloadSVG) {
            downloadSVG.addEventListener('click', () => this.downloadPlot('svg'));
        }
    }

    // Remove the duplicate generateVisualization method and keep this one
    async generateVisualization() {
        try {
            if (!this.fileInput.files[0]) {
                throw new Error('Please select a file first');
            }

            this.updateStatus('Processing file...', 'info');
            const variants = await this.parseVariantData(this.fileInput.files[0]);
            
            if (!variants || variants.length === 0) {
                throw new Error('No valid variant data found in file');
            }

            this.variants = variants; // Store variants for updates
            this.createPlot();
            this.updateStatus('Visualization complete!', 'success');
        } catch (error) {
            console.error('Visualization error:', error);
            this.updateStatus(error.message, 'error');
        }
    }

    // Add parseVariantData method
    async parseVariantData(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const content = e.target.result;
                    const fileExt = file.name.split('.').pop().toLowerCase();
                    const lines = content.split('\n');
                    
                    // Validate header with header mappings
                    const separator = fileExt === 'tsv' ? '\t' : ',';
                    const header = lines[0].split(separator).map(col => col.toLowerCase().trim());
                    
                    // Define header mappings for different possible names
                    const headerMappings = {
                        'id': ['id', 'variant id', 'variant_id'],
                        'location': ['location', 'position', 'chromosomal location'],
                        'type': ['type', 'variant type', 'variant_type'],
                        'gene': ['gene', 'gene name', 'gene_name'],
                        'impact': ['impact', 'molecular consequences', 'consequence', 'molecular_consequences'],
                        'significance': ['significance', 'clinical significance', 'most severe clinical significance', 'clinical_significance']
                    };

                    // Find column indices using mappings
                    const columnIndices = {};
                    for (const [key, alternatives] of Object.entries(headerMappings)) {
                        const index = header.findIndex(h => alternatives.includes(h));
                        if (index === -1) {
                            reject(new Error(
                                `Missing required column: ${key}\n` +
                                `Acceptable names: ${alternatives.join(', ')}\n` +
                                `Found columns: ${header.join(', ')}`
                            ));
                            return;
                        }
                        columnIndices[key] = index;
                    }

                    // Parse data rows
                    const variants = lines.slice(1)
                        .filter(line => line.trim())
                        .map((line, lineIndex) => {
                            const values = line.split(separator);
                            if (values.length < Object.keys(columnIndices).length) {
                                throw new Error(`Invalid row format at line ${lineIndex + 2}: Insufficient columns`);
                            }
                            
                            const locationNum = parseFloat(values[columnIndices.location]);
                            if (isNaN(locationNum)) {
                                throw new Error(`Invalid location value at line ${lineIndex + 2}: "${values[columnIndices.location]}" is not a number`);
                            }

                            return {
                                id: values[columnIndices.id].trim(),
                                location: locationNum,
                                type: this.validateType(values[columnIndices.type].trim()),
                                gene: values[columnIndices.gene].trim() || 'unknown',
                                impact: this.validateImpact(values[columnIndices.impact].trim()),
                                clinical_significance: this.validateSignificance(values[columnIndices.significance].trim())
                            };
                        });

                    resolve(variants);
                } catch (error) {
                    reject(new Error(`Failed to parse file: ${error.message}`));
                }
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    // Add validation helper methods
    validateType(type) {
        const validTypes = ['snv', 'deletion', 'insertion', 'substitution', 'indel'];
        const normalizedType = type.toLowerCase();
        return validTypes.includes(normalizedType) ? normalizedType : 'unknown';
    }

    validateImpact(impact) {
        const validImpacts = ['high', 'moderate', 'low', 'modifier'];
        const normalizedImpact = impact.toLowerCase();
        return validImpacts.includes(normalizedImpact) ? normalizedImpact : 'unknown';
    }

    validateSignificance(significance) {
        const validSignificances = ['pathogenic', 'likely_pathogenic', 'uncertain_significance', 'likely_benign', 'benign'];
        const normalizedSig = significance.toLowerCase().replace(/[\s-]/g, '_');
        return validSignificances.includes(normalizedSig) ? normalizedSig : 'unknown';
    }

    // Add createPlot method
    createPlot() {
        if (!this.variants) return;
        
        const viewMode = this.viewMode.value;
        const colorBy = this.colorBy.value;
        const markerSize = parseInt(this.markerSize.value);
    
        // Create separate traces for each variant type/category for legend
        const categories = new Set(this.variants.map(v => {
            switch(colorBy) {
                case 'type': return v.type;
                case 'significance': return v.clinical_significance;
                case 'impact': return v.impact;
            }
        }));
    
        const data = Array.from(categories).map(category => {
            const filteredVariants = this.variants.filter(v => {
                switch(colorBy) {
                    case 'type': return v.type === category;
                    case 'significance': return v.clinical_significance === category;
                    case 'impact': return v.impact === category;
                }
            });
    
            const trace = {
                name: category || 'Unknown',
                x: filteredVariants.map(v => v.location),
                mode: 'markers',
                type: viewMode === 'circular' ? 'scatterpolar' : 'scatter',
                marker: {
                    size: markerSize,
                    color: this.getMarkerColor({ type: category, clinical_significance: category, impact: category }, colorBy)
                },
                hoverinfo: 'text',
                text: filteredVariants.map(v => `${v.id}<br>Location: ${v.location}<br>Type: ${v.type}<br>Impact: ${v.impact}`)
            };
    
            if (viewMode === 'circular') {
                const theta = filteredVariants.map((_, i) => 
                    (i * 360 / this.variants.length)
                );
                trace.r = filteredVariants.map(v => v.location);
                trace.theta = theta;
            } else {
                trace.y = Array(filteredVariants.length).fill(1);
            }
    
            return trace;
        });
    
        const layout = {
            title: 'Gene Variant Map',
            showlegend: true,
            legend: {
                title: {
                    text: `Color by ${colorBy.charAt(0).toUpperCase() + colorBy.slice(1)}`,
                    font: { size: 14 }
                },
                x: 1.1,
                y: 1,
                bgcolor: '#ffffff',
                bordercolor: '#e2e8f0',
                borderwidth: 1
            },
            hovermode: 'closest',
            margin: { t: 50, l: 50, r: 150, b: 50 }
        };
    
        if (viewMode === 'circular') {
            layout.polar = {
                radialaxis: {
                    visible: true,
                    title: 'Location'
                },
                angularaxis: {
                    visible: true,
                    direction: 'clockwise'
                }
            };
        } else {
            layout.xaxis = {
                title: 'Chromosomal Location',
                showgrid: true
            };
            layout.yaxis = {
                showticklabels: false,
                showgrid: false,
                zeroline: false
            };
        }
    
        Plotly.newPlot(this.geneMap, data, layout, {
            responsive: true,
            displayModeBar: true,
            modeBarButtonsToRemove: ['lasso2d', 'select2d']
        });
    }

    // Add updatePlot method
    updatePlot() {
        if (!this.variants) return;
        this.createPlot();
    }

    handleFileSelect(event) {
        const file = event.target.files[0];
        if (file) {
            this.fileName.textContent = file.name;
            this.visualizeBtn.disabled = false;
        } else {
            this.fileName.textContent = 'No file chosen';
            this.visualizeBtn.disabled = true;
        }
    }

    handleZoom(direction) {
        const factor = direction === 'in' ? 1.2 : 0.8;
        this.currentZoom *= factor;
        
        const update = {
            'xaxis.range': [
                this.plotData.xMin * this.currentZoom,
                this.plotData.xMax * this.currentZoom
            ]
        };
        
        Plotly.relayout(this.geneMap, update);
    }

    resetZoom() {
        this.currentZoom = 1;
        Plotly.relayout(this.geneMap, {
            'xaxis.range': [this.plotData.xMin, this.plotData.xMax]
        });
    }

    // Update the getMarkerColor method
    getMarkerColor(variant, colorBy) {
        const scheme = this.colorSchemes[colorBy];
        if (!scheme) return this.colorSchemes.type.default;
    
        let key = 'default';
        switch(colorBy) {
            case 'type':
                key = (variant.type || '').toLowerCase().trim();
                break;
            case 'significance':
                key = (variant.clinical_significance || '').toLowerCase().replace(/[\s-]/g, '_');
                break;
            case 'impact':
                key = (variant.impact || '').toLowerCase();
                break;
        }
    
        return scheme[key] || scheme.default;
    }

    // Add this method
    async generateVisualization() {
        try {
            if (!this.fileInput.files[0]) {
                throw new Error('Please select a file first');
            }

            this.updateStatus('Processing file...', 'info');
            const variants = await this.parseVariantData(this.fileInput.files[0]);
            
            if (!variants || variants.length === 0) {
                throw new Error('No valid variant data found in file');
            }

            this.variants = variants; // Store variants for updates
            
            const viewMode = this.viewMode.value;
            const colorBy = this.colorBy.value;

            const data = [{
                x: variants.map(v => v.location),
                y: viewMode === 'linear' ? Array(variants.length).fill(1) : 
                   variants.map((_, i) => Math.sin(2 * Math.PI * i / variants.length)),
                text: variants.map(v => `${v.id}<br>Location: ${v.location}<br>Type: ${v.type}<br>Impact: ${v.impact}`),
                mode: 'markers+text',
                type: 'scatter',
                marker: {
                    size: parseInt(this.markerSize.value),
                    color: variants.map(v => this.getMarkerColor(v, colorBy))
                },
                hoverinfo: 'text',
                textposition: 'top center'
            }];

            // Add a legend to createPlot method's layout
            const layout = {
                title: 'Gene Variant Map',
                showlegend: false,
                xaxis: {
                    title: 'Chromosomal Location',
                    showgrid: true
                },
                yaxis: {
                    showticklabels: false,
                    showgrid: false,
                    zeroline: false
                },
                hovermode: 'closest',
                margin: { t: 50, l: 50, r: 50, b: 50 }
            };

            if (viewMode === 'circular') {
                layout.polar = {
                    radialaxis: { visible: false },
                    angularaxis: { visible: false }
                };
            }

            this.plotData = {
                xMin: Math.min(...variants.map(v => v.location)),
                xMax: Math.max(...variants.map(v => v.location))
            };

            Plotly.newPlot(this.geneMap, data, layout, {
                responsive: true,
                displayModeBar: true,
                modeBarButtonsToRemove: ['lasso2d', 'select2d']
            });
            
            this.updateStatus('Visualization complete!', 'success');
        } catch (error) {
            console.error('Visualization error:', error);
            this.updateStatus(error.message, 'error');
        }
    }

    // Add updateStatus method if missing
    updateStatus(message, type = 'info') {
        if (this.statusDiv) {
            this.statusDiv.textContent = message;
            this.statusDiv.className = `status-section ${type}`;
            this.statusDiv.style.display = 'block';
        }
    }

    // Add this new method for handling downloads
    downloadPlot(format) {
        if (!this.geneMap || !this.variants) {
            this.updateStatus('No visualization to download', 'error');
            return;
        }
    
        this.updateStatus('Preparing download...', 'info');
    
        const config = {
            format: format,
            width: 1200,
            height: 800,
            scale: 2,
            filename: `gene-map-${new Date().toISOString().split('T')[0]}`,
            imageDataOnly: false
        };
    
        try {
            Plotly.downloadImage(this.geneMap, config)
                .then(() => {
                    this.updateStatus(`${format.toUpperCase()} download complete!`, 'success');
                })
                .catch((error) => {
                    console.error('Download error:', error);
                    this.updateStatus('Failed to download visualization', 'error');
                });
        } catch (error) {
            console.error('Download error:', error);
            this.updateStatus('Failed to download visualization', 'error');
        }
    }
}

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
    try {
        const visualizer = new GeneMapVisualizer();
    } catch (error) {
        console.error('Failed to initialize Gene Map Visualizer:', error);
    }
});