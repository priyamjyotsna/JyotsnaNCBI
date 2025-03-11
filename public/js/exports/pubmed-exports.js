import { formatAuthors, formatDate } from '../utils/pubmed-utils.js';

export const generateCSV = (results, selectedFields) => {
    const headers = selectedFields.map(field => {
        const fieldMap = {
            title: 'Title',
            authors: 'Authors',
            journal: 'Journal',
            date: 'Publication Date',
            doi: 'DOI',
            pmid: 'PMID',
            abstract: 'Abstract',
            keywords: 'Keywords',
            pubtype: 'Publication Type',
            mesh: 'MeSH Terms'
        };
        return fieldMap[field] || field.charAt(0).toUpperCase() + field.slice(1);
    });
    
    const csv = [headers.join(',')];
    
    results.forEach(result => {
        const row = selectedFields.map(field => {
            let content = '';
            const element = result.querySelector(`.${field} .meta-content`);
            
            if (field === 'title') {
                content = result.querySelector('.result-title')?.textContent || '';
            } else if (field === 'abstract') {
                const abstractEl = result.querySelector('.result-abstract');
                if (abstractEl?.textContent && !abstractEl.textContent.includes('Click')) {
                    content = abstractEl.textContent;
                }
            } else if (element) {
                content = field === 'doi' && element.querySelector('a') 
                    ? element.querySelector('a').textContent 
                    : element.textContent;
            }
            
            return `"${(content || '').replace(/"/g, '""')}"`;
        });
        
        csv.push(row.join(','));
    });
    
    return csv.join('\n');
};

// Similar refactoring for BibTeX and RIS exports...