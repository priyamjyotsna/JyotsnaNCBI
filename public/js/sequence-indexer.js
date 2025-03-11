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
});