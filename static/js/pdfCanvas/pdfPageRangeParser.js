// ===========================================
//  pdfPageRangeParser.js — Range string parsing & phrase query evaluation
// ===========================================

/**
 * Parses user-provided range string (e.g., "3-10, 12-20", "1, 4, 7-9", "odd pages", "even pages")
 * against the total number of pages currently in the document.
 */
export function parsePageRanges(inputStr, totalPages) {
    if (!inputStr || !inputStr.trim()) {
        return { valid: false, pageNumbers: [], pageIndices: [], error: 'Enter page numbers or ranges to remove.' };
    }

    if (!totalPages || totalPages <= 0) {
        return { valid: false, pageNumbers: [], pageIndices: [], error: 'No pages available in document.' };
    }

    const cleaned = inputStr.trim();
    // Split by comma or semicolon
    const tokens = cleaned.split(/[,;]+/).map(t => t.trim()).filter(Boolean);
    if (tokens.length === 0) {
        return { valid: false, pageNumbers: [], pageIndices: [], error: 'Enter valid page numbers or ranges.' };
    }

    const pagesSet = new Set();
    const outOfBounds = [];

    for (const token of tokens) {
        const norm = token.trim().toLowerCase().replace(/[\s\-_]+/g, ' ');

        // Query variation for "Odd pages": e.g. "odd", "odd page", "odd pages", "odds", "all odd pages"
        if (/^(?:all\s+)?odd(?:\s*pages?)?$|^odds$/i.test(norm)) {
            for (let p = 1; p <= totalPages; p += 2) {
                pagesSet.add(p);
            }
            continue;
        }

        // Query variation for "Even pages": e.g. "even", "even page", "even pages", "evens", "all even pages"
        if (/^(?:all\s+)?even(?:\s*pages?)?$|^evens$/i.test(norm)) {
            for (let p = 2; p <= totalPages; p += 2) {
                pagesSet.add(p);
            }
            continue;
        }

        // Query variation for "First page": e.g. "first", "first page", "first pages", "the first page"
        if (/^(?:the\s+)?first(?:\s*pages?)?$|^start$|^beginning$/i.test(norm)) {
            if (totalPages >= 1) {
                pagesSet.add(1);
            }
            continue;
        }

        // Query variation for "Last page": e.g. "last", "last page", "last pages", "the last page", "final"
        if (/^(?:the\s+)?(?:last|final)(?:\s*pages?)?$|^end$/i.test(norm)) {
            if (totalPages >= 1) {
                pagesSet.add(totalPages);
            }
            continue;
        }

        // Range syntax: e.g. "3-10", "3–10", "3—10", or "3 to 10"
        const rangeMatch = token.match(/^(\d+)\s*(?:[-–—]|to)\s*(\d+)$/i);
        if (rangeMatch) {
            let start = parseInt(rangeMatch[1], 10);
            let end = parseInt(rangeMatch[2], 10);
            if (start > end) {
                const tmp = start;
                start = end;
                end = tmp;
            }
            for (let i = start; i <= end; i++) {
                if (i >= 1 && i <= totalPages) {
                    pagesSet.add(i);
                } else {
                    outOfBounds.push(i);
                }
            }
            continue;
        }

        // Single page number: e.g. "5"
        const singleMatch = token.match(/^(\d+)$/);
        if (singleMatch) {
            const pageNum = parseInt(singleMatch[1], 10);
            if (pageNum >= 1 && pageNum <= totalPages) {
                pagesSet.add(pageNum);
            } else {
                outOfBounds.push(pageNum);
            }
            continue;
        }

        // Unrecognized format
        return {
            valid: false,
            pageNumbers: [],
            pageIndices: [],
            error: `Invalid format: "${token}". Enter numbers, ranges (e.g. 3-10), or "odd pages" / "even pages".`
        };
    }

    const sortedPages = Array.from(pagesSet).sort((a, b) => a - b);

    if (sortedPages.length === 0) {
        if (outOfBounds.length > 0) {
            const uniqueOOB = Array.from(new Set(outOfBounds)).sort((a, b) => a - b);
            return {
                valid: false,
                pageNumbers: [],
                pageIndices: [],
                error: `Page ${uniqueOOB.join(', ')} is out of range. Document has ${totalPages} page${totalPages === 1 ? '' : 's'}.`
            };
        }
        return { valid: false, pageNumbers: [], pageIndices: [], error: 'No valid pages found in range.' };
    }

    if (sortedPages.length >= totalPages) {
        return {
            valid: false,
            pageNumbers: sortedPages,
            pageIndices: sortedPages.map(p => p - 1),
            error: `Cannot remove all ${totalPages} pages. The document must keep at least 1 page.`
        };
    }

    let warning = null;
    if (outOfBounds.length > 0) {
        const uniqueOOB = Array.from(new Set(outOfBounds)).sort((a, b) => a - b);
        warning = `Ignored out-of-range page${uniqueOOB.length > 1 ? 's' : ''}: ${uniqueOOB.join(', ')}.`;
    }

    return {
        valid: true,
        pageNumbers: sortedPages,
        pageIndices: sortedPages.map(p => p - 1),
        warning
    };
}

/**
 * Compacts an array of page numbers into a clean readable string (e.g. "3-10, 12-20").
 */
export function formatPageRanges(numbers) {
    if (!numbers || numbers.length === 0) return '';
    const sorted = Array.from(new Set(numbers)).sort((a, b) => a - b);
    const ranges = [];
    let start = sorted[0];
    let end = sorted[0];

    for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] === end + 1) {
            end = sorted[i];
        } else {
            ranges.push(start === end ? `${start}` : `${start}–${end}`);
            start = sorted[i];
            end = sorted[i];
        }
    }
    ranges.push(start === end ? `${start}` : `${start}–${end}`);
    return ranges.join(', ');
}
