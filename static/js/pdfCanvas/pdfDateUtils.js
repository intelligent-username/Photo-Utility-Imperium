// ===========================================
//  pdfDateUtils.js — Date formatting and contrast color calculation helpers
// ===========================================

export function getContrastBgColor(hexColor) {
    let r = 0, g = 0, b = 0;
    if (hexColor && hexColor.startsWith('#')) {
        const hex = hexColor.slice(1);
        if (hex.length === 3) {
            r = parseInt(hex[0] + hex[0], 16);
            g = parseInt(hex[1] + hex[1], 16);
            b = parseInt(hex[2] + hex[2], 16);
        } else if (hex.length === 6) {
            r = parseInt(hex.slice(0, 2), 16);
            g = parseInt(hex.slice(2, 4), 16);
            b = parseInt(hex.slice(4, 6), 16);
        }
    }
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    if (brightness < 130) {
        return { bg: 'rgba(238, 240, 243, 0.96)', border: 'rgba(0, 0, 0, 0.25)' };
    } else {
        return { bg: 'rgba(30, 30, 30, 0.95)', border: 'rgba(255, 255, 255, 0.3)' };
    }
}

function getOrdinal(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function formatDate(format) {
    const d = new Date();
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const day = d.getDate();
    const monthIdx = d.getMonth();
    const year = d.getFullYear();
    const mm = String(monthIdx + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');

    switch (format) {
        case 'words-short':
            return `${monthsShort[monthIdx]}. ${getOrdinal(day)}, ${year}`;
        case 'words-full':
        case 'words-long':
            return `${months[monthIdx]} ${getOrdinal(day)}, ${year}`;
        case 'numbers-us':
        case 'numeric-slash':
            return `${mm}/${dd}/${year}`;
        case 'numbers-eu':
            return `${dd}/${mm}/${year}`;
        case 'numeric-dash':
            return `${year}-${mm}-${dd}`;
        case 'numeric-dot':
            return `${dd}.${mm}.${year}`;
        default:
            return `${monthsShort[monthIdx]}. ${getOrdinal(day)}, ${year}`;
    }
}
