document.addEventListener('DOMContentLoaded', function() {
    const accessionInput = document.getElementById('accessionInput');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const loadingSpinner = document.getElementById('loadingSpinner');
    const resultsSection = document.getElementById('resultsSection');
    const dragDropZone = document.getElementById('dragDropZone');
    const sequenceFile = document.getElementById('sequenceFile');
    const chartSection = document.getElementById('chartSection');
    let nucleotideChart = null;

    // Handle drag and drop events
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dragDropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dragDropZone.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dragDropZone.addEventListener(eventName, unhighlight, false);
    });

    function highlight(e) {
        dragDropZone.classList.add('dragover');
    }

    function unhighlight(e) {
        dragDropZone.classList.remove('dragover');
    }

    dragDropZone.addEventListener('drop', handleDrop, false);
    dragDropZone.addEventListener('click', () => sequenceFile.click());

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const file = dt.files[0];
        handleFile(file);
    }

    sequenceFile.addEventListener('change', (e) => {
        handleFile(e.target.files[0]);
    });

    function handleFile(file) {
        if (!file) return;
        
        // Validate file size
        if (file.size > 50 * 1024 * 1024) { // 50MB limit
            alert('File too large. Maximum size is 50MB.');
            return;
        }

        // Validate file type
        const validTypes = ['text/plain', 'application/octet-stream', ''];
        if (!validTypes.includes(file.type)) {
            alert('Invalid file type. Please upload a text file.');
            return;
        }

        const sequenceType = document.getElementById('uploadSequenceType').value;
        const formData = new FormData();
        formData.append('sequenceFile', file);
        formData.append('sequenceType', sequenceType);

        loadingSpinner.style.display = 'block';
        resultsSection.style.display = 'none';

        fetch('/dna-analysis/api/analyze-uploaded-sequence', {
            method: 'POST',
            body: formData
        })
        .then(response => {
            if (!response.ok) {
                return response.json().then(data => {
                    throw new Error(data.error || 'Upload failed');
                });
            }
            return response.json();
        })
        .then(data => {
            const sequence = data.sequence.toUpperCase();
            const counts = countNucleotides(sequence, sequenceType === 'RNA');
            displayReports('Uploaded File', counts, sequenceType);
            loadingSpinner.style.display = 'none';
            resultsSection.style.display = 'block';
        })
        .catch(error => {
            alert('Error uploading file: ' + error.message);
            loadingSpinner.style.display = 'none';
        });
    }

    analyzeBtn.addEventListener('click', analyzeSequence);

    async function analyzeSequence() {
        const accession = accessionInput.value.trim();
        const sequenceType = document.getElementById('sequenceType').value;
        
        if (!accession) {
            alert('Please enter an accession number');
            return;
        }

        loadingSpinner.style.display = 'block';
        resultsSection.style.display = 'none';

        try {
            const response = await fetch(`/dna-analysis/api/fetch-sequence?accession=${accession}`);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to retrieve sequence');
            }

            const sequence = data.sequence.toUpperCase();
            const counts = countNucleotides(sequence, sequenceType === 'RNA');
            displayReports(accession, counts, sequenceType);
        } catch (error) {
            displayError(accession, error.message);
        } finally {
            loadingSpinner.style.display = 'none';
            resultsSection.style.display = 'block';
        }
    }

    function countNucleotides(sequence, isRNA = false) {
        const counts = {
            A: 0, C: 0, G: 0,
            [isRNA ? 'U' : 'T']: 0,
            'Ambiguous': new Map()
        };

        const validNucleotides = isRNA ? ['A', 'C', 'G', 'U'] : ['A', 'C', 'G', 'T'];
        const ambiguousCodes = new Set(['N', 'R', 'Y', 'K', 'M', 'S', 'W', 'B', 'D', 'H', 'V']);

        for (const nucleotide of sequence) {
            if (validNucleotides.includes(nucleotide)) {
                counts[nucleotide]++;
            } else if (ambiguousCodes.has(nucleotide)) {
                counts.Ambiguous.set(
                    nucleotide, 
                    (counts.Ambiguous.get(nucleotide) || 0) + 1
                );
            }
        }

        // Calculate base total (excluding ambiguous nucleotides)
        const baseTotal = validNucleotides.reduce((sum, nuc) => sum + counts[nuc], 0);
        
        // Calculate percentages
        const percentages = {};
        validNucleotides.forEach(nuc => {
            percentages[nuc] = ((counts[nuc] / baseTotal) * 100).toFixed(1);
        });

        return { counts, baseTotal, percentages };
    }

    let exportButton;

    function clearPreviousResults() {
        // Remove existing export button if it exists
        if (exportButton) {
            exportButton.remove();
        }
        
        // Clear and hide chart section
        chartSection.style.display = 'none';
        if (nucleotideChart) {
            nucleotideChart.destroy();
            nucleotideChart = null;
        }

        // Clear table contents
        const nucleotideTable = document.getElementById('nucleotideReport').getElementsByTagName('tbody')[0];
        nucleotideTable.innerHTML = '';
        document.getElementById('retrievalRow').innerHTML = '';
    }

    function displayReports(accession, nucleotideData, sequenceType) {
        clearPreviousResults();
        const { counts, baseTotal, percentages } = nucleotideData;
        const totalLength = baseTotal + 
            Array.from(counts.Ambiguous.values()).reduce((sum, count) => sum + count, 0);

        // Update retrieval report
        document.getElementById('retrievalRow').innerHTML = `
            <td>${accession}</td>
            <td>Success</td>
            <td>${totalLength}</td>
            <td>${sequenceType}</td>
        `;

        // Update nucleotide report
        const nucleotideTable = document.getElementById('nucleotideReport')
            .getElementsByTagName('tbody')[0];
        nucleotideTable.innerHTML = '';

        let serialNo = 1;

        // Standard nucleotides
        for (const [nucleotide, count] of Object.entries(counts)) {
            if (nucleotide === 'Ambiguous') continue;
            const row = nucleotideTable.insertRow();
            row.innerHTML = `
                <td>${serialNo++}</td>
                <td>${nucleotide}</td>
                <td>${count}</td>
                <td>${percentages[nucleotide]}%</td>
            `;
        }

        // Ambiguous nucleotides (sorted alphabetically)
        const sortedAmbiguous = Array.from(counts.Ambiguous.entries())
            .sort(([a], [b]) => a.localeCompare(b));

        for (const [nucleotide, count] of sortedAmbiguous) {
            const row = nucleotideTable.insertRow();
            row.innerHTML = `
                <td>${serialNo++}</td>
                <td>${nucleotide}</td>
                <td>${count}</td>
                <td>-</td>
            `;
        }

        // Total row
        const totalRow = nucleotideTable.insertRow();
        totalRow.innerHTML = `
            <td>Total</td>
            <td></td>
            <td>${totalLength}</td>
            <td>100%</td>
        `;

        // Add GC content calculation and display
        const gcContent = ((counts['G'] + counts['C']) / baseTotal * 100).toFixed(1);
        const gcRow = nucleotideTable.insertRow();
        gcRow.innerHTML = `
            <td colspan="3">GC Content</td>
            <td>${gcContent}%</td>
        `;
        gcRow.classList.add('gc-content-row');

        // Create export button
        exportButton = document.createElement('button');
        exportButton.textContent = 'Export Report as PDF';
        exportButton.classList.add('export-btn');
        exportButton.onclick = () => exportToPDF(accession, sequenceType);
        const buttonContainer = document.createElement('div');
        buttonContainer.style.textAlign = 'center';
        buttonContainer.appendChild(exportButton);
        document.getElementById('resultsSection').appendChild(buttonContainer);

        // Create chart and download button
        if (Object.keys(nucleotideData.counts).some(key => key !== 'Ambiguous' && nucleotideData.counts[key] > 0)) {
            chartSection.style.display = 'block';
            
            const chartDownloadBtn = document.createElement('button');
            chartDownloadBtn.textContent = 'Download Chart';
            chartDownloadBtn.classList.add('chart-download-btn');
            chartDownloadBtn.onclick = downloadChart;
            chartSection.insertBefore(chartDownloadBtn, chartSection.firstChild);
            
            createNucleotideChart(nucleotideData, accession, sequenceType);
        }
    }

    function downloadChart() {
        try {
            const canvas = document.getElementById('nucleotideChart');
            if (!canvas) {
                throw new Error('Chart canvas not found');
            }

            // Create a new canvas with white background
            const exportCanvas = document.createElement('canvas');
            exportCanvas.width = canvas.width;
            exportCanvas.height = canvas.height;
            const exportCtx = exportCanvas.getContext('2d');

            // Fill with white background
            exportCtx.fillStyle = 'white';
            exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

            // Draw the chart on top
            exportCtx.drawImage(canvas, 0, 0);

            // Create download link
            const link = document.createElement('a');
            link.download = 'nucleotide-distribution.jpg';
            link.href = exportCanvas.toDataURL('image/jpeg', 1.0);
            
            // Trigger download
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
        } catch (error) {
            console.error('Chart download error:', error);
            alert('Error downloading chart: ' + error.message);
        }
    }

    function createNucleotideChart(nucleotideData, accession, sequenceType) {
        const { percentages } = nucleotideData;
        
        if (nucleotideChart) {
            nucleotideChart.destroy();
        }

        const canvas = document.getElementById('nucleotideChart');
        const ctx = canvas.getContext('2d');
        
        nucleotideChart = new Chart(ctx, {
            type: 'bar',
            plugins: [{
                beforeDraw: (chart) => {
                    const ctx = chart.canvas.getContext('2d');
                    ctx.save();
                    ctx.globalCompositeOperation = 'destination-over';
                    ctx.fillStyle = 'white';
                    ctx.fillRect(0, 0, chart.width, chart.height);
                    ctx.restore();
                }
            }],
            data: {
                labels: Object.keys(percentages),
                datasets: [{
                    label: 'Percentage (%)',
                    data: Object.values(percentages),
                    backgroundColor: [
                        '#FF6B6B', // A - red
                        '#4ECDC4', // C - cyan
                        '#45B7D1', // G - blue
                        '#96CEB4'  // T/U - green
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: `Nucleotide Distribution for ${accession} - ${sequenceType}`,
                        font: { size: 16 },
                        color: 'black'
                    },
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        grid: {
                            color: '#E0E0E0',
                            drawBorder: true
                        },
                        ticks: {
                            color: 'black'
                        },
                        title: {
                            display: true,
                            text: 'Percentage (%)',
                            color: 'black'
                        }
                    },
                    x: {
                        grid: {
                            color: '#E0E0E0',
                            drawBorder: true
                        },
                        ticks: {
                            color: 'black'
                        },
                        title: {
                            display: true,
                            text: 'Nucleotides',
                            color: 'black'
                        }
                    }
                }
            }
        });
    }

    function displayError(accession, errorMessage) {
        clearPreviousResults();
        document.getElementById('retrievalRow').innerHTML = `
            <td>${accession}</td>
            <td>Failure</td>
            <td>-</td>
        `;
        document.getElementById('nucleotideReport').getElementsByTagName('tbody')[0].innerHTML = '';
        chartSection.style.display = 'none';
    }

    async function exportToPDF(accession, sequenceType) {
        try {
            if (!window.jspdf) {
                throw new Error('PDF library not loaded');
            }

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            
            // Add title
            doc.setFontSize(16);
            doc.text(`DNA Analysis Report - ${accession}`, 14, 15);
            
            // Add URL and date
            doc.setFontSize(10);
            doc.setTextColor(100);  // Gray color
            const currentDate = new Date().toLocaleDateString();
            const currentTime = new Date().toLocaleTimeString();
            const url = window.location.href;
            doc.text(`Generated from: ${url}`, 14, 22);
            doc.text(`Date: ${currentDate} ${currentTime}`, 14, 28);
            
            // Add sequence type
            doc.setFontSize(12);
            doc.setTextColor(0);  // Back to black
            doc.text(`Sequence Type: ${sequenceType}`, 14, 35);

            // Add retrieval info
            const retrievalRow = document.getElementById('retrievalRow');
            if (!retrievalRow) {
                throw new Error('Report data not found');
            }

            const retrievalData = [
                ['Accession', 'Status', 'Length', 'Type'],
                Array.from(retrievalRow.children).map(td => td.textContent)
            ];

            doc.autoTable({
                startY: 45,  // Adjusted starting position to accommodate header
                head: [retrievalData[0]],
                body: [retrievalData[1]]
            });

            // Add nucleotide distribution
            const nucleotideTable = document.getElementById('nucleotideReport')
                .getElementsByTagName('tbody')[0];
            if (!nucleotideTable) {
                throw new Error('Nucleotide data not found');
            }

            const nucleotideRows = Array.from(nucleotideTable.rows)
                .map(row => Array.from(row.cells).map(cell => cell.textContent));

            doc.autoTable({
                startY: doc.lastAutoTable.finalY + 10,
                head: [['No.', 'Nucleotide', 'Count', 'Percentage']],
                body: nucleotideRows
            });

            // Add chart if it exists
            const chartCanvas = document.getElementById('nucleotideChart');
            if (chartCanvas) {
                const chartImg = chartCanvas.toDataURL('image/png', 1.0);
                const imgWidth = 180;
                const imgHeight = 100;
                doc.addImage(chartImg, 'PNG', 15, doc.lastAutoTable.finalY + 10, imgWidth, imgHeight);
            }

            // Save PDF
            doc.save(`DNA_Analysis_${accession}.pdf`);

        } catch (error) {
            console.error('Export error:', error);
            alert('Error generating PDF: ' + error.message);
        }
    }

    function generateCSV(accession, nucleotideData, sequenceType) {
        const { counts, percentages } = nucleotideData;
        let csv = `DNA Analysis Report - ${accession}\n\n`;
        csv += 'Nucleotide,Count,Percentage\n';
        
        // Standard nucleotides
        Object.entries(counts).forEach(([nuc, count]) => {
            if (nuc !== 'Ambiguous') {
                csv += `${nuc},${count},${percentages[nuc]}%\n`;
            }
        });
        
        // Ambiguous nucleotides
        counts.Ambiguous.forEach((count, nuc) => {
            csv += `${nuc},${count},-\n`;
        });

        return csv;
    }

    function generateTXT(accession, nucleotideData, sequenceType) {
        const { counts, percentages } = nucleotideData;
        let txt = `DNA Analysis Report - ${accession}\n`;
        txt += `Sequence Type: ${sequenceType}\n\n`;
        txt += 'Nucleotide Distribution:\n';
        txt += '-'.repeat(30) + '\n';
        
        // Standard nucleotides
        Object.entries(counts).forEach(([nuc, count]) => {
            if (nuc !== 'Ambiguous') {
                txt += `${nuc}: ${count} (${percentages[nuc]}%)\n`;
            }
        });
        
        // Ambiguous nucleotides
        txt += '\nAmbiguous Nucleotides:\n';
        txt += '-'.repeat(30) + '\n';
        counts.Ambiguous.forEach((count, nuc) => {
            txt += `${nuc}: ${count}\n`;
        });

        return txt;
    }

    function downloadFile(content, filename, type) {
        const blob = new Blob([content], { type });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
    }

    function updateCitations() {
        const currentDate = new Date();
        const year = currentDate.getFullYear();
        const url = window.location.href;
        const month = currentDate.toLocaleString('en-US', { month: 'long' });
        const day = currentDate.getDate();

        // APA Format (7th Edition)
        const apaCitation = `Priyam, J., & Saxena, U. (${year}). Jyotsna's NCBI Tools (Nucleotide Sequence Download) [Computer software]. National Institute of Technology Warangal. Retrieved ${month} ${day}, ${year}, from ${url}`;
        document.getElementById('apaCitation').textContent = apaCitation;

        // MLA Format
        const mlaCitation = `"Jyotsna's NCBI Tools (Nucleotide Sequence Download)." National Institute of Technology Warangal, ${month} ${year}, ${url}`;
        document.getElementById('mlaCitation').textContent = mlaCitation;

        // BibTeX Format
        const bibtexCitation = `@software{jyotsna_ncbi_tools,
        title={Jyotsna's NCBI Tools (Nucleotide Sequence Download)},
        author={Priyam, Jyotsna and Saxena, Urmila},
        year={${year}},
        institution={National Institute of Technology Warangal},
        url={${url}},
        note={Retrieved ${month} ${day}, ${year}}
}`;
        document.getElementById('bibtexCitation').textContent = bibtexCitation;
    }

    // Make sure this runs when page loads
    updateCitations();
});