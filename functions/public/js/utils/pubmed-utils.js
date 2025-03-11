// Helper functions for PubMed data processing
export const formatAuthors = (authors) => {
    if (!authors || !authors.length) return 'Authors not specified';
    const authorNames = authors.map(author => {
        if (typeof author === 'string') return author;
        if (author?.name) return author.name;
        if (author?.lastname) {
            const firstName = author.firstname || author.initials || '';
            return `${author.lastname}${firstName ? ' ' + firstName : ''}`;
        }
        return null;
    }).filter(Boolean);
    
    return authorNames.length > 3 
        ? `${authorNames.slice(0, 3).join(', ')} et al.`
        : authorNames.join(', ');
};

export const extractAbstractText = (result) => {
    if (!result) return '';
    const possibleFields = ['abstract', 'bookabstract', 'snippet', 'description'];
    for (const field of possibleFields) {
        if (result[field]) return result[field];
    }
    return '';
};

export const extractMeshTerms = (result) => {
    if (!result) return [];
    const fields = ['meshterms', 'mesh', 'meshheadinglist', 'meshlist'];
    for (const field of fields) {
        if (result[field]) {
            return Array.isArray(result[field]) ? result[field] : [result[field]];
        }
    }
    return [];
};

export const formatDate = (dateText) => {
    if (!dateText) return '';
    try {
        const yearMatch = dateText.match(/\d{4}/);
        if (yearMatch) return yearMatch[0];
        const date = new Date(dateText);
        return !isNaN(date.getTime()) ? date.getFullYear().toString() : '';
    } catch (e) {
        console.error('Error parsing date:', e);
        return '';
    }
};