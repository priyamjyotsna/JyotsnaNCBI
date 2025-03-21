document.addEventListener('DOMContentLoaded', function() {
    const sequenceInput = document.getElementById('sequenceInput');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const loadingSpinner = document.getElementById('loadingSpinner');
    const resultsSection = document.getElementById('resultsSection');
    const dragDropZone = document.getElementById('dragDropZone');
    const sequenceFile = document.getElementById('sequenceFile');
    const exportCSVBtn = document.getElementById('exportCSV');

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

        const reader = new FileReader();
        reader.onload = (e) => {
            const sequence = e.target.result;
            analyzeSequence(sequence);
        };
        reader.readAsText(file);
    }

    analyzeBtn.addEventListener('click', () => {
        const sequence = sequenceInput.value.trim();
        if (!sequence) {
            alert('Please enter a sequence or upload a file');
            return;
        }
        analyzeSequence(sequence);
    });

    function analyzeSequence(sequence) {
        loadingSpinner.style.display = 'block';
        resultsSection.style.display = 'none';

        // Process sequence
        const characterMap = new Map();
        let serialNo = 1;

        sequence.toUpperCase().split('').forEach(char => {
            if (!characterMap.has(char)) {
                characterMap.set(char, serialNo++);
            }
        });

        // Display results
        displayResults(characterMap);

        loadingSpinner.style.display = 'none';
        resultsSection.style.display = 'block';
    }

    function displayResults(characterMap) {
        const tbody = document.getElementById('characterReport').getElementsByTagName('tbody')[0];
        tbody.innerHTML = '';

        // Sort entries by serial number
        const sortedEntries = Array.from(characterMap.entries())
            .sort((a, b) => a[1] - b[1]);

        sortedEntries.forEach(([char, serialNo]) => {
            const row = tbody.insertRow();
            row.innerHTML = `
                <td>${serialNo}</td>
                <td>${char}</td>
            `;
        });
    }

    exportCSVBtn.addEventListener('click', () => {
        const rows = Array.from(document.getElementById('characterReport')
            .getElementsByTagName('tbody')[0].rows);
        
        let csv = 'Serial No,Character\n';
        rows.forEach(row => {
            csv += `${row.cells[0].textContent},${row.cells[1].textContent}\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'character_sequence.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
    });

    // Update citations with current date and URL
    updateCitations();
});

function updateCitations() {
    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const url = window.location.href;
    const month = currentDate.toLocaleString('en-US', { month: 'long' });
    const day = currentDate.getDate();

    // APA Format (7th Edition)
    const apaCitation = `Priyam, J., & Saxena, U. (${year}). Nucleotide Download Tool [Computer software]. National Institute of Technology Warangal. Retrieved ${month} ${day}, ${year}, from ${url}`;
    document.getElementById('apaCitation').textContent = apaCitation;

    // MLA Format
    const mlaCitation = `"Nucleotide Download Tool." National Institute of Technology Warangal, ${month} ${year}, ${url}`;
    document.getElementById('mlaCitation').textContent = mlaCitation;

    // BibTeX Format
    const bibtexCitation = `@software{nucleotide_download_tool,
    title={Nucleotide Download Tool},
    author={Priyam, Jyotsna and Saxena, Urmila},
    year={${year}},
    institution={National Institute of Technology Warangal},
    url={${url}},
    note={Retrieved ${month} ${day}, ${year}}
}`;
    document.getElementById('bibtexCitation').textContent = bibtexCitation;
}

function copyCitation(format) {
    let element;
    switch(format) {
        case 'apa':
            element = document.getElementById('apaCitation');
            break;
        case 'mla':
            element = document.getElementById('mlaCitation');
            break;
        case 'bibtex':
            element = document.getElementById('bibtexCitation');
            break;
    }

    const text = element.textContent;
    navigator.clipboard.writeText(text).then(() => {
        const btn = element.nextElementSibling;
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => {
            btn.textContent = originalText;
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy:', err);
        alert('Failed to copy citation. Please try selecting and copying manually.');
    });
}

<style>
.citation-section {
    margin-top: 40px;
    padding: 20px;
    background: white;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.citation-section h3 {
    color: #333;
    margin-bottom: 20px;
}

.citation-formats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 20px;
}

.citation-box {
    padding: 15px;
    border: 1px solid #ddd;
    border-radius: 6px;
    background: #f9f9f9;
}

.citation-box h4 {
    color: #444;
    margin-bottom: 10px;
}

.citation-box p, .citation-box pre {
    margin: 10px 0;
    padding: 10px;
    background: white;
    border: 1px solid #eee;
    border-radius: 4px;
    font-size: 14px;
    white-space: pre-wrap;
    word-wrap: break-word;
}

.copy-btn {
    background: #4a90e2;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    transition: background 0.3s;
}

.copy-btn:hover {
    background: #357abd;
}

.copy-btn:active {
    transform: translateY(1px);
}
</style>