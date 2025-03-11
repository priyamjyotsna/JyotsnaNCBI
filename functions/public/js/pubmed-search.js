
async function testEndpoints() {
    const endpoints = [
        {
            name: 'PubMed Efetch',
            url: '/api/pubmed/efetch',
            params: { db: 'pubmed', id: '39944571', rettype: 'abstract', retmode: 'xml' }
        },
        {
            name: 'PubMed Summary',
            url: '/api/pubmed/summary',
            params: { ids: '39944571' }
        },
        {
            name: 'PMC',
            url: '/api/pmc/PMC11816109'
        },
        {
            name: 'DOI',
            url: '/api/doi/10.3389%2Ffpubh.2024.1531523'
        }
    ];

    for (const endpoint of endpoints) {
        try {
            const url = `${endpoint.url}${endpoint.params ? '?' + new URLSearchParams(endpoint.params) : ''}`;
            console.log(`Testing ${endpoint.name} endpoint:`, url);
            
            const response = await fetch(url);
            console.log(`${endpoint.name} Status:`, response.status);
            
            if (response.ok) {
                const data = await response.json();
                console.log(`${endpoint.name} Response:`, data);
            } else {
                console.error(`${endpoint.name} Error:`, response.statusText);
            }
        } catch (error) {
            console.error(`${endpoint.name} Error:`, error.message);
        }
    }
}

// Call this function to test
testEndpoints();


async function fetchAbstract(pmid) {
    try {
        const articleElement = document.querySelector(`article[data-pmid="${pmid}"]`);
        if (!articleElement) {
            console.error('Article element not found for PMID:', pmid);
            return;
        }

        let abstractContainer = articleElement.querySelector('.no-abstract, .abstract-section');
        if (!abstractContainer) {
            console.log('Creating new abstract container for PMID:', pmid);
            abstractContainer = document.createElement('div');
            abstractContainer.className = 'no-abstract';
            const metaSection = articleElement.querySelector('.result-meta');
            if (metaSection) {
                metaSection.insertAdjacentElement('afterend', abstractContainer);
            } else {
                articleElement.appendChild(abstractContainer);
            }
        }

        abstractContainer.innerHTML = '<p>Fetching abstract...</p>';
        
        // Use the working summary endpoint
        const summaryResponse = await fetch(`/api/pubmed/summary?ids=${pmid}`);
        if (!summaryResponse.ok) {
            throw new Error(`Failed to fetch summary: ${summaryResponse.statusText}`);
        }
        
        const summaryData = await summaryResponse.json();
        let abstractText = '';
        
        if (summaryData?.result?.[pmid]) {
            const result = summaryData.result[pmid];
            
            // Try to extract abstract from summary data
            abstractText = extractAbstractText(result);
            
            // If no abstract found but article has abstract flag
            if (!abstractText && result.attributes?.includes('Has Abstract')) {
                console.log('Article has abstract but not found in summary data');
                
                // Try alternative data paths
                if (result.abstracttext) {
                    abstractText = Array.isArray(result.abstracttext) 
                        ? result.abstracttext.join(' ')
                        : result.abstracttext;
                } else if (result.Article?.Abstract?.AbstractText) {
                    abstractText = Array.isArray(result.Article.Abstract.AbstractText)
                        ? result.Article.Abstract.AbstractText.join(' ')
                        : result.Article.Abstract.AbstractText;
                }
            }

            // Clean up abstract text if found
            if (abstractText) {
                abstractText = abstractText.trim()
                    .replace(/\s+/g, ' ')
                    .replace(/<[^>]*>/g, '');
            }
        }

        console.log('Final abstract found:', abstractText ? 'Yes' : 'No');
        
        if (abstractText) {
            abstractContainer.innerHTML = `
                <div class="abstract-section">
                    <h4>Abstract</h4>
                    <p class="abstract-content">${abstractText}</p>
                </div>
            `;
        } else {
            abstractContainer.innerHTML = `
                <div class="no-abstract-content">
                    <p>No abstract available in PubMed database</p>
                    <button onclick="fetchAbstract('${pmid}')" class="fetch-abstract-btn">
                        Try Again
                    </button>
                </div>
            `;
        }
    } catch (error) {
        console.error('Detailed error fetching abstract:', {
            pmid: pmid,
            error: error.message,
            stack: error.stack
        });
        
        const abstractContainer = document.querySelector(`article[data-pmid="${pmid}"] .no-abstract, article[data-pmid="${pmid}"] .abstract-section`);
        if (abstractContainer) {
            abstractContainer.innerHTML = `
                <div class="error-content">
                    <p>Error: ${error.message}</p>
                    <button onclick="fetchAbstract('${pmid}')" class="fetch-abstract-btn">
                        Try Again
                    </button>
                </div>
            `;
        }
    }
}

// Update the extractAbstractText function
function extractAbstractText(result) {
    console.log('Extracting abstract from:', result);
    
    // First, try to get the abstract from the structured response
    if (result.articleids) {
        const pmcid = result.articleids.find(id => id.idtype === 'pmc')?.value;
        const pubmedId = result.articleids.find(id => id.idtype === 'pubmed')?.value;
        if (pmcid || pubmedId) {
            console.log('Found IDs:', { pmcid, pubmedId });
        }
    }

    // Enhanced abstract sources check with proper path traversal
    const abstractSources = [
        // Direct paths
        result.abstract,
        // PMC paths
        result.Article?.Abstract?.AbstractText,
        result.MedlineCitation?.Article?.Abstract?.AbstractText,
        // Structured paths
        Array.isArray(result.structuredabstract) 
            ? result.structuredabstract.map(section => section.text).join('\n')
            : result.structuredabstract,
        // Additional paths based on API response
        result.data?.abstract,
        result.summary,
        // Handle array abstracts
        Array.isArray(result.abstracttext) ? result.abstracttext.join('\n') : result.abstracttext,
        // Fallback paths
        result.description,
        result.snippet
    ];

    // Debug log for available data
    console.log('Available data fields:', Object.keys(result));
    
    // Check each source and log the content if found
    abstractSources.forEach((source, index) => {
        if (source) {
            const preview = typeof source === 'string' 
                ? source.substring(0, 50) + '...' 
                : 'Non-string content';
            console.log(`Abstract source ${index}:`, preview);
        }
    });

    // Try to find a valid abstract text
    const abstractText = abstractSources.find(source => 
        source && 
        typeof source === 'string' && 
        source.trim().length > 10
    );

    if (!abstractText && result.attributes?.includes('Has Abstract')) {
        console.log('Article has abstract but not found in summary. Will try efetch.');
        return null; // Signal to fetchAbstract that we should try efetch
    }

    if (!abstractText) {
        console.warn('No abstract found. Result structure:', JSON.stringify(result, null, 2));
        return '';
    }

    // Clean and return the abstract
    return abstractText.trim()
        .replace(/\s+/g, ' ')
        .replace(/<[^>]*>/g, '');
}



// Helper function to find the path to a value in an object
function getSourcePath(obj, target, path = '') {
    if (obj === target) return path;
    if (obj === null || typeof obj !== 'object') return null;
    
    for (let key in obj) {
        let newPath = path ? `${path}.${key}` : key;
        if (obj[key] === target) return newPath;
        let childPath = getSourcePath(obj[key], target, newPath);
        if (childPath) return childPath;
    }
    return null;
}

// Update the fetchAbstract function
// ... existing code ...

// Remove the duplicate fetchAbstract function (the one near the bottom of the file)
// and keep only this updated version



// Helper function to extract MeSH terms HTML
function extractMeshTermsHtml(result) {
    let meshTermsHtml = '';
    let meshTerms = [];

    // Check all possible field names for MeSH terms
    if (result.meshterms && Array.isArray(result.meshterms)) {
        meshTerms = result.meshterms;
    } else if (result.mesh && Array.isArray(result.mesh)) {
        meshTerms = result.mesh;
    } else if (result.meshheadinglist && Array.isArray(result.meshheadinglist)) {
        // Extract from meshheadinglist if available
        meshTerms = result.meshheadinglist.map(item => 
            typeof item === 'string' ? item : 
            (item.descriptorname ? item.descriptorname : ''));
    } else if (result.meshlist && Array.isArray(result.meshlist)) {
        meshTerms = result.meshlist;
    } else {
        // Look for any property that might contain MeSH terms
        const possibleMeshProps = Object.keys(result).filter(key => 
            Array.isArray(result[key]) && 
            key.toLowerCase().includes('mesh'));
        
        if (possibleMeshProps.length > 0) {
            meshTerms = result[possibleMeshProps[0]];
        }
    }

    // Filter out empty items and generate HTML if we have MeSH terms
    if (meshTerms && meshTerms.length > 0) {
        const validMeshTerms = meshTerms.filter(term => term && typeof term === 'string' && term.trim() !== '');
        if (validMeshTerms.length > 0) {
            meshTermsHtml = `
                <div class="meta-item mesh">
                    <span class="meta-label">MeSH Terms:</span>
                    <span class="meta-content">${validMeshTerms.join(', ')}</span>
                </div>
            `;
        }
    }
    
    return meshTermsHtml;
}

// Updated debug function to explore all possible field names
function debugResultStructure(result) {
    console.log('Debug result structure:');
    console.log('- Title:', result.title ? '✓' : '✗', result.title);
    console.log('- Authors:', result.authors ? '✓' : '✗', 
                 Array.isArray(result.authors) ? `(${result.authors.length} authors)` : typeof result.authors);
    
    // Check for abstract in different possible locations
    console.log('- Abstract:', 
        result.abstract ? '✓ (abstract)' : 
        result.bookabstract ? '✓ (bookabstract)' : 
        result.snippet ? '✓ (snippet)' : 
        result.description ? '✓ (description)' : '✗ Missing');
    
    // Check for keywords in different possible locations
    console.log('- Keywords:', 
        result.keywords ? '✓' : 
        result.keywordlist ? '✓ (keywordlist)' : '✗', 
        Array.isArray(result.keywords) ? `(${result.keywords.length} keywords)` : typeof result.keywords);
    
    // Check for MeSH terms in different possible locations
    console.log('- MeSH Terms:', 
        result.meshterms ? '✓ (meshterms)' : 
        result.mesh ? '✓ (mesh)' : 
        result.meshheadinglist ? '✓ (meshheadinglist)' : 
        result.meshlist ? '✓ (meshlist)' : '✗ Missing');
    
    // Check if DOI exists in articleids
    if (result.articleids && Array.isArray(result.articleids)) {
        const doi = result.articleids.find(id => id.idtype === 'doi');
        console.log('- DOI:', doi ? '✓' : '✗', doi ? doi.value : 'Missing');
    } else {
        console.log('- articleids:', result.articleids ? '✓' : '✗', 
                     Array.isArray(result.articleids) ? `(${result.articleids.length} ids)` : typeof result.articleids);
    }
    
    // Look for any properties containing "abstract" in their name
    const abstractKeys = Object.keys(result).filter(key => 
        key.toLowerCase().includes('abstract') || 
        key.toLowerCase().includes('summary') ||
        key.toLowerCase().includes('snippet'));
    if (abstractKeys.length > 0) {
        console.log('- Potential abstract fields:', abstractKeys);
    }
    
    // Look for any properties containing "mesh" in their name
    const meshKeys = Object.keys(result).filter(key => 
        key.toLowerCase().includes('mesh'));
    if (meshKeys.length > 0) {
        console.log('- Potential MeSH fields:', meshKeys);
    }
    
    // Print all property names for inspection
    console.log('- All properties:', Object.keys(result));
}



document.addEventListener('DOMContentLoaded', function() {
    const searchForm = document.getElementById('searchForm');
    const addTermBtn = document.getElementById('addTerm');
    const searchTerms = document.getElementById('searchTerms');
    const saveConfigBtn = document.getElementById('saveConfig');
    const resultsContainer = document.getElementById('results');
    
    // Initialize global variables for pagination
    let currentResultPage = 1;
    let resultsPerPage = 100; // Changed from const to let
    let lastQuery = '';
    let allResultIds = [];
    let currentResults = [];
    let totalResults = 0;

    // Add new search term row
    addTermBtn.addEventListener('click', function() {
        const newRow = document.createElement('div');
        newRow.className = 'search-row';
        newRow.innerHTML = `
            <select class="operator">
                <option value="AND">AND</option>
                <option value="OR">OR</option>
                <option value="NOT">NOT</option>
            </select>
            <input type="text" class="search-term" placeholder="Enter search terms...">
            <button type="button" class="remove-term">×</button>
        `;
        searchTerms.appendChild(newRow);
    });

    // Remove search term row
    searchTerms.addEventListener('click', function(e) {
        if (e.target.classList.contains('remove-term')) {
            e.target.closest('.search-row').remove();
        }
    });

    // Save search configuration
    saveConfigBtn.addEventListener('click', function() {
        try {
            const config = {
                terms: Array.from(document.querySelectorAll('.search-row')).map(row => ({
                    operator: row.querySelector('.operator').value,
                    term: row.querySelector('.search-term').value
                })),
                dateFrom: document.querySelector('input[name="dateFrom"]').value,
                dateTo: document.querySelector('input[name="dateTo"]').value,
                articleTypes: Array.from(document.querySelectorAll('input[name="articleType"]:checked')).map(cb => cb.value),
                languages: Array.from(document.querySelector('select[name="language"]').selectedOptions).map(opt => opt.value),
                access: document.querySelector('input[name="access"]:checked').value
            };
            localStorage.setItem('pubmedSearchConfig', JSON.stringify(config));
            showMessage('Configuration saved successfully!', 'success');
        } catch (error) {
            console.error('Error saving configuration:', error);
            showMessage('Failed to save configuration', 'error');
        }
    });

    // Handle form submission
    searchForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        // Reset pagination when performing a new search
        currentResultPage = 1;
        
        showLoading(true);
        resultsContainer.innerHTML = ''; // Clear previous results
        
        try {
            const searchTerms = Array.from(document.querySelectorAll('.search-row'))
                .map(row => ({
                    operator: row.querySelector('.operator').value,
                    term: row.querySelector('.search-term').value.trim()
                }));
    
            if (searchTerms.length === 0) {
                throw new Error('Please add at least one search term');
            }
    
            // Collect all filters
            const filters = {
                dateFrom: document.querySelector('input[name="dateFrom"]').value,
                dateTo: document.querySelector('input[name="dateTo"]').value,
                dateRange: document.querySelector('select[name="dateRange"]').value,
                articleTypes: Array.from(document.querySelectorAll('input[name="articleType"]:checked')).map(cb => cb.value),
                languages: Array.from(document.querySelector('select[name="language"]').selectedOptions).map(opt => opt.value),
                access: document.querySelector('input[name="access"]:checked').value
            };
    
            console.log('Search terms:', searchTerms);
            console.log('Filters:', filters);
    
            const query = buildPubMedQuery(searchTerms, filters);
            console.log('PubMed query:', query);
    
            const response = await searchPubMed(query);
            console.log('PubMed response:', response);
    
            if (response && response.results) {
                displayResults(response);
            } else {
                throw new Error('Invalid response from PubMed API');
            }
        } catch (error) {
            console.error('Search error:', error);
            resultsContainer.innerHTML = `
                <div class="error-message">
                    <p>Error: ${error.message}</p>
                </div>
            `;
        } finally {
            showLoading(false);
        }
    });

    // Handle date range selection
    document.querySelector('select[name="dateRange"]').addEventListener('change', function(e) {
        const today = new Date();
        const dateFrom = document.querySelector('input[name="dateFrom"]');
        const dateTo = document.querySelector('input[name="dateTo"]');
        
        switch(e.target.value) {
            case "1":
                dateFrom.value = new Date(today.setFullYear(today.getFullYear() - 1)).toISOString().split('T')[0];
                break;
            case "5":
                dateFrom.value = new Date(today.setFullYear(today.getFullYear() - 5)).toISOString().split('T')[0];
                break;
            case "10":
                dateFrom.value = new Date(today.setFullYear(today.getFullYear() - 10)).toISOString().split('T')[0];
                break;
        }
        dateTo.value = new Date().toISOString().split('T')[0];
    });

    // Build the PubMed query with filters
    function buildPubMedQuery(terms, filters) {
        if (!terms || terms.length === 0) {
            throw new Error('Please enter at least one search term');
        }
        
        let query = terms.map((searchTerm, index) => {
            if (!searchTerm.term.trim()) {
                throw new Error('Search term cannot be empty');
            }
            const operator = index === 0 ? '' : `${searchTerm.operator} `;
            return `${operator}${searchTerm.term}[All Fields]`;
        }).join(' ');
    
        // Add date range filter
        if (filters.dateFrom && filters.dateTo) {
            query += ` AND ("${filters.dateFrom}"[Date - Publication] : "${filters.dateTo}"[Date - Publication])`;
        }
    
        // Add article type filters
        const articleTypes = Array.from(document.querySelectorAll('input[name="articleType"]:checked'))
            .map(cb => `"${cb.value}"[Publication Type]`)
            .join(' OR ');
        if (articleTypes) {
            query += ` AND (${articleTypes})`;
        }
    
        // Add language filter
        const languages = Array.from(document.querySelector('select[name="language"]').selectedOptions)
            .map(opt => `"${opt.value}"[Language]`)
            .join(' OR ');
        if (languages) {
            query += ` AND (${languages})`;
        }
    
        // Add free full text filter
        if (document.querySelector('input[name="access"]:checked').value === 'free') {
            query += ' AND "loattrfree full text"[sb]';
        }
    
        return query;
    }

    // Change results per page
    window.changeResultsPerPage = function(newPerPage) {
        newPerPage = parseInt(newPerPage);
        if (isNaN(newPerPage) || newPerPage === resultsPerPage) return;
        
        console.log('Changing results per page from', resultsPerPage, 'to', newPerPage);
        resultsPerPage = newPerPage;
        currentResultPage = 1; // Reset to first page
        
        if (lastQuery) {
            // Re-run the search with new pagination settings
            searchWithCurrentFilters();
        }
    };
    
    // Go to previous page
    window.previousPage = function() {
        if (currentResultPage <= 1) return;
        
        currentResultPage--;
        console.log('Going to previous page:', currentResultPage);
        searchWithCurrentFilters();
    };
    
    // Go to next page
    window.nextPage = function() {
        if ((currentResultPage * resultsPerPage) >= totalResults) return;
        
        currentResultPage++;
        console.log('Going to next page:', currentResultPage);
        searchWithCurrentFilters();
    };
    
    // Function to search with current filters
    function searchWithCurrentFilters() {
        showLoading(true, 'Loading results...');
        
        // Calculate the required indices
        const startIndex = (currentResultPage - 1) * resultsPerPage;
        const endIndex = Math.min(startIndex + resultsPerPage, totalResults);
        
        console.log(`Loading page ${currentResultPage}, results ${startIndex + 1}-${endIndex} of ${totalResults}`);
        
        // Check if we need to fetch more IDs
        if (startIndex >= allResultIds.length && startIndex < totalResults) {
            console.log("Need to fetch more IDs from PubMed API");
            
            // Determine how many more IDs we need to fetch
            // We'll fetch enough for this page plus some extra for efficiency
            const idsNeeded = Math.min(resultsPerPage * 2, totalResults - allResultIds.length);
            
            // Fetch more IDs starting from where we left off
            fetchMoreIds(lastQuery, allResultIds.length, idsNeeded)
                .then(newIds => {
                    console.log(`Fetched ${newIds.length} additional IDs`);
                    
                    if (newIds.length === 0) {
                        showMessage('Could not retrieve additional results from PubMed', 'error');
                        showLoading(false);
                        return null;
                    }
                    
                    // Add new IDs to our existing list
                    allResultIds = [...allResultIds, ...newIds];
                    
                    // Now get the specific IDs for this page
                    const pageIds = allResultIds.slice(startIndex, Math.min(startIndex + resultsPerPage, allResultIds.length));
                    console.log(`Using ${pageIds.length} IDs for page ${currentResultPage}`);
                    
                    return fetchSummaryData(pageIds);
                })
                .then(results => {
                    if (!results) return;
                    
                    displayResults({
                        results: results,
                        total: totalResults
                    });
                    
                    showLoading(false);
                })
                .catch(error => {
                    console.error("Error fetching additional results:", error);
                    showMessage(`Error: ${error.message}`, 'error');
                    showLoading(false);
                });
        } else if (startIndex >= totalResults) {
            showMessage('No more results available', 'info');
            showLoading(false);
        } else {
            // We have the IDs we need, just fetch the details
            const pageIds = allResultIds.slice(startIndex, Math.min(startIndex + resultsPerPage, allResultIds.length));
            
            console.log(`Using existing IDs to display page ${currentResultPage}`);
            console.log(`IDs for this page:`, pageIds.length);
            
            fetchSummaryData(pageIds)
                .then(results => {
                    displayResults({
                        results: results,
                        total: totalResults
                    });
                    
                    showLoading(false);
                })
                .catch(error => {
                    console.error("Error fetching result details:", error);
                    showMessage(`Error: ${error.message}`, 'error');
                    showLoading(false);
                });
        }
    }
    
    // Modified fetchMoreIds function to handle limited API results
    async function fetchMoreIds(query, startFrom, count) {
        try {
            // Since the API is only returning 20 results at a time regardless of retmax,
            // we'll need to make multiple requests in a loop until we have enough IDs
            let allNewIds = [];
            let batchSize = 20; // The actual number of results the API is returning
            let currentStart = startFrom;
            let remainingCount = count;
            
            console.log(`Need to fetch ${count} more IDs starting from index ${startFrom}`);
            
            // Loop until we have enough IDs or we hit the end of results
            while (allNewIds.length < count) {
                console.log(`Fetching batch of IDs starting at index ${currentStart}`);
                
                const url = `/api/pubmed/search?query=${encodeURIComponent(query)}&retstart=${currentStart}&retmax=${batchSize}`;
                const response = await fetch(url);
                
                if (!response.ok) {
                    throw new Error(`PubMed API error: ${response.status}`);
                }
                
                const data = await response.json();
                
                if (!data.esearchresult || !data.esearchresult.idlist) {
                    throw new Error('Invalid response format from PubMed API');
                }
                
                const newIds = data.esearchresult.idlist;
                console.log(`Received ${newIds.length} IDs in this batch`);
                
                if (newIds.length === 0) {
                    // No more results available
                    console.log('No more results available from the API');
                    break;
                }
                
                // Add the new IDs to our collection
                allNewIds = [...allNewIds, ...newIds];
                
                // Update the starting index for the next request
                currentStart += newIds.length;
                
                // If we've reached the total number of results, stop
                if (currentStart >= totalResults) {
                    console.log(`Reached the total number of results (${totalResults})`);
                    break;
                }
                
                // If we've fetched enough IDs for the current page, stop
                if (allNewIds.length >= count) {
                    console.log(`Fetched enough IDs (${allNewIds.length}) for the current page`);
                    break;
                }
            }
            
            console.log(`Total new IDs fetched: ${allNewIds.length}`);
            return allNewIds;
        } catch (error) {
            console.error("Error fetching more result IDs:", error);
            throw error;
        }
    }

    // Function to fetch summary data for specific IDs
    async function fetchSummaryData(ids) {
        if (!ids || ids.length === 0) return [];
        
        try {
            console.log(`Fetching summary data for ${ids.length} IDs`);
            
            const url = `/api/pubmed/summary?ids=${ids.join(',')}`;
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`PubMed summary API error: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (!data.result) {
                throw new Error('Invalid response format from PubMed summary API');
            }
            
            // Extract the results from the response
            const results = Object.values(data.result).filter(item => item.uid);
            console.log(`Received ${results.length} result details`);
            
            return results;
        } catch (error) {
            console.error("Error fetching summary data:", error);
            throw error;
        }
    }
    
    // Initial search function
    async function searchPubMed(query) {
        if (!query) {
            throw new Error('Invalid search query');
        }
        
        lastQuery = query;
        currentResultPage = 1; // Reset to first page when performing a new search
        
        try {
            console.log(`Performing initial search for query: ${query}`);
            
            // Initial search to get result count and first page of IDs
            const url = `/api/pubmed/search?query=${encodeURIComponent(query)}&retmax=${resultsPerPage}`;
            console.log(`Initial search URL: ${url}`);
            
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`PubMed API error: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (!data.esearchresult || !data.esearchresult.idlist) {
                throw new Error('Invalid response format from PubMed API');
            }
            
            // Store the IDs and total count
            allResultIds = data.esearchresult.idlist;
            totalResults = parseInt(data.esearchresult.count) || 0;
            
            console.log(`Search returned ${totalResults} total results, fetched ${allResultIds.length} IDs`);
            
            if (allResultIds.length === 0) {
                return { results: [], total: 0 };
            }
            
            // Fetch details for the first page
            const results = await fetchSummaryData(allResultIds.slice(0, resultsPerPage));
            
            return {
                results: results,
                total: totalResults
            };
        } catch (error) {
            console.error("Search error:", error);
            throw error;
        }
    }

    // Updated displayResults function
    function displayResults(data) {
        if (!data.results || data.results.length === 0) {
            resultsContainer.innerHTML = '<div class="no-results">No results found</div>';
            return;
        }
    
        // Debug the first result to identify fields
        console.log('First result:', data.results[0]);
        debugResultStructure(data.results[0]);
        
        // Build the HTML for the results page
        const resultsHtml = `
            <div class="results-header">
                <div class="results-count">
                    Found ${data.total.toLocaleString()} results
                </div>
                
                <div class="pagination-controls">
                    <label for="results-per-page">Results per page:</label>
                    <select id="results-per-page" onchange="changeResultsPerPage(this.value)">
                        <option value="10" ${resultsPerPage === 10 ? 'selected' : ''}>10</option>
                        <option value="50" ${resultsPerPage === 50 ? 'selected' : ''}>50</option>
                        <option value="100" ${resultsPerPage === 100 ? 'selected' : ''}>100</option>
                    </select>
                    
                    <div class="page-navigation">
                        <button onclick="previousPage()" ${currentResultPage <= 1 ? 'disabled' : ''}>Previous</button>
                        <span>Page ${currentResultPage}</span>
                        <button onclick="nextPage()" ${((currentResultPage * resultsPerPage) >= data.total) ? 'disabled' : ''}>Next</button>
                    </div>
                </div>
            </div>
            <div class="results-list">
                ${data.results.map(result => {
                    const title = result.title ? result.title.replace(/(<([^>]+)>)/gi, "") : 'No title available';
                    const authorText = formatAuthors(result.authors);
                    const journal = result.fulljournalname || result.source || 'Not specified';
                    const pubDate = result.pubdate || 'Date not specified';
                    const pmid = result.uid || '';
                    
                    return `
                        <article class="result-item" data-pmid="${pmid}">
                            <h3 class="result-title">${title}</h3>
                            
                            <div class="result-meta">
                                <div class="meta-item authors">
                                    <span class="meta-label">Authors:</span>
                                    <span class="meta-content">${authorText}</span>
                                </div>
                                <div class="meta-item journal">
                                    <span class="meta-label">Journal:</span>
                                    <span class="meta-content">${journal}</span>
                                </div>
                                <div class="meta-item date">
                                    <span class="meta-label">Published:</span>
                                    <span class="meta-content">${pubDate}</span>
                                </div>
                                <div class="meta-item pmid">
                                    <span class="meta-label">PMID:</span>
                                    <span class="meta-content">${pmid}</span>
                                </div>
                            </div>
    
                            <div class="no-abstract">
                                <button onclick="fetchAbstract('${pmid}')" class="fetch-abstract-btn">
                                    Fetch Abstract
                                </button>
                            </div>
                        </article>
                    `;
                }).join('')}
            </div>
            <div class="pagination">
                <div class="pagination-info">
                    Showing results ${((currentResultPage - 1) * resultsPerPage) + 1} - ${Math.min(currentResultPage * resultsPerPage, data.total)} of ${data.total}
                </div>
                <div class="pagination-buttons">
                    <button ${currentResultPage <= 1 ? 'disabled' : ''} onclick="previousPage()">Previous</button>
                    <span class="page-indicator">Page ${currentResultPage} of ${Math.ceil(data.total / resultsPerPage)}</span>
                    <button ${((currentResultPage * resultsPerPage) >= data.total) ? 'disabled' : ''} onclick="nextPage()">Next</button>
                </div>
            </div>
        `;
    
        // Insert the HTML into the page
        resultsContainer.innerHTML = resultsHtml;
        
        // Initialize pagination controls
        initializePaginationControls();
    }

    // Function to initialize pagination controls
    function initializePaginationControls() {
        console.log("Initializing pagination controls");
        
        // Set the results per page dropdown to the current value
        const selectElement = document.getElementById('results-per-page');
        if (selectElement) {
            selectElement.value = resultsPerPage.toString();
            
            // Add event listener for changes
            selectElement.addEventListener('change', function() {
                window.changeResultsPerPage(this.value);
            });
        }
        
        // Update the pagination buttons and info
        updatePaginationDisplay();
    }

    // Update pagination display (buttons, info text)
    function updatePaginationDisplay() {
        console.log("Updating pagination display");
        
        // Enable/disable Previous button
        const prevButtons = document.querySelectorAll('[onclick="previousPage()"]');
        prevButtons.forEach(button => {
            button.disabled = (currentResultPage <= 1);
        });
        
        // Enable/disable Next button
        const nextButtons = document.querySelectorAll('[onclick="nextPage()"]');
        nextButtons.forEach(button => {
            button.disabled = ((currentResultPage * resultsPerPage) >= totalResults);
        });
        
        // Update page indicators
        const pageIndicators = document.querySelectorAll('.page-indicator');
        pageIndicators.forEach(indicator => {
            indicator.textContent = `Page ${currentResultPage} of ${Math.ceil(totalResults / resultsPerPage)}`;
        });
        
        // Update results info text
        const paginationInfo = document.querySelector('.pagination-info');
        if (paginationInfo) {
            const start = ((currentResultPage - 1) * resultsPerPage) + 1;
            const end = Math.min(currentResultPage * resultsPerPage, totalResults);
            paginationInfo.textContent = `Showing results ${start} - ${end} of ${totalResults}`;
        }
    }

    // Format authors consistently
    function formatAuthors(authors) {
        if (!authors || !authors.length) return 'Authors not specified';
        
        try {
            // Array to store extracted author names
            let authorNames = [];
            
            // Loop through each author and extract the name regardless of format
            for (let i = 0; i < authors.length; i++) {
                const author = authors[i];
                
                // If author is already a string, use it directly
                if (typeof author === 'string') {
                    authorNames.push(author);
                } 
                // If author is an object with a name property
                else if (author && typeof author === 'object' && author.name) {
                    authorNames.push(author.name);
                }
                // If author is an object with a different structure, try to extract something useful
                else if (author && typeof author === 'object') {
                    if (author.fullname) {
                        authorNames.push(author.fullname);
                    } else if (author.lastname) {
                        const firstName = author.firstname || author.initials || '';
                        authorNames.push(`${author.lastname}${firstName ? ' ' + firstName : ''}`);
                    } else {
                        // Last resort: use a placeholder
                        authorNames.push(`Author ${i+1}`);
                    }
                } else {
                    // Fallback for any other case
                    authorNames.push(`Author ${i+1}`);
                }
            }
            
            // Format author list with "et al." if more than 3 authors
            if (authorNames.length > 3) {
                return `${authorNames.slice(0, 3).join(', ')} et al.`;
            }
            return authorNames.join(', ');
        } catch (error) {
            console.error('Error formatting authors:', error);
            return 'Authors information unavailable';
        }
    }

    // Helper function to show loading indicator
    function showLoading(show, message = 'Searching PubMed...') {
        if (show) {
            resultsContainer.innerHTML = `<div class="loading">${message}</div>`;
        }
    }

    // Helper function to show message
    function showMessage(message, type) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        messageDiv.textContent = message;
        resultsContainer.prepend(messageDiv);
        setTimeout(() => messageDiv.remove(), 5000);
    }

    // Load saved configuration if exists
    const savedConfig = localStorage.getItem('pubmedSearchConfig');
    if (savedConfig) {
        try {
            const config = JSON.parse(savedConfig);
            
            // Apply saved terms
            if (config.terms && config.terms.length > 0) {
                // Clear existing terms except the first one
                while (searchTerms.children.length > 1) {
                    searchTerms.removeChild(searchTerms.lastChild);
                }
                
                // Set the first term
                const firstRow = searchTerms.querySelector('.search-row');
                firstRow.querySelector('.operator').value = config.terms[0].operator;
                firstRow.querySelector('.search-term').value = config.terms[0].term;
                
                // Add the rest of the terms
                for (let i = 1; i < config.terms.length; i++) {
                    const newRow = document.createElement('div');
                    newRow.className = 'search-row';
                    newRow.innerHTML = `
                        <select class="operator">
                            <option value="AND" ${config.terms[i].operator === 'AND' ? 'selected' : ''}>AND</option>
                            <option value="OR" ${config.terms[i].operator === 'OR' ? 'selected' : ''}>OR</option>
                            <option value="NOT" ${config.terms[i].operator === 'NOT' ? 'selected' : ''}>NOT</option>
                        </select>
                        <input type="text" class="search-term" placeholder="Enter search terms..." value="${config.terms[i].term}">
                        <button type="button" class="remove-term">×</button>
                    `;
                    searchTerms.appendChild(newRow);
                }
            }
            
            // Apply other saved filters
            if (config.dateFrom) document.querySelector('input[name="dateFrom"]').value = config.dateFrom;
            if (config.dateTo) document.querySelector('input[name="dateTo"]').value = config.dateTo;
            
            // Apply article types
            if (config.articleTypes) {
                document.querySelectorAll('input[name="articleType"]').forEach(cb => {
                    cb.checked = config.articleTypes.includes(cb.value);
                });
            }
            
            // Apply languages
            if (config.languages) {
                const languageSelect = document.querySelector('select[name="language"]');
                Array.from(languageSelect.options).forEach(opt => {
                    opt.selected = config.languages.includes(opt.value);
                });
            }
            
            // Apply access type
            if (config.access) {
                document.querySelector(`input[name="access"][value="${config.access}"]`).checked = true;
            }
            
            console.log('Loaded saved configuration');
        } catch (error) {
            console.error('Error loading saved configuration:', error);
        }
    }
});

// Updated metadata display function to handle both structures
window.updateDisplayedMetadata = function() {
    const selectedFields = Array.from(document.querySelectorAll('.metadata-checkboxes input:checked'))
        .map(cb => cb.value);
    
    // Always include PMID
    if (!selectedFields.includes('pmid')) {
        selectedFields.push('pmid');
    }
    
    // Check for both old and new structures
    // Old structure (meta-row)
    document.querySelectorAll('.meta-row').forEach(row => {
        const classNames = row.className.split(' ');
        const field = classNames.find(cls => cls !== 'meta-row');
        
        if (field) {
            row.style.display = selectedFields.includes(field) ? 'block' : 'none';
        }
    });
    
    // New structure (meta-item)
    document.querySelectorAll('.meta-item').forEach(item => {
        const classNames = item.className.split(' ');
        const field = classNames.find(cls => cls !== 'meta-item');
        
        if (field) {
            item.style.display = selectedFields.includes(field) ? 'block' : 'none';
        }
    });
};

// New function to toggle abstract with fetch capability
window.toggleAbstractWithFetch = function(button, pmid) {
    const resultItem = button.closest('.result-item');
    const abstractContainer = resultItem.querySelector('.result-abstract-container');
    const abstractContent = resultItem.querySelector('.result-abstract');
    
    if (abstractContainer.style.display === 'none' || !abstractContainer.style.display) {
        // If the abstract is empty or says to fetch it, make an API call
        if (!abstractContent.textContent.trim() || 
            abstractContent.textContent.includes("Click 'Fetch Abstract'")) {
            fetchFullArticleDetails(pmid, abstractContainer, button);
        } else {
            // Just show the existing abstract
            abstractContainer.style.display = 'block';
            button.textContent = 'Hide Abstract';
        }
    } else {
        // Hide the abstract
        abstractContainer.style.display = 'none';
        button.textContent = abstractContent.textContent.trim() ? 'Show Abstract' : 'Fetch Abstract';
    }
};

// Function to fetch full article details including abstract and MeSH terms
async function fetchFullArticleDetails(pmid, container, button) {
    button.textContent = 'Loading...';
    button.disabled = true;
    
    try {
        // Make API call to get full article details
        const response = await fetch(`/api/pubmed/article?id=${pmid}`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch details: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Debug the response
        console.log('Full article details:', data);
        
        // Process the response
        let abstractText = '';
        let meshTermsHtml = '';
        
        // The endpoint might return different data structures
        if (data.result && data.result[pmid]) {
            // If using the esummary endpoint
            abstractText = extractAbstractText(data.result[pmid]);
            meshTermsHtml = extractMeshTermsHtml(data.result[pmid]);
        } else if (data.PubmedArticleSet && data.PubmedArticleSet.PubmedArticle) {
            // If using the efetch endpoint
            abstractText = data.PubmedArticleSet.PubmedArticle.MedlineCitation?.Article?.Abstract?.AbstractText || '';
            
            const meshHeadings = data.PubmedArticleSet.PubmedArticle.MedlineCitation?.MeshHeadingList?.MeshHeading || [];
            if (meshHeadings.length > 0) {
                const meshTerms = meshHeadings.map(heading => heading.DescriptorName || heading.descriptorname || '');
                meshTermsHtml = `
                    <div class="meta-item mesh">
                        <span class="meta-label">MeSH Terms:</span>
                        <span class="meta-content">${meshTerms.join(', ')}</span>
                    </div>
                `;
            }
        } else {
            // Try to extract from whatever structure we have
            abstractText = extractAbstractText(data);
            meshTermsHtml = extractMeshTermsHtml(data);
        }
        
        // Update the abstract container
        if (abstractText) {
            container.querySelector('.result-abstract').textContent = abstractText;
            container.style.display = 'block';
            button.textContent = 'Hide Abstract';
        } else {
            container.querySelector('.result-abstract').textContent = 'No abstract available for this article.';
            container.style.display = 'block';
            button.textContent = 'No Abstract';
        }
        
        // Add MeSH terms if we found any
        if (meshTermsHtml) {
            const resultItem = container.closest('.result-item');
            const metaGroup = resultItem.querySelector('.meta-group');
            
            // Only add if not already present
            if (!resultItem.querySelector('.meta-item.mesh')) {
                metaGroup.insertAdjacentHTML('beforeend', meshTermsHtml);
            }
        }
        
        button.disabled = false;
    } catch (error) {
        console.error('Error fetching article details:', error);
        container.querySelector('.result-abstract').textContent = `Error loading abstract: ${error.message}`;
        container.style.display = 'block';
        button.textContent = 'Error';
        button.disabled = false;
    }
}

// Updated toggle abstract function
window.toggleAbstract = function(button) {
    // Redirect to the new function
    const resultItem = button.closest('.result-item');
    const pmid = resultItem.querySelector('.pmid .meta-content').textContent;
    window.toggleAbstractWithFetch(button, pmid);
};

// Export results functions
window.exportResults = function(format) {
    const results = document.querySelectorAll('.result-item');
    if (!results.length) {
        alert('No results to export');
        return;
    }
    
    let output = '';
    let filename = '';
    let mimeType = '';

    switch (format) {
        case 'csv':
            output = generateCSV(results);
            filename = 'pubmed-results.csv';
            mimeType = 'text/csv';
            break;
        case 'bibtex':
            output = generateBibTeX(results);
            filename = 'pubmed-results.bib';
            mimeType = 'text/plain';
            break;
        case 'ris':
            output = generateRIS(results);
            filename = 'pubmed-results.ris';
            mimeType = 'text/plain';
            break;
    }

    if (output) {
        downloadFile(output, filename, mimeType);
    }
};

// Helper function to generate CSV export
function generateCSV(results) {
    // Get the selected fields from the checkboxes
    const selectedFields = Array.from(document.querySelectorAll('.metadata-checkboxes input:checked'))
        .map(cb => cb.value);
    
    // Generate header row
    const headers = selectedFields.map(field => {
        switch(field) {
            case 'title': return 'Title';
            case 'authors': return 'Authors';
            case 'journal': return 'Journal';
            case 'date': return 'Publication Date';
            case 'doi': return 'DOI';
            case 'pmid': return 'PMID';
            case 'abstract': return 'Abstract';
            case 'keywords': return 'Keywords';
            case 'pubtype': return 'Publication Type';
            case 'mesh': return 'MeSH Terms';
            default: return field.charAt(0).toUpperCase() + field.slice(1);
        }
    });
    
    let csv = headers.join(',') + '\n';
    
    // Process each result
    results.forEach(result => {
        const row = selectedFields.map(field => {
            // Extract content for each field
            let content = '';
            
            if (field === 'title') {
                content = result.querySelector('.result-title')?.textContent || '';
            } else if (field === 'abstract') {
                const abstractElement = result.querySelector('.result-abstract');
                const abstractContainer = result.querySelector('.result-abstract-container');
                
                // Only include the abstract if it's been loaded and is not a placeholder
                if (abstractElement && 
                    abstractContainer.style.display === 'block' && 
                    !abstractElement.textContent.includes("Click 'Fetch Abstract'") && 
                    !abstractElement.textContent.includes('Error loading abstract')) {
                    content = abstractElement.textContent;
                }
            } else {
                // For other fields, look for the meta-content
                const element = result.querySelector(`.${field} .meta-content`);
                
                if (element) {
                    if (field === 'doi' && element.querySelector('a')) {
                        content = element.querySelector('a').textContent;
                    } else {
                        content = element.textContent;
                    }
                }
            }
            
            // Escape double quotes and wrap field in quotes
            return `"${(content || '').replace(/"/g, '""')}"`;
        });
        
        csv += row.join(',') + '\n';
    });
    
    return csv;
}

// Helper function to generate BibTeX export
function generateBibTeX(results) {
    // Get the selected fields
    const showAbstract = document.querySelector('.metadata-checkboxes input[value="abstract"]:checked');
    const showKeywords = document.querySelector('.metadata-checkboxes input[value="keywords"]:checked');
    const showMesh = document.querySelector('.metadata-checkboxes input[value="mesh"]:checked');
    
    let bibtex = '';
    
    results.forEach(result => {
        const pmid = result.querySelector('.pmid .meta-content')?.textContent.trim() || '';
        const title = result.querySelector('.result-title')?.textContent.trim() || '';
        const authors = result.querySelector('.authors .meta-content')?.textContent.trim() || '';
        const journal = result.querySelector('.journal .meta-content')?.textContent.trim() || '';
        const dateText = result.querySelector('.date .meta-content')?.textContent.trim() || '';
        
        // Get DOI if available
        let doi = '';
        const doiElement = result.querySelector('.doi .meta-content a');
        if (doiElement) {
            doi = doiElement.textContent.trim();
        }
        
        // Get abstract if available and selected
        let abstract = '';
        if (showAbstract) {
            const abstractElement = result.querySelector('.result-abstract');
            const abstractContainer = result.querySelector('.result-abstract-container');
            
            if (abstractElement && 
                abstractContainer.style.display === 'block' && 
                !abstractElement.textContent.includes("Click 'Fetch Abstract'") && 
                !abstractElement.textContent.includes('Error loading abstract')) {
                abstract = abstractElement.textContent.trim();
            }
        }
        
        // Get keywords if available and selected
        let keywords = '';
        if (showKeywords) {
            const keywordsElement = result.querySelector('.keywords .meta-content');
            if (keywordsElement) {
                keywords = keywordsElement.textContent.trim();
            }
        }
        
        // Get MeSH terms if available and selected
        let meshTerms = '';
        if (showMesh) {
            const meshElement = result.querySelector('.mesh .meta-content');
            if (meshElement) {
                meshTerms = meshElement.textContent.trim();
            }
        }
        
        // Extract year from date
        let year = '';
        try {
            const dateMatch = dateText.match(/\d{4}/);
            if (dateMatch) {
                year = dateMatch[0];
            } else {
                const date = new Date(dateText);
                if (!isNaN(date.getTime())) {
                    year = date.getFullYear().toString();
                }
            }
        } catch (e) {
            // If date parsing fails, leave year empty
            console.error('Error parsing date:', e);
        }
        
        // Generate BibTeX entry
        bibtex += `@article{PMID${pmid},\n`;
        bibtex += `  title = {${title}},\n`;
        bibtex += `  author = {${authors}},\n`;
        bibtex += `  journal = {${journal}},\n`;
        if (year) bibtex += `  year = {${year}},\n`;
        if (doi) bibtex += `  doi = {${doi}},\n`;
        bibtex += `  pmid = {${pmid}}`;
        
        // Only include abstract if available and selected
        if (abstract) {
            bibtex += `,\n  abstract = {${abstract}}`;
        }
        
        // Only include keywords if available and selected
        if (keywords) {
            bibtex += `,\n  keywords = {${keywords}}`;
        }
        
        // Only include MeSH terms if available and selected
        if (meshTerms) {
            bibtex += `,\n  meshterms = {${meshTerms}}`;
        }
        
        bibtex += `\n}\n\n`;
    });
    
    return bibtex;
}

// Helper function to generate RIS export
function generateRIS(results) {
    // Get the selected fields
    const showAbstract = document.querySelector('.metadata-checkboxes input[value="abstract"]:checked');
    const showKeywords = document.querySelector('.metadata-checkboxes input[value="keywords"]:checked');
    const showMesh = document.querySelector('.metadata-checkboxes input[value="mesh"]:checked');
    
    let ris = '';
    
    results.forEach(result => {
        const title = result.querySelector('.result-title')?.textContent.trim() || '';
        const authorsText = result.querySelector('.authors .meta-content')?.textContent.trim() || '';
        const journal = result.querySelector('.journal .meta-content')?.textContent.trim() || '';
        const dateText = result.querySelector('.date .meta-content')?.textContent.trim() || '';
        const pmid = result.querySelector('.pmid .meta-content')?.textContent.trim() || '';
        
        // Get DOI if available
        let doi = '';
        const doiElement = result.querySelector('.doi .meta-content a');
        if (doiElement) {
            doi = doiElement.textContent.trim();
        }
        
        // Get abstract if available and selected
        let abstract = '';
        if (showAbstract) {
            const abstractElement = result.querySelector('.result-abstract');
            const abstractContainer = result.querySelector('.result-abstract-container');
            
            if (abstractElement && 
                abstractContainer.style.display === 'block' && 
                !abstractElement.textContent.includes("Click 'Fetch Abstract'") && 
                !abstractElement.textContent.includes('Error loading abstract')) {
                abstract = abstractElement.textContent.trim();
            }
        }
        
        // Get keywords if available and selected
        let keywords = '';
        if (showKeywords) {
            const keywordsElement = result.querySelector('.keywords .meta-content');
            if (keywordsElement) {
                keywords = keywordsElement.textContent.trim();
            }
        }
        
        // Get MeSH terms if available and selected
        let meshTerms = '';
        if (showMesh) {
            const meshElement = result.querySelector('.mesh .meta-content');
            if (meshElement) {
                meshTerms = meshElement.textContent.trim();
            }
        }
        
        // Parse authors
        let authors = [];
        if (authorsText.includes(' et al.')) {
            authors = authorsText.replace(' et al.', '').split(', ');
        } else {
            authors = authorsText.split(', ');
        }
        
        // Extract date components
        let year = '', month = '', day = '';
        try {
            // First try to extract year directly from the text
            const yearMatch = dateText.match(/\d{4}/);
            if (yearMatch) {
                year = yearMatch[0];
                
                // Check for a month
                const monthMatch = dateText.match(/Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/i);
                if (monthMatch) {
                    const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
                    const monthIndex = monthNames.indexOf(monthMatch[0].toLowerCase());
                    if (monthIndex !== -1) {
                        month = (monthIndex + 1).toString().padStart(2, '0');
                    }
                    
                    // Check for a day
                    const dayMatch = dateText.match(/\b(\d{1,2})\b/);
                    if (dayMatch) {
                        day = dayMatch[1].padStart(2, '0');
                    }
                }
            } else {
                // Try parsing as a date
                const date = new Date(dateText);
                if (!isNaN(date.getTime())) {
                    year = date.getFullYear().toString();
                    month = (date.getMonth() + 1).toString().padStart(2, '0');
                    day = date.getDate().toString().padStart(2, '0');
                }
            }
        } catch (e) {
            console.error('Error parsing date:', e);
        }
        
        // Generate RIS format
        ris += 'TY  - JOUR\n';
        authors.forEach(author => ris += `AU  - ${author.trim()}\n`);
        ris += `TI  - ${title}\n`;
        ris += `JO  - ${journal}\n`;
        if (year) ris += `PY  - ${year}\n`;
        if (year && month) ris += `DA  - ${year}/${month}${day ? `/${day}` : ''}\n`;
        if (doi) ris += `DO  - ${doi}\n`;
        ris += `AN  - ${pmid}\n`;
        if (abstract) ris += `AB  - ${abstract}\n`;
        if (keywords) ris += `KW  - ${keywords}\n`;
        if (meshTerms) ris += `MH  - ${meshTerms}\n`;
        ris += 'ER  - \n\n';
    });
    
    return ris;
}

// Helper function to download a file
function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type: type });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
}