# assets.js Intent File

## Purpose
Caching layer between browser.js and data sources (S3 static files and Lambda compute). Manages in-memory cache, parses file formats, and routes requests to appropriate backend.

## Core Responsibilities

### Data Retrieval
- Expose single function `getTracks()` accepting assembly, chr, start, end, track_ids array, window_size
- Return Promise resolving to array of track objects
- Each track object contains track_id and windows array
- Each window contains start, end, value properties
- Window boundaries align across all tracks in single request

### Caching Strategy (Three-tier)
- **Tier 1:** In-memory LRU cache (1GB limit)
- **Tier 2:** Service Worker cache (via sw.js)
- **Tier 3:** Backend fetch (S3 or Lambda)
- Cache key format: `{track_id}_{chr}_{start}_{end}_{window_size}`
- Check tiers sequentially, escalate only if data missing

### Index Management
- Fetch S3 index file once on initialization
- Cache index in memory for session lifetime
- Index structure maps track_id to metadata: `{track_id, type, source, index}`
- source: URI path to file (null for Lambda-computed tracks)
- type: File format identifier (gtf, bedgraph, bed, vcf, etc.) determines which parser to use
- index: URI path to index file if available (null otherwise)

### Request Routing Logic
- If track has `source: null` in index → route to Lambda
- If track has `source: "path/to/file"` → fetch from S3
- Use HTTP Range headers for indexed files
- Send Range request for specific genomic region using index file

### Lambda Integration
- Single Lambda endpoint URL (configured)
- Batch multiple Lambda-required tracks into one request
- Send query string with all getTracks() parameters
- Lambda returns same format as getTracks() (synchronous execution)
- No job_id polling for windowed requests
- Throw error on Lambda failure (no retry)

### File Format Parsing
- **BedGraph:** Parse into windowed numeric values
- **GTF:** Parse into gene objects with nested exon/intron arrays
- Parser selection based on track.type field from index
- Parse on-the-fly as data arrives from S3
- Handle gzipped files transparently
- Throw error for unsupported/unknown file types

### Value Types by Track
- Annotation tracks: value is hierarchical object `{gene, coordinates, exons[], introns[]}`
- Population measures: value is number
- Pairwise measures: value is number
- Missing data: value is null

### Track ID Naming Convention
- Annotation: `hg38_genes`
- Single population: `{population}_{measure}` (e.g., `YRI_het`)
- Pairwise: `{pop1}_{pop2}_{measure}` (e.g., `YRI_CEU_fst`)

### Error Handling
- Throw errors immediately on failure
- No automatic retry logic
- browser.js catches and displays errors to user

### Window Alignment
- All tracks use identical window boundaries for same request
- window_size parameter controls granularity
- Windows span exactly [start, end) of requested region
- No overlapping windows

## Data Flow

### Typical Request Flow
1. browser.js calls `getTracks({assembly, chr, start, end, track_ids, window_size})`
2. assets.js checks in-memory cache for each track_id
3. If cached: return immediately
4. If not cached: check Service Worker cache
5. If not in SW: determine routing from index
6. For S3 sources: fetch with Range header using index file
7. For Lambda sources: batch all Lambda tracks into single request
8. Parse fetched data into window format
9. Store in in-memory cache (LRU, 1GB limit)
10. Return array of track objects to browser.js

### Parser Routing Flow
1. After fetching data from S3, look up track.type from index
2. Route to appropriate parser:
   - type: 'gtf' → parseGTF()
   - type: 'bedgraph' → parseBedGraph()
   - type: 'bed' → parseBed() (future)
   - type: 'vcf' → parseVCF() (future)
3. If type is unknown, throw error
4. Parser returns windows in standard format

### Index Initialization Flow
1. On first getTracks() call, check if index cached in memory
2. If not: fetch index.json from S3
3. Parse and cache in memory for session
4. Use index to route subsequent track requests

### Range Request Flow
1. Check index for track's index file URI
2. If index file exists: parse to find byte offset for region
3. Send Range header: `Range: bytes={start}-{end}`
4. Parse partial file content
5. Convert to windowed format

## Configuration Requirements
- S3 bucket URL (base path)
- Lambda endpoint URL
- Index file path (default: `index.json`)
- Supported file types: gtf, bedgraph (extensible for bed, vcf, etc.)
- In-memory cache limit (default: 1GB)
- Single assembly: hg38 (hard-coded, no multi-assembly support)

## Dependencies
- `/apc/cache.js`: hashKey(), cacheString(), getIDBObject() for Service Worker integration
- `/apc/common.js`: error handling utilities
- sw.js: Service Worker caching layer

## Non-Responsibilities
- assets.js does NOT know semantic meaning of tracks (genes vs measures)
- assets.js does NOT perform genetic computations
- assets.js does NOT manage UI state
- assets.js does NOT validate biological correctness of data
