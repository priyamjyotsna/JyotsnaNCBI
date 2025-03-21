const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const { createCanvas } = require('canvas');

router.post('/generate-pdf', async (req, res) => {
    try {
        const { metadata, mutations, stats, chartData, generatedDate, currentUrl } = req.body;

        // Create PDF document
        const doc = new PDFDocument({
            size: 'A4',
            margin: 50,
            autoFirstPage: true,
            bufferPages: false // Disable page buffering
        });

        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=mutation-report.pdf');
        doc.pipe(res);

        // Constants for layout
        const pageWidth = doc.page.width - 100;
        const rowHeight = 20;
        const headerHeight = 25;
        const footerHeight = 40;
        const pageMargin = 50;

        // First Page Content (Summary Page)
        doc.fontSize(16)
           .font('Helvetica-Bold')
           .text('Mutation Summary Report', { align: 'center' })
           .moveDown(0.5);

        doc.fontSize(10)
           .font('Helvetica')
           .text(`Generated: ${generatedDate}`, { align: 'center' })
           .text(`URL: ${currentUrl || 'N/A'}`, { align: 'center' })
           .moveDown(1);

        // Stats table
        const statsData = [
            ['Total Mutations:', stats.totalMutations],
            ['Sequence Length:', stats.sequenceLength],
            ['Mutation Rate:', stats.mutationRate],
            ['Reference Header:', metadata.referenceHeader || 'N/A'],
            ['Reference Length:', metadata.referenceLength + ' bp'],
            ['Query Header:', metadata.queryHeader || 'N/A'],
            ['Query Length:', metadata.queryLength + ' bp']
        ];

        statsData.forEach(([label, value], index) => {
            const y = doc.y;
            if (index % 2 === 0) {
                doc.fillColor('#f5f5f5')
                   .rect(50, y, pageWidth, rowHeight)
                   .fill();
            }
            doc.fillColor('#000000')
               .text(label, 60, y + 5)
               .text(value, 200, y + 5);
            doc.moveDown(0.5);
        });

        // Chart Section
        if (chartData && chartData.labels && chartData.data) {
            doc.moveDown(1);
            const canvas = createCanvas(600, 300); // Increased canvas size
            const ctx = canvas.getContext('2d');
            
            // Set white background
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Chart margins and dimensions
            const margin = { top: 30, right: 40, bottom: 60, left: 60 }; // Increased margins
            const graphWidth = canvas.width - margin.left - margin.right;
            const graphHeight = canvas.height - margin.top - margin.bottom;
            
            // Draw axes with thicker lines
            ctx.beginPath();
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 2; // Thicker lines
            
            // Y-axis
            ctx.moveTo(margin.left, margin.top);
            ctx.lineTo(margin.left, canvas.height - margin.bottom);
            
            // X-axis
            ctx.moveTo(margin.left, canvas.height - margin.bottom);
            ctx.lineTo(canvas.width - margin.right, canvas.height - margin.bottom);
            ctx.stroke();

            // Calculate scales
            const maxValue = Math.max(...chartData.data, 1);
            const yTicks = 5; // Number of Y-axis ticks
            const yStep = Math.ceil(maxValue / yTicks);
            
            // Draw Y-axis grid lines and labels
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.font = '12px Arial'; // Increased font size
            ctx.fillStyle = '#000000';
            ctx.strokeStyle = '#e0e0e0'; // Light gray for grid lines
            ctx.lineWidth = 1;
            
            for (let i = 0; i <= yTicks; i++) {
                const value = i * yStep;
                const y = canvas.height - margin.bottom - (value / maxValue) * graphHeight;
                
                // Draw grid line
                ctx.beginPath();
                ctx.moveTo(margin.left, y);
                ctx.lineTo(canvas.width - margin.right, y);
                ctx.strokeStyle = '#e0e0e0';
                ctx.stroke();
                
                // Draw tick
                ctx.beginPath();
                ctx.moveTo(margin.left - 5, y);
                ctx.lineTo(margin.left, y);
                ctx.strokeStyle = '#000000';
                ctx.stroke();
                
                // Draw label
                ctx.fillStyle = '#000000';
                ctx.fillText(value.toString(), margin.left - 10, y);
            }

            // Draw bars and X-axis labels
            const barWidth = (graphWidth / chartData.data.length) * 0.8;
            const barSpacing = (graphWidth / chartData.data.length) * 0.2;
            
            // Draw X-axis grid lines and labels
            chartData.data.forEach((value, i) => {
                const x = margin.left + (i * (graphWidth / chartData.data.length));
                
                // Draw vertical grid line
                ctx.beginPath();
                ctx.moveTo(x + barWidth/2 + barSpacing/2, canvas.height - margin.bottom);
                ctx.lineTo(x + barWidth/2 + barSpacing/2, margin.top);
                ctx.strokeStyle = '#e0e0e0';
                ctx.stroke();

                const barHeight = (value / maxValue) * graphHeight;
                const y = canvas.height - margin.bottom - barHeight;

                // Draw bar with gradient
                const gradient = ctx.createLinearGradient(x, y, x, canvas.height - margin.bottom);
                gradient.addColorStop(0, '#4285f4');
                gradient.addColorStop(1, '#73a7ff');
                
                ctx.fillStyle = gradient;
                ctx.fillRect(x + barSpacing/2, y, barWidth, barHeight);

                // Draw X-axis label
                ctx.save();
                ctx.translate(x + barWidth/2 + barSpacing/2, canvas.height - margin.bottom + 10);
                ctx.rotate(Math.PI / 4); // Rotate 45 degrees
                ctx.textAlign = 'left';
                ctx.fillStyle = '#000000';
                ctx.font = '11px Arial'; // Slightly larger font for labels
                ctx.fillText(chartData.labels[i], 0, 0);
                ctx.restore();
            });

            // Add axis titles with larger, bold font
            ctx.textAlign = 'center';
            ctx.font = 'bold 14px Arial'; // Larger, bold font for titles
            ctx.fillStyle = '#000000';
            
            // X-axis title
            ctx.fillText('Sequence Position', 
                margin.left + graphWidth/2, 
                canvas.height - margin.bottom/3
            );
            
            // Y-axis title
            ctx.save();
            ctx.translate(margin.left/3, margin.top + graphHeight/2);
            ctx.rotate(-Math.PI/2);
            ctx.fillText('Number of Mutations', 0, 0);
            ctx.restore();

            // Add chart to PDF with adjusted size
            doc.image(canvas.toBuffer(), 50, doc.y, { width: pageWidth });
        }

        // Mutation Details Section
        if (mutations.length > 0) {
            // Calculate available height for content
            const pageContentHeight = doc.page.height - doc.page.margins.top - doc.page.margins.bottom;
            const tableHeaderHeight = headerHeight + 30; // Header + padding
            const availableHeight = pageContentHeight - tableHeaderHeight - footerHeight;
            const rowsPerPage = Math.floor(availableHeight / rowHeight);
            const totalPages = Math.ceil(mutations.length / rowsPerPage);

            // Column configuration
            const columnWidths = {
                position: pageWidth * 0.15,
                reference: pageWidth * 0.25,
                query: pageWidth * 0.25,
                type: pageWidth * 0.35
            };

            // Process mutations page by page
            for (let pageNum = 0; pageNum < totalPages; pageNum++) {
                // Start new page
                doc.addPage();

                // Calculate row range for this page
                const startRow = pageNum * rowsPerPage;
                const endRow = Math.min(startRow + rowsPerPage, mutations.length);
                
                // Draw page content in a single operation
                doc.save();
                
                // 1. Draw page header
                doc.fontSize(14)
                   .font('Helvetica-Bold');
                const titleWidth = doc.widthOfString('Mutation Details');
                doc.text('Mutation Details', 
                    (doc.page.width - titleWidth) / 2,
                    doc.page.margins.top,
                    { lineBreak: false }
                );

                // 2. Draw table header
                const tableY = doc.page.margins.top + 40;
                doc.fillColor('#e6e6e6')
                   .rect(pageMargin, tableY, pageWidth, headerHeight)
                   .fill();

                // Draw column headers
                doc.fillColor('#000000')
                   .fontSize(10)
                   .font('Helvetica-Bold');
                
                let headerX = pageMargin;
                ['Position', 'Reference', 'Query', 'Type'].forEach(header => {
                    doc.text(header, 
                        headerX + 5, 
                        tableY + 7,
                        { lineBreak: false }
                    );
                    headerX += columnWidths[header.toLowerCase()];
                });

                // 3. Draw table rows
                let rowY = tableY + headerHeight;
                for (let i = startRow; i < endRow; i++) {
                    const mutation = mutations[i];
                    const isEven = (i - startRow) % 2 === 0;

                    // Draw row background
                    if (isEven) {
                        doc.fillColor('#f5f5f5')
                           .rect(pageMargin, rowY, pageWidth, rowHeight)
                           .fill();
                    }

                    // Draw row content
                    doc.fillColor('#000000')
                       .fontSize(9)
                       .font('Helvetica');

                    let x = pageMargin;
                    
                    // Position
                    doc.text(mutation.position.toString(), 
                        x + 5, 
                        rowY + 5,
                        { continued: true, lineBreak: false }
                    );
                    x += columnWidths.position;
                    
                    // Reference
                    doc.text(mutation.referenceBase === '-' ? 'Gap' : mutation.referenceBase,
                        x + 5,
                        rowY + 5,
                        { continued: true, lineBreak: false }
                    );
                    x += columnWidths.reference;
                    
                    // Query
                    doc.text(mutation.queryBase === '-' ? 'Gap' : mutation.queryBase,
                        x + 5,
                        rowY + 5,
                        { continued: true, lineBreak: false }
                    );
                    x += columnWidths.query;
                    
                    // Type
                    doc.text(mutation.type.charAt(0).toUpperCase() + mutation.type.slice(1),
                        x + 5,
                        rowY + 5,
                        { lineBreak: false }
                    );

                    rowY += rowHeight;
                }

                // 4. Draw page footer
                doc.fontSize(8)
                   .font('Helvetica');
                
                const pageText = `Page ${pageNum + 1} of ${totalPages}`;
                const mutationText = `Showing mutations ${startRow + 1} - ${endRow} of ${mutations.length}`;
                
                const pageTextWidth = doc.widthOfString(pageText);
                const mutationTextWidth = doc.widthOfString(mutationText);
                
                doc.text(pageText,
                    (doc.page.width - pageTextWidth) / 2,
                    doc.page.height - 30,
                    { lineBreak: false }
                );
                
                doc.text(mutationText,
                    (doc.page.width - mutationTextWidth) / 2,
                    doc.page.height - 20,
                    { lineBreak: false }
                );

                doc.restore();
            }
        }

        // Finalize PDF
        doc.end();

    } catch (error) {
        console.error('Error generating PDF:', error);
        res.status(500).json({ error: 'Failed to generate PDF' });
    }
});

module.exports = router; 