/**
 * Pastel Design Studio - Main Logic
 */

/* --- CONSTANTS & CONFIG --- */
const CONFIG = {
    CANVAS_WIDTH: 800,
    CANVAS_HEIGHT: 600,
    DEFAULT_COLOR: "#a855f7", // Purple-500
    DEFAULT_RECT_W: 150,
    DEFAULT_RECT_H: 100,
    DEFAULT_TEXT: "New Text",
    MIN_SIZE: 20
};

/* --- STATE MANAGEMENT --- */
const appState = {
    elements: [],
    selectedId: null,
    activeTool: 'select', // 'select' | 'rectangle' | 'text'

    // Interaction State
    isDragging: false,
    isResizing: false,
    isRotating: false,

    // Interaction Data
    dragStart: { x: 0, y: 0 },
    resizeHandle: null,
    initialElProps: null,

    // Zoom State
    zoom: 1
};

// DOM Elements Cache
const dom = {
    artboard: document.getElementById('artboard'),
    propertiesForm: document.getElementById('properties-form'),
    emptyState: document.getElementById('no-selection-msg'),
    // Properties
    inputs: {
        x: document.getElementById('prop-x'),
        y: document.getElementById('prop-y'),
        w: document.getElementById('prop-w'),
        h: document.getElementById('prop-h'),
        rot: document.getElementById('prop-rotation'),
        rotDisplay: document.getElementById('prop-rotation-display'),
        color: document.getElementById('prop-color'),
        colorHex: document.getElementById('prop-color-hex'),
        colorPreview: document.getElementById('prop-color-preview'),
        text: document.getElementById('prop-text-content'),
        type: document.getElementById('prop-type-display'),
        textContainer: document.getElementById('prop-text-container')
    },
    // Layers
    layersList: document.getElementById('layers-list'),
    // Tools
    tools: {
        select: document.getElementById('tool-select'),
        rectangle: document.getElementById('tool-rectangle'),
        text: document.getElementById('tool-text'),
        circle: document.getElementById('tool-circle')
    },
    // Theme
    themeToggle: document.getElementById('theme-toggle'),
    themeIcon: document.getElementById('theme-icon'),
    // Actions
    btnExportJson: document.getElementById('btn-export-json'),
    btnExportHtml: document.getElementById('btn-export-html'),
    btnClear: document.getElementById('btn-clear-canvas'),
    // Zoom
    btnZoomIn: document.getElementById('btn-zoom-in'),
    btnZoomOut: document.getElementById('btn-zoom-out'),
    zoomDisplay: document.getElementById('zoom-level')
};

/* --- INITIALIZATION --- */
function init() {
    loadFromStorage();
    setupEventListeners();
    setupHotkeys();
    setupTheme();
    renderAll();
}

/* --- STATE MUTATIONS --- */

function createElement(type, x, y) {
    const id = 'el_' + Date.now();
    const isText = type === 'text';

    const newEl = {
        id: id,
        type: type,
        x: x || 100,
        y: y || 100,
        width: isText ? 200 : CONFIG.DEFAULT_RECT_W,
        height: isText ? 60 : CONFIG.DEFAULT_RECT_H,
        rotation: 0,
        backgroundColor: isText ? 'transparent' : CONFIG.DEFAULT_COLOR,
        content: isText ? CONFIG.DEFAULT_TEXT : '',
        zIndex: appState.elements.length + 1,
        fontSize: 16,
        color: '#475569' // slate-600
    };

    appState.elements.push(newEl);
    selectElement(id);
    renderAll();
}

function updateElement(id, updates) {
    const el = appState.elements.find(e => e.id === id);
    if (!el) return;

    Object.assign(el, updates);
    updateDOMElement(el);

    if (appState.selectedId === id) {
        syncPropertiesPanel();
        // If name/content changes, we might need to update layer list text
        if (updates.content || updates.type) renderLayers();
    }
}

function selectElement(id) {
    if (appState.selectedId === id) return;
    appState.selectedId = id;
    renderSelection();
    renderLayers();
    syncPropertiesPanel();
}

function deleteSelected() {
    if (!appState.selectedId) return;
    appState.elements = appState.elements.filter(e => e.id !== appState.selectedId);
    appState.selectedId = null;
    renderAll();
}

function clearCanvas() {
    if (confirm('Are you sure you want to clear the canvas?')) {
        appState.elements = [];
        appState.selectedId = null;
        renderAll();
    }
}

/* --- RENDERING --- */

function renderAll() {
    // Sort by z-index
    const sorted = [...appState.elements].sort((a, b) => a.zIndex - b.zIndex);

    dom.artboard.innerHTML = ''; // Clear

    sorted.forEach(el => {
        const div = createDOMElement(el);
        dom.artboard.appendChild(div);
    });

    renderSelection(); // Re-apply handles if selection exists
    renderLayers();
    saveToStorage();
}

function createDOMElement(elData) {
    const div = document.createElement('div');
    div.id = elData.id;
    div.className = `element ${elData.type === 'text' ? 'text-element' : ''}`;
    div.dataset.id = elData.id;

    // Apply Styles
    div.style.transform = `translate(${elData.x}px, ${elData.y}px) rotate(${elData.rotation}deg)`;
    div.style.width = `${elData.width}px`;
    div.style.height = `${elData.height}px`;
    div.style.zIndex = elData.zIndex;

    if (elData.type === 'rectangle') {
        div.style.backgroundColor = elData.backgroundColor;
        div.style.borderRadius = '16px';
    } else if (elData.type === 'text') {
        div.style.display = 'flex';
        div.style.alignItems = 'center';
        div.innerText = elData.content;
        div.style.fontSize = `${elData.fontSize}px`;
        div.style.color = elData.color;
    }

    return div;
}

function updateDOMElement(elData) {
    const div = document.getElementById(elData.id);
    if (!div) return;

    div.style.transform = `translate(${elData.x}px, ${elData.y}px) rotate(${elData.rotation}deg)`;
    div.style.width = `${elData.width}px`;
    div.style.height = `${elData.height}px`;

    if (elData.type === 'rectangle') {
        div.style.backgroundColor = elData.backgroundColor;
    } else {
        div.innerText = elData.content;
        div.style.color = elData.color;
    }
}

function renderSelection() {
    // Remove old handles
    document.querySelectorAll('.resize-handle, .rotate-handle, .rotate-stick').forEach(e => e.remove());
    document.querySelectorAll('.element.selected').forEach(e => e.classList.remove('selected'));

    if (!appState.selectedId) {
        dom.emptyState.classList.remove('hidden');
        dom.propertiesForm.classList.add('hidden');
        return;
    }

    const div = document.getElementById(appState.selectedId);
    if (!div) return; // Should not happen if sync is correct

    div.classList.add('selected');

    // Add Handles
    const handlesHTML = `
        <div class="rotate-stick"></div>
        <div class="rotate-handle" data-handle="rotate"></div>
        <div class="resize-handle handle-nw" data-handle="nw"></div>
        <div class="resize-handle handle-ne" data-handle="ne"></div>
        <div class="resize-handle handle-sw" data-handle="sw"></div>
        <div class="resize-handle handle-se" data-handle="se"></div>
    `;
    div.insertAdjacentHTML('beforeend', handlesHTML);

    dom.emptyState.classList.add('hidden');
    dom.propertiesForm.classList.remove('hidden');
}

function renderLayers() {
    dom.layersList.innerHTML = '';
    // Reverse for list display (Top layer first)
    const sorted = [...appState.elements].sort((a, b) => b.zIndex - a.zIndex);

    sorted.forEach(el => {
        const isSelected = el.id === appState.selectedId;
        const icon = el.type === 'rectangle' ? 'solar:gallery-wide-linear' : 'solar:text-field-linear';
        const name = el.type === 'rectangle' ? 'Rectangle' : (el.content.substring(0, 15) || 'Text Layer');

        // Tailwind styling for layer item
        const activeClass = isSelected
            ? 'bg-purple-50 dark:bg-purple-500/10 border-purple-100 dark:border-purple-500/20'
            : 'hover:bg-slate-50 dark:hover:bg-white/5 border-transparent hover:border-slate-100 dark:hover:border-white/5';

        const textClass = isSelected
            ? 'text-purple-700 dark:text-purple-200'
            : 'text-slate-600 dark:text-neutral-400';

        const iconContainerClass = isSelected
            ? 'text-purple-500 dark:text-purple-300 bg-white dark:bg-purple-500/20'
            : 'text-slate-400 dark:text-neutral-500 bg-slate-100 dark:bg-white/5';

        const itemHTML = `
            <div data-id="${el.id}" class="group flex items-center gap-2 p-2 rounded-xl border cursor-pointer transition-all mb-1 ${activeClass}">
                <div class="${isSelected ? 'text-purple-400' : 'text-slate-300 dark:text-neutral-600'} cursor-grab hidden lg:block">
                    <iconify-icon icon="solar:menu-dots-linear" width="14"></iconify-icon>
                </div>
                <div class="${iconContainerClass} p-1 rounded-lg shadow-sm">
                    <iconify-icon icon="${icon}" width="14"></iconify-icon>
                </div>
                <span class="text-sm font-medium flex-1 truncate hidden lg:block ${textClass}">${name}</span>
                <button onclick="deleteSelected()" class="${isSelected ? 'text-purple-400 hover:text-purple-600' : 'text-slate-300 dark:text-neutral-600 hover:text-slate-500'} hidden lg:block" title="Delete">
                    <iconify-icon icon="solar:trash-bin-trash-linear" width="16"></iconify-icon>
                </button>
            </div>
        `;

        // Create container to attach event easily
        const divWrapper = document.createElement('div');
        divWrapper.innerHTML = itemHTML;
        const itemDiv = divWrapper.firstElementChild;

        itemDiv.addEventListener('click', (e) => {
            // Prevent triggering if deleting
            if (!e.target.closest('button')) {
                selectElement(el.id);
            }
        });

        dom.layersList.appendChild(itemDiv);
    });
}

function syncPropertiesPanel() {
    const el = appState.elements.find(e => e.id === appState.selectedId);
    if (!el) return;

    const ui = dom.inputs;
    ui.x.value = Math.round(el.x);
    ui.y.value = Math.round(el.y);
    ui.w.value = Math.round(el.width);
    ui.h.value = Math.round(el.height);
    ui.rot.value = Math.round(el.rotation);
    if (ui.rotDisplay) ui.rotDisplay.innerText = Math.round(el.rotation) + '°';

    ui.type.innerText = el.type === 'rectangle' ? 'Rectangle' : 'Text';

    let colorVal = el.backgroundColor;
    if (el.type === 'text') {
        colorVal = el.color;
        ui.textContainer.classList.remove('hidden');
        ui.text.value = el.content;
    } else {
        ui.textContainer.classList.add('hidden');
    }

    if (colorVal === 'transparent') colorVal = '#ffffff'; // Fallback for color picker
    // Simple hex check for input
    if (!colorVal.startsWith('#')) {
        // Simple named colors to hex map could go here, or just ignore
    } else {
        ui.color.value = colorVal;
        ui.colorHex.value = colorVal.toUpperCase();
        ui.colorPreview.style.backgroundColor = colorVal;
    }
}

/* --- EVENT HANDLERS --- */

function setupEventListeners() {
    // Toolbar
    dom.tools.select.onclick = () => setTool('select');
    dom.tools.rectangle.onclick = () => setTool('rectangle');
    dom.tools.text.onclick = () => setTool('text');
    if (dom.tools.circle) dom.tools.circle.onclick = () => alert("Circle tool coming soon!");

    // Actions
    dom.btnExportJson.onclick = exportJSON;
    dom.btnExportHtml.onclick = exportHTML;
    dom.btnClear.onclick = clearCanvas;

    // Zoom
    dom.btnZoomIn.onclick = () => updateZoom(0.1);
    dom.btnZoomOut.onclick = () => updateZoom(-0.1);

    // Canvas Interactions
    dom.artboard.addEventListener('mousedown', onCanvasMouseDown);
    window.addEventListener('mousemove', onGlobalMouseMove);
    window.addEventListener('mouseup', onGlobalMouseUp);

    // Properties Inputs
    const numericInputs = ['x', 'y', 'w', 'h', 'rot'];
    numericInputs.forEach(key => {
        dom.inputs[key].addEventListener('input', (e) => {
            if (!appState.selectedId) return;
            let val = parseInt(e.target.value);

            const updates = {};
            if (key === 'x') updates.x = val;
            if (key === 'y') updates.y = val;
            if (key === 'w') updates.width = Math.max(CONFIG.MIN_SIZE, val);
            if (key === 'h') updates.height = Math.max(CONFIG.MIN_SIZE, val);
            if (key === 'rot') updates.rotation = val % 360;

            updateElement(appState.selectedId, updates);
        });
    });

    // Color
    dom.inputs.color.addEventListener('input', (e) => {
        if (!appState.selectedId) return;
        const col = e.target.value;
        const el = appState.elements.find(x => x.id === appState.selectedId);

        if (el.type === 'rectangle') updateElement(el.id, { backgroundColor: col });
        else updateElement(el.id, { color: col });

        dom.inputs.colorHex.value = col.toUpperCase();
        dom.inputs.colorPreview.style.backgroundColor = col;
    });

    dom.inputs.text.addEventListener('input', (e) => {
        if (!appState.selectedId) return;
        updateElement(appState.selectedId, { content: e.target.value });
    });

    // Layer Move
    const btnUp = document.getElementById('layer-up');
    const btnDown = document.getElementById('layer-down');
    if (btnUp) btnUp.onclick = () => moveLayer(1);
    if (btnDown) btnDown.onclick = () => moveLayer(-1);
}

function setupTheme() {
    const html = document.documentElement;
    // Check local storage or system preference
    if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        html.classList.add('dark');
        updateThemeIcon(true);
    } else {
        html.classList.remove('dark');
        updateThemeIcon(false);
    }

    dom.themeToggle.addEventListener('click', () => {
        html.classList.toggle('dark');
        const isDark = html.classList.contains('dark');
        localStorage.theme = isDark ? 'dark' : 'light';
        updateThemeIcon(isDark);
    });
}

function updateThemeIcon(isDark) {
    if (!dom.themeIcon) return;
    dom.themeIcon.setAttribute('icon', isDark ? 'solar:sun-linear' : 'solar:moon-linear');
}

function setTool(tool) {
    appState.activeTool = tool;

    // reset UI styles for tools
    // We are selecting by ID now, visual feedback is tailored in CSS if we added .active class support to buttons
    // The provided HTML doesn't have built-in active state styles for buttons other than hover, 
    // but we can manually toggle a class or bg color.
    // For now, simple cursor change.
    dom.artboard.style.cursor = tool === 'select' ? 'default' : 'crosshair';
}

/* --- MOUSE INTERACTION LOGIC --- */
// (Mostly same as before, adapted for new context if needed)

function onCanvasMouseDown(e) {
    if (e.target.closest('.resize-handle') || e.target.closest('.rotate-handle')) {
        e.preventDefault();
        startInteraction(e, e.target);
        return;
    }

    const clickedEl = e.target.closest('.element');

    // Creation Mode
    if (appState.activeTool !== 'select') {
        const rect = dom.artboard.getBoundingClientRect();
        // Adjust for pan/zoom if we had it, but we don't.
        // Simple offset calculation
        let x = e.clientX - rect.left;
        let y = e.clientY - rect.top;

        // Center the new shape on click?
        if (appState.activeTool === 'rectangle') {
            x -= CONFIG.DEFAULT_RECT_W / 2;
            y -= CONFIG.DEFAULT_RECT_H / 2;
        }

        createElement(appState.activeTool, x, y);
        setTool('select');
        return;
    }

    // Selection Mode
    if (clickedEl) {
        selectElement(clickedEl.dataset.id);
        startDrag(e, clickedEl.dataset.id);
    } else {
        appState.selectedId = null;
        renderAll();
    }
}

function startInteraction(e, handle) {
    appState.isResizing = handle.classList.contains('resize-handle');
    appState.isRotating = handle.classList.contains('rotate-handle');
    appState.resizeHandle = handle.dataset.handle;

    const el = appState.elements.find(x => x.id === appState.selectedId);
    if (!el) return;

    appState.dragStart = { x: e.clientX, y: e.clientY };
    appState.initialElProps = { ...el };
}

function startDrag(e, id) {
    appState.isDragging = true;
    appState.dragStart = { x: e.clientX, y: e.clientY };
    const el = appState.elements.find(x => x.id === id);
    appState.initialElProps = { ...el };
}

function onGlobalMouseMove(e) {
    if (!appState.selectedId) return;
    const el = appState.elements.find(x => x.id === appState.selectedId);

    if (appState.isDragging) {
        const dx = e.clientX - appState.dragStart.x;
        const dy = e.clientY - appState.dragStart.y;

        updateElement(el.id, {
            x: appState.initialElProps.x + dx,
            y: appState.initialElProps.y + dy
        });
    }
    else if (appState.isResizing) {
        handleResize(e, el);
    }
    else if (appState.isRotating) {
        handleRotate(e, el);
    }
}

function handleResize(e, el) {
    const dx = e.clientX - appState.dragStart.x;
    const dy = e.clientY - appState.dragStart.y;

    // Simple non-rotated resize logic for now
    // (Improving this would require matrix math for rotated resizing)
    const init = appState.initialElProps;
    let newW = init.width;
    let newH = init.height;

    if (appState.resizeHandle.includes('e')) newW = init.width + dx;
    if (appState.resizeHandle.includes('w')) newW = init.width - dx; // This doesn't shift x, so it grows right. 
    // (Improved resize requires shifting x/y when resizing from left/top)

    if (appState.resizeHandle.includes('s')) newH = init.height + dy;
    if (appState.resizeHandle.includes('n')) newH = init.height - dy;

    updateElement(el.id, {
        width: Math.max(CONFIG.MIN_SIZE, newW),
        height: Math.max(CONFIG.MIN_SIZE, newH)
    });
}

function handleRotate(e, el) {
    const rect = dom.artboard.getBoundingClientRect();
    const cx = rect.left + el.x + el.width / 2;
    const cy = rect.top + el.y + el.height / 2;

    const angleRad = Math.atan2(e.clientY - cy, e.clientX - cx);
    let angleDeg = angleRad * (180 / Math.PI) + 90;

    updateElement(el.id, { rotation: angleDeg });
}

function onGlobalMouseUp() {
    appState.isDragging = false;
    appState.isResizing = false;
    appState.isRotating = false;
    saveToStorage();
}

/* --- UTILS --- */

function setupHotkeys() {
    window.addEventListener('keydown', (e) => {
        if (!appState.selectedId) return;
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
            deleteSelected();
        }
    });
}

function moveLayer(dir) {
    if (!appState.selectedId) return;

    // Sort logic same as before...
    appState.elements.sort((a, b) => a.zIndex - b.zIndex);
    const idx = appState.elements.findIndex(e => e.id === appState.selectedId);
    const newIdx = idx + dir;

    if (newIdx < 0 || newIdx >= appState.elements.length) return;

    // Swap
    [appState.elements[idx], appState.elements[newIdx]] = [appState.elements[newIdx], appState.elements[idx]];

    // Reassign Z
    appState.elements.forEach((el, i) => el.zIndex = i + 1);

    renderAll();
}

function saveToStorage() {
    localStorage.setItem('pastel_design_elements', JSON.stringify(appState.elements));
}

function loadFromStorage() {
    const data = localStorage.getItem('pastel_design_elements');
    if (data) {
        try { appState.elements = JSON.parse(data); } catch (e) { }
    }
}

function updateZoom(delta) {
    let newZoom = appState.zoom + delta;
    // Clamp zoom between 0.2 and 3.0
    newZoom = Math.min(Math.max(newZoom, 0.2), 3.0);
    appState.zoom = newZoom;

    dom.zoomDisplay.innerText = Math.round(newZoom * 100) + '%';
    dom.artboard.style.transform = `scale(${newZoom})`;
    // Adjust transform origin if needed, usually center for artboards in this style
    // dom.artboard is centered in flex container, scale center should work
}

function exportJSON() {
    const str = JSON.stringify(appState.elements, null, 2);
    const blob = new Blob([str], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'design.json';
    a.click();
}

function exportHTML() {
    // Generate a standalone HTML representation
    const styles = `
        body { margin:0; display:flex; justify-content:center; align-items:center; min-height:100vh; background:#f8fafc; font-family: sans-serif; }
        .artboard { position:relative; width:800px; height:600px; background:white; overflow:hidden; border-radius:24px; box-shadow:0 20px 50px rgba(0,0,0,0.1); }
        .element { position:absolute; display:flex; align-items:center; justify-content:center; box-sizing:border-box; }
    `;

    let domContent = '';
    [...appState.elements].sort((a, b) => a.zIndex - b.zIndex).forEach(el => {
        let style = `left:${el.x}px; top:${el.y}px; width:${el.width}px; height:${el.height}px; transform:rotate(${el.rotation}deg); z-index:${el.zIndex};`;
        let content = '';

        if (el.type === 'rectangle') {
            style += ` background:${el.backgroundColor}; border-radius:16px;`;
        } else {
            style += ` color:${el.color}; font-size:${el.fontSize}px; white-space: pre-wrap;`;
            content = el.content;
        }

        domContent += `<div class="element" style="${style}">${content}</div>`;
    });

    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Pastel Export</title>
    <style>${styles}</style>
</head>
<body>
    <div class="artboard">
        ${domContent}
    </div>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'design_export.html';
    a.click();
}

// Start
init();
