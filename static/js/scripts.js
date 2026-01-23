import { setupNavToggle } from './nav.js';
import { createProcessingController } from './overlay.js';
import { initImageProcessing } from './imageProcessing.js';
import { initPdfMerge } from './pdfMerge.js';

document.addEventListener('DOMContentLoaded', function () {
    const page = (document.body.getAttribute('data-page') || '').trim();

    const fileInput = document.getElementById('fileInput');
    const uploadArea = document.getElementById('uploadfile');
    const previewImage = document.getElementById('preview');
    const resultImage = document.getElementById('output');
    const downloadBtn = document.getElementById('download-btn');
    const comparisonContainer = document.getElementById('comparison-container');
    const resultContainer = document.getElementById('result');
    const formatSelect = document.getElementById('formatSelect');
    const slideCounterEl = document.getElementById('slide-counter');
    const prevSlideBtn = document.getElementById('prev-slide');
    const nextSlideBtn = document.getElementById('next-slide');
    const slideshowHeader = document.getElementById('slideshow-header');
    const convertAgainBtn = document.getElementById('convert-again-btn');
    const qualitySlider = document.getElementById('qualitySlider');
    const qualityValue = document.getElementById('qualityValue');

    const navbarToggler = document.querySelector('.app-nav-toggle');
    const navbarCollapse = document.getElementById('navbarSupportedContent');
    setupNavToggle(navbarToggler, navbarCollapse);

    const processingOverlay = document.getElementById('processing-overlay');
    const { showProcessing, hideProcessing } = createProcessingController(processingOverlay);

    const sharedProcessing = { showProcessing, hideProcessing };

    if (['BR', 'NR', 'IC', 'FC'].includes(page)) {
        initImageProcessing({
            page,
            fileInput,
            uploadArea,
            previewImage,
            resultImage,
            downloadBtn,
            comparisonContainer,
            resultContainer,
            formatSelect,
            slideCounterEl,
            prevSlideBtn,
            nextSlideBtn,
            slideshowHeader,
            convertAgainBtn,
            qualitySlider,
            qualityValue,
            ...sharedProcessing,
        });
    }

    if (page === 'PDF') {
        initPdfMerge({
            uploadArea,
            fileInput,
            ...sharedProcessing,
        });
    }
});
