# BLAST Wrapper Tool Requirements Document

## Project Overview
A lightweight, self-hosted Node.js application that provides a simplified interface to NCBI BLAST services for researchers and scholars, allowing them to perform sequence searches and analyze results through an intuitive web interface.

## Core Requirements

### Functional Requirements

#### Sequence Input
- Text area for direct sequence input in FASTA format
- File upload option for FASTA files
- Sequence validation to ensure proper format
- Sample sequences for quick testing

#### Search Configuration
- BLAST program selection (blastn, blastp, blastx, tblastn, tblastx)
- Database selection (nr, nt, SwissProt, PDB, RefSeq)
- E-value threshold setting
- Word size parameter
- Match/mismatch scores option
- Gap costs configuration

#### Results Display
- Graphical overview of alignments
- Tabular view of hits with sorting capabilities
- Sequence alignment visualization
- Download options (CSV, FASTA, Text)
- Link to NCBI for full result view

#### User Experience
- Job status indication with progress display
- Error handling with meaningful messages
- Responsive design for desktop and tablet use
- History of recent searches within browser session

### Non-Functional Requirements

#### Performance
- Response time < 2 seconds for search submission
- Support for sequences up to 50,000 base pairs
- Handle up to 10 concurrent users

#### Security
- Input sanitization to prevent injection attacks
- Rate limiting to prevent abuse
- No user authentication required (simple public tool)

#### Compliance
- Proper attribution to NCBI BLAST
- Compliance with NCBI API usage policies
- Clear citation information for researchers



## UI Mock-up Ideas

### 

## Citations & Compliance

The tool will include proper citation information:
- Jyotsna NCBI citaction
- BLAST: Altschul SF, et al. (1990) J Mol Biol 215:403-410
- Clear acknowledgment of NCBI as the service provider
- Link to NCBI BLAST terms of service
