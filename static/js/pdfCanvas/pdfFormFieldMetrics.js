// ===========================================
//  pdfFormFieldMetrics.js — Form field metrics calculation and geometric sorting/clustering
// ===========================================

export function getFormFieldMetrics(field, page) {
    const pdfPageHeight = 612 * ((page && page.aspectRatio) || (792 / 612));
    const fieldHeightPt = (field.heightRatio || 0.03) * pdfPageHeight;

    // Dynamically infer font size from field height in PDF points
    const calculatedFontSize = Math.max(8, Math.min(48, Math.round(fieldHeightPt * 0.70)));
    const fontSize = field.inferredFontSize || calculatedFontSize;

    // Vertical centering offset inside the field box
    const fontHeightRatio = (fontSize * 1.15) / pdfPageHeight;
    const topOffsetRatio = Math.max(0, ((field.heightRatio || 0.03) - fontHeightRatio) / 2);

    // Horizontal inset from the left border
    const leftInsetRatio = Math.min(0.005, (field.widthRatio || 0.1) * 0.04);

    return {
        fontSize,
        xRatio: field.leftRatio + leftInsetRatio,
        yRatio: field.topRatio + topOffsetRatio
    };
}

export function getSortedFormFields(page) {
    if (!page || !page.formFields || page.formFields.length === 0) return [];

    const fields = [...page.formFields];
    if (fields.length === 1) return fields;

    // 1. Sort all fields by topRatio first, then leftRatio
    fields.sort((a, b) => (a.topRatio - b.topRatio) || (a.leftRatio - b.leftRatio));

    // 2. Cluster fields into distinct horizontal rows
    const rows = [];

    fields.forEach(field => {
        const fLeft = field.leftRatio;
        const fWidth = field.widthRatio || 0.05;
        const fRight = fLeft + fWidth;
        const fTop = field.topRatio;
        const fHeight = field.heightRatio || 0.03;
        const fBottom = fTop + fHeight;
        const fCenterY = fTop + fHeight / 2;

        let matchedRow = null;

        for (const row of rows) {
            // Rule A: Two fields in the same row CANNOT horizontally overlap significantly
            let hasHorizOverlap = false;
            for (const existing of row.fields) {
                const eLeft = existing.leftRatio;
                const eWidth = existing.widthRatio || 0.05;
                const eRight = eLeft + eWidth;
                const horizOverlap = Math.max(0, Math.min(fRight, eRight) - Math.max(fLeft, eLeft));
                const minW = Math.min(fWidth, eWidth);

                if (horizOverlap > minW * 0.25) {
                    hasHorizOverlap = true;
                    break;
                }
            }
            if (hasHorizOverlap) continue; // Stacked fields belong in different rows

            // Rule B: Field must vertically align with this row
            const rowHeight = row.bottom - row.top;
            const vertOverlap = Math.max(0, Math.min(fBottom, row.bottom) - Math.max(fTop, row.top));
            const minH = Math.min(fHeight, rowHeight);
            const centerDiff = Math.abs(fCenterY - row.center);
            const vertThreshold = Math.max(0.008, minH * 0.5);

            if (vertOverlap >= minH * 0.35 || centerDiff <= vertThreshold) {
                matchedRow = row;
                break;
            }
        }

        if (matchedRow) {
            matchedRow.fields.push(field);
            matchedRow.top = Math.min(matchedRow.top, fTop);
            matchedRow.bottom = Math.max(matchedRow.bottom, fBottom);
            matchedRow.center = (matchedRow.top + matchedRow.bottom) / 2;
        } else {
            rows.push({
                top: fTop,
                bottom: fBottom,
                center: fCenterY,
                fields: [field]
            });
        }
    });

    // 3. Sort rows top to bottom by vertical center
    rows.sort((a, b) => (a.center - b.center) || (a.top - b.top));

    // 4. Within each row, sort fields strictly left to right
    const sorted = [];
    rows.forEach(row => {
        row.fields.sort((a, b) => (a.leftRatio - b.leftRatio) || (a.topRatio - b.topRatio));
        sorted.push(...row.fields);
    });

    return sorted;
}

export function findAnnotationForField(page, field) {
    if (!page || !page.layers || !field) return null;

    // 1. Exact match by field ID
    if (field.id) {
        const byId = page.layers.find(l => l.type === 'annotation' && l.fieldId === field.id);
        if (byId) return byId;
    }

    // 2. Strict bounding box containment (for unlinked annotations)
    const fLeft = field.leftRatio;
    const fTop = field.topRatio;
    const fRight = fLeft + (field.widthRatio || 0.05);
    const fBottom = fTop + (field.heightRatio || 0.03);

    const inside = page.layers.filter(l =>
        l.type === 'annotation' &&
        !l.fieldId &&
        l.xRatio >= fLeft - 0.005 &&
        l.xRatio <= fRight + 0.005 &&
        l.yRatio >= fTop - 0.005 &&
        l.yRatio <= fBottom + 0.005
    );

    if (inside.length > 0) {
        inside.sort((a, b) => {
            const da = Math.hypot(a.xRatio - fLeft, a.yRatio - fTop);
            const db = Math.hypot(b.xRatio - fLeft, b.yRatio - fTop);
            return da - db;
        });
        const matched = inside[0];
        matched.fieldId = field.id;
        matched.isFormField = true;
        return matched;
    }

    return null;
}
