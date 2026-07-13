# Plan: Before/After Image Comparison Slider for Compression Tab

## Goal
Replace the current two separate image divs (Original + Compressed stacked vertically) in IC.html with a single draggable comparison slider overlay.

## Strategy
Use a clipped-width approach (not `clip-path`) for maximum browser compatibility and smooth performance:
- Both images absolutely positioned inside a relative container
- "After" (compressed) image sits full-width on the bottom layer
- "Before" (original) image sits on top, wrapped in a clipper div whose `width` is controlled by the slider
- A draggable handle sits at the boundary, capturing pointer events

## Files to Create / Modify

### 1. NEW: `static/css/comparison-slider.css`
Vanilla CSS for the slider component:
- `.img-comp-wrapper` — outer container, `position: relative; overflow: hidden; user-select: none`
- `.img-comp-overlay` — bottom layer (after/compressed), `position: absolute; inset: 0; width: 100%; height: 100%`
- `.img-comp-clipper` — top layer (before/original), `position: absolute; top: 0; left: 0; height: 100%; overflow: hidden; width: 50%` (default split)
- `.img-comp-clipper img` — `display: block; width: 100vw; max-width: none; height: 100%; object-fit: cover` (uses the container as viewport)
- `.img-comp-handle` — vertical line + circle grip, `position: absolute; top: 0; bottom: 0; width: 3px; left: 50%`, with a circular grip button
- Responsive: images use `max-height: 500px` on desktop, `max-height: 350px` on mobile
- Dark-theme handle styling (white/glow)

### 2. MODIFY: `templates/Pages/IC.html`
Replace the preview/result divs with the slider HTML:
```html
<div id="comparison-slider" class="img-comp-wrapper hidden">
  <div class="img-comp-overlay">
    <img id="slider-after" src="" alt="Compressed">
  </div>
  <div class="img-comp-clipper" id="img-clipper">
    <img id="slider-before" src="" alt="Original">
  </div>
  <div class="img-comp-handle" id="img-handle">
    <div class="img-comp-grip"></div>
  </div>
  <!-- Labels -->
  <div class="img-comp-label img-comp-label-before">Original</div>
  <div class="img-comp-label img-comp-label-after">Compressed</div>
</div>
```
Also keep the hidden `#image-preview` and `#result` divs for JS compatibility (data storage), but hide them visually.

### 3. MODIFY: `static/js/imageProcessing.js`
- In `displaySlide()`, for IC page: set `slider-before.src` and `slider-after.src` instead of separate images
- Show `/` hide the comparison slider vs the old layout
- After images load, call `initComparisonSlider()` to attach events

### 4. NEW: `static/js/comparison-slider.js`
Vanilla JS module:
- Export `initComparisonSlider(wrapperEl)` function
- On pointerdown/ touchstart: begin drag
- On pointermove/ touchmove: calc percentage from cursor X relative to wrapper, clamp 5%–95%
- Update clipper width + handle position via inline style (`--split` custom property or direct `style.width`)
- On pointerup/ touchend: stop drag
- Use `pointer-events` (not mouse+touch separate) via `setPointerCapture`
- `prefers-reduced-motion: reduce` → no-op (dragging is user-initiated, motion respects user input)

### 5. MODIFY: `static/css/styles.css`
Add `@import url('comparison-slider.css');`

### 6. MODIFY: `static/js/scripts.js`
Import `{ initComparisonSlider }` from `'./comparison-slider.js'`

## Edge Cases
- Images with different aspect ratios → `object-fit: cover` on both to fill the frame
- Container has no images yet → slider hidden until both srcs are set
- Images not loaded → wait for both `onload` events before initializing dimensions
- Mobile touch → handled by pointer events
- Narrow screens → handle becomes slightly smaller, labels use shorter text

## Implementation Order
1. Create `comparison-slider.css`
2. Create `comparison-slider.js`
3. Modify `IC.html` with new slider HTML, keep old divs as hidden data holders
4. Modify `imageProcessing.js` to drive the slider images
5. Modify `styles.css` import chain
6. Verify drag interaction end-to-end
