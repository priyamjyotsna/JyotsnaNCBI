/**
 * PDF Export function for Sequence Comparison Tool
 */

function exportToPDF(data) {
    // Create a new window with the data we want to print
    const printWindow = window.open('', '_blank');
    
    // Extract data from the input object
    const {
        totalMutations,
        sequenceLength,
        mutationRate,
        refHeader,
        queryHeader,
        refLength,
        queryLength,
        mutations
    } = data;
    
    // Generate mutation table HTML
    let mutationTableHTML = '';
    mutations.forEach(mutation => {
        mutationTableHTML += `
            <tr>
                <td>${mutation.position}</td>
                <td>${mutation.referenceBase === '-' ? 'Gap' : mutation.referenceBase}</td>
                <td>${mutation.queryBase === '-' ? 'Gap' : mutation.queryBase}</td>
                <td>${mutation.type}</td>
            </tr>
        `;
    });
    
    // Create a simple HTML document
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Sequence Comparison Report</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                h1, h2 { color: #333; }
                table { border-collapse: collapse; width: 100%; margin: 15px 0; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                th { background-color: #4285f4; color: white; }
                tr:nth-child(even) { background-color: #f9f9f9; }
                .summary { background-color: #f5f8ff; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
                .info-section { display: flex; justify-content: space-between; margin-bottom: 20px; }
                .info-card { width: 48%; background-color: #f9f9f9; padding: 10px; border-radius: 5px; }
                .page-break { page-break-before: always; }
                @media print {
                    .page-break { page-break-before: always; }
                }
            </style>
        </head>
        <body>
            <h1>Sequence Comparison Report</h1>
            <p>Generated on: ${new Date().toLocaleString()}</p>
            
            <div class="summary">
                <h2>Summary</h2>
                <table>
                    <tr>
                        <td><strong>Total Mutations:</strong> ${totalMutations}</td>
                        <td><strong>Sequence Length:</strong> ${sequenceLength}</td>
                        <td><strong>Mutation Rate:</strong> ${mutationRate}</td>
                    </tr>
                </table>
            </div>
            
            <div class="info-section">
                <div class="info-card">
                    <h2>Reference Sequence</h2>
                    <p><strong>Header:</strong> ${refHeader}</p>
                    <p><strong>Length:</strong> ${refLength} bp</p>
                </div>
                <div class="info-card">
                    <h2>Query Sequence</h2>
                    <p><strong>Header:</strong> ${queryHeader}</p>
                    <p><strong>Length:</strong> ${queryLength} bp</p>
                </div>
            </div>
            
            <div>
                <h2>Mutation Distribution</h2>
                <div style="text-align: center; padding: 20px; background-color: #f9f9f9; border-radius: 5px;">
                    Chart rendering is temporarily disabled
                </div>
            </div>
            
            <div class="page-break">
                <h2>Detailed Mutation List</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Position</th>
                            <th>Reference</th>
                            <th>Query</th>
                            <th>Type</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${mutationTableHTML}
                    </tbody>
                </table>
            </div>
            
            <div class="page-break">
                <h2>Citation Information</h2>
                <hr>
                
                <h3>How to Cite This Tool</h3>
                
                <h4>APA Format:</h4>
                <p style="background-color: #f9f9f9; padding: 10px; border-radius: 5px;">
                    Priyam, J. (2025). Jyotsna's NCBI Tools - Sequence Comparison Tool. DOI: 10.5281/zenodo.15069907
                </p>
                
                <h4>MLA Format:</h4>
                <p style="background-color: #f9f9f9; padding: 10px; border-radius: 5px;">
                    Priyam, J. "Jyotsna's NCBI Tools - Sequence Comparison Tool." 2025, DOI: 10.5281/zenodo.15069907.
                    Accessed ${new Date().toLocaleDateString('en-US', {month: 'long', day: 'numeric', year: 'numeric'})}.
                </p>
                
                <h4>Chicago Format:</h4>
                <p style="background-color: #f9f9f9; padding: 10px; border-radius: 5px;">
                    Priyam, J. "Jyotsna's NCBI Tools - Sequence Comparison Tool." Last modified 2025. DOI: 10.5281/zenodo.15069907.
                </p>
            </div>
            
            <script>
                // Print automatically after loading
                window.onload = function() {
                    setTimeout(function() {
                        window.print();
                    }, 500);
                };
            </script>
        </body>
        </html>
    `);
    
    // Close the document stream
    printWindow.document.close();
} 