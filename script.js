// ----------------------
// Get references to HTML elements
// ----------------------
const fileInput = document.getElementById("fileInput"); // file input for PDF
const container = document.getElementById("canvasContainer"); // container for PDF pages

// ----------------------
// Global variables
// ----------------------
let loadedPDF = null; // store the loaded PDF object
let popupShown = false; // tracks if the "apply all margins" popup has been shown
let lastDraggedMargins = null; // store last manually adjusted margins (left & right)

// ----------------------
// File input change event
// ----------------------
fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0]; // get selected file
  if (!file) return; // exit if no file selected

  const reader = new FileReader(); // create a FileReader
  reader.onload = async () => {
    const pdfData = new Uint8Array(reader.result); // read file as Uint8Array
    const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise; // load PDF using pdfjs
    loadedPDF = pdf; // store globally

    container.innerHTML = ""; // clear previous content

    // Loop through all PDF pages
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum); // get page
      const viewport = page.getViewport({ scale: 1.5 }); // set zoom/scale

      // Create canvas to render page
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      // Render PDF page on canvas
      await page.render({ canvasContext: ctx, viewport }).promise;

      // Wrapper div for canvas and overlays
      const wrapper = document.createElement("div");
      wrapper.className = "canvasWrapper";
      wrapper.dataset.page = pageNum; // store page number
      wrapper.style.position = "relative";
      wrapper.style.marginBottom = "30px";
      wrapper.style.width = canvas.width + "px";
      wrapper.style.height = canvas.height + "px";
      wrapper.appendChild(canvas);

      // Page label
      const label = document.createElement("div");
      label.className = "page-label";
      label.dataset.page = pageNum;
      label.textContent = `Page ${pageNum}`;
      label.style.margin = "30px 0 4px 4px";
      label.style.fontWeight = "bold";

      // Add label and wrapper to container
      container.appendChild(label);
      container.appendChild(wrapper);

      // Detect horizontal lines & add margin handles
      detectAllHorizontalLines(canvas, wrapper);
    }

    // Create checkboxes to toggle pages visibility
    if (typeof createPageToggles === "function") createPageToggles(pdf.numPages);
  };

  reader.readAsArrayBuffer(file); // read file as ArrayBuffer
});

// ----------------------
// Detect horizontal lines and add manual click/drag functionality
// ----------------------
function detectAllHorizontalLines(canvas, wrapper) {
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height).data; // get pixel data

  // ----------------------
  // Auto margin detection
  // ----------------------
  const brightnessThreshold = 120; // below this is considered dark
  const marginScanTop = Math.floor(height * 0.05); // start scanning 5% from top
  const marginScanBottom = Math.floor(height * 0.95); // stop scanning 95% down
  const darkPixelCutoffPerColumn = 5; // minimum dark pixels to count as a margin

  // Detect left margin
  let detectedLeft = 0;
  for (let x = 0; x < width; x++) {
    let colDark = 0;
    for (let y = marginScanTop; y < marginScanBottom; y++) {
      const i = (y * width + x) * 4;
      const brightness = (imageData[i] + imageData[i + 1] + imageData[i + 2]) / 3;
      if (brightness < brightnessThreshold) colDark++;
    }
    if (colDark > darkPixelCutoffPerColumn) { detectedLeft = x; break; }
  }

  // Detect right margin
  let detectedRight = width - 1;
  for (let x = width - 1; x >= 0; x--) {
    let colDark = 0;
    for (let y = marginScanTop; y < marginScanBottom; y++) {
      const i = (y * width + x) * 4;
      const brightness = (imageData[i] + imageData[i + 1] + imageData[i + 2]) / 3;
      if (brightness < brightnessThreshold) colDark++;
    }
    if (colDark > darkPixelCutoffPerColumn) { detectedRight = x; break; }
  }

  wrapper.dataset.detectedLeft = detectedLeft;
  wrapper.dataset.detectedRight = detectedRight;

  // ----------------------
  // Margin handles (draggable)
  // ----------------------
  function createMarginHandle(type, x, color) {
    const handle = document.createElement("div");
    handle.className = `${type}-margin-handle`;
    handle.style.position = "absolute";
    handle.style.top = "0";
    handle.style.left = `${x}px`;
    handle.style.height = `${height}px`;
    handle.style.width = "6px";
    handle.style.background = color;
    handle.style.opacity = "0.75";
    handle.style.cursor = "ew-resize";
    handle.style.zIndex = "40";
    handle.style.userSelect = "none";
    wrapper.appendChild(handle);

    wrapper.dataset[`${type}Margin`] = Math.round(x);

    let dragging = false;

    // Start dragging
    handle.addEventListener("pointerdown", ev => {
      dragging = true;
      handle.setPointerCapture(ev.pointerId);
    });

    // Dragging
    handle.addEventListener("pointermove", ev => {
      if (!dragging) return;
      const rect = wrapper.getBoundingClientRect();
      let newX = ev.clientX - rect.left;
      newX = Math.max(0, Math.min(width, newX)); // keep within bounds
      handle.style.left = `${Math.round(newX)}px`;
      wrapper.dataset[`${type}Margin`] = Math.round(newX);
    });

    // Stop dragging
    handle.addEventListener("pointerup", ev => {
      dragging = false;
      try { handle.releasePointerCapture(ev.pointerId); } catch {}
      // store last dragged margins
      lastDraggedMargins = {
        left: parseInt(wrapper.dataset.leftMargin ?? detectedLeft, 10),
        right: parseInt(wrapper.dataset.rightMargin ?? detectedRight, 10)
      };
      // show popup to apply to all pages
      if (!popupShown) {
        document.getElementById("applyAllPopup").style.display = "block";
        popupShown = true;
      }
    });

    return handle;
  }

  // Create left and right margin handles
  createMarginHandle("left", detectedLeft, "green");
  createMarginHandle("right", detectedRight, "blue");

  // ----------------------
  // Horizontal line detection
  // ----------------------
  const pixelCoverageRatio = 0.6; // minimum % of dark pixels to count as a line
  const lines = [];
  const allLineYs = [];

  const boxOffsetLeft = 10; // offset for marker box
  const boxOffsetTop = 5;
  const boxWidth = 40;
  const boxHeight = 50;

  for (let y = 1; y < height - 1; y++) {
    let darkPixels = 0;
    for (let x = 0; x < width; x++) {
      for (let offset = -1; offset <= 1; offset++) {
        const i = ((y + offset) * width + x) * 4;
        const r = imageData[i], g = imageData[i + 1], b = imageData[i + 2];
        const brightness = (r + g + b) / 3;
        if (brightness < brightnessThreshold) {
          darkPixels++;
          break;
        }
      }
    }

    const ratio = darkPixels / width;
    if (ratio > pixelCoverageRatio) {
      allLineYs.push(y);
      const minLineGap = 50; // minimum spacing between lines
      const maxClusterGap = 100; // max distance to consider a cluster

      if (lines.length === 0 || y - lines[lines.length - 1] > minLineGap) {
        const nearbyLines = lines.filter(prevY => y - prevY < maxClusterGap);
        if (nearbyLines.length >= 2) continue;

        lines.push(y);

        // Marker box for visual display
        const curLeft = parseInt(wrapper.dataset.leftMargin ?? detectedLeft, 10);
        const markerLeft = curLeft + boxOffsetLeft;
        const markerTop = y + boxOffsetTop;

        const marker = document.createElement("div");
        marker.className = "blue-marker";
        marker.style.position = "absolute";
        marker.style.left = `${markerLeft}px`;
        marker.style.top = `${markerTop}px`;
        marker.style.width = `${boxWidth}px`;
        marker.style.height = `${boxHeight}px`;
        marker.style.pointerEvents = "none"; // prevent blocking clicks
        marker.setAttribute("data-y", y);
        wrapper.appendChild(marker);

        // Line overlay
        const line = document.createElement("div");
        line.className = "line-overlay";
        line.style.position = "absolute";
        line.style.left = "0";
        line.style.width = "100%";
        line.style.top = `${y}px`;
        line.dataset.y = y;
        line.setAttribute("data-y", y);
        wrapper.appendChild(line);
      }
    }
  }

  // ----------------------
  // Manual click handling to add/remove lines
  // ----------------------
  wrapper.addEventListener("click", ev => {
    const rect = wrapper.getBoundingClientRect();
    const y = Math.round(ev.clientY - rect.top); // y-coordinate relative to wrapper

    // Check if clicked near an existing line (within 5px)
    const existingLine = Array.from(wrapper.querySelectorAll(".line-overlay")).find(line => {
      const lineY = parseInt(line.dataset.y, 10);
      return Math.abs(lineY - y) <= 5;
    });

    if (existingLine) {
      // Remove existing line & corresponding marker
      const marker = wrapper.querySelector(`.blue-marker[data-y="${existingLine.dataset.y}"]`);
      if (marker) wrapper.removeChild(marker);
      wrapper.removeChild(existingLine);
    } else {
      // Add a new line overlay
      const line = document.createElement("div");
      line.className = "line-overlay";
      line.style.position = "absolute";
      line.style.left = "0";
      line.style.width = "100%";
      line.style.top = `${y}px`;
      line.dataset.y = y;
      wrapper.appendChild(line);

      // Add marker for the new line
      const curLeft = parseInt(wrapper.dataset.leftMargin ?? wrapper.dataset.detectedLeft ?? 0, 10);
      const markerLeft = curLeft + 10;
      const markerTop = y + 5;

      const marker = document.createElement("div");
      marker.className = "blue-marker";
      marker.style.position = "absolute";
      marker.style.left = `${markerLeft}px`;
      marker.style.top = `${markerTop}px`;
      marker.style.width = `40px`;
      marker.style.height = `50px`;
      marker.style.pointerEvents = "none"; // marker does not block clicks
      marker.dataset.y = y;
      wrapper.appendChild(marker);
    }
  });

}

// ----------------------
// Popup Handlers for "Apply to All Pages"
// ----------------------
document.getElementById("applyAllYes").addEventListener("click", () => {
  document.getElementById("applyAllPopup").style.display = "none";
  popupShown = false;

  if (!lastDraggedMargins) return;

  // Apply last dragged margins to all pages
  document.querySelectorAll(".canvasWrapper").forEach(wrapper => {
    const leftHandle = wrapper.querySelector(".left-margin-handle");
    const rightHandle = wrapper.querySelector(".right-margin-handle");
    if (leftHandle && rightHandle) {
      leftHandle.style.left = `${lastDraggedMargins.left}px`;
      rightHandle.style.left = `${lastDraggedMargins.right}px`;
      wrapper.dataset.leftMargin = lastDraggedMargins.left;
      wrapper.dataset.rightMargin = lastDraggedMargins.right;
    }
  });
});

document.getElementById("applyAllNo").addEventListener("click", () => {
  document.getElementById("applyAllPopup").style.display = "none";
  popupShown = false;
});

// ----------------------
// Page visibility toggle checkboxes
// ----------------------
function createPageToggles(totalPages) {
  const checkboxContainer = document.getElementById("pageCheckboxes");
  if (!checkboxContainer) return;
  checkboxContainer.innerHTML = '';

  for (let i = 1; i <= totalPages; i++) {
    const label = document.createElement("label");
    label.style.display = "flex";
    label.style.cursor = "pointer";
    label.style.gap = "6px";
    label.innerHTML = `<input type="checkbox" data-page="${i}" checked /> Page ${i}`;
    checkboxContainer.appendChild(label);
  }

  // Toggle page visibility when checkbox is changed
  checkboxContainer.querySelectorAll("input[type=checkbox]").forEach(checkbox => {
    checkbox.addEventListener("change", () => {
      const pageNum = parseInt(checkbox.dataset.page, 10);
      const wrapper = document.querySelector(`.canvasWrapper[data-page="${pageNum}"]`);
      const label = document.querySelector(`.page-label[data-page="${pageNum}"]`);
      if (wrapper) wrapper.style.display = checkbox.checked ? "block" : "none";
      if (label) label.style.display = checkbox.checked ? "block" : "none";
    });
  });
}

// ----------------------
// Download / Export all pages as cropped PNGs
// ----------------------
document.getElementById("downloadBtn").addEventListener("click", async () => {
  if (!loadedPDF) { alert("Load a PDF first."); return; }

  const zip = new JSZip(); // create zip file
  let imageCount = 0;

  const wrappers = document.querySelectorAll(".canvasWrapper");

  for (const wrapper of wrappers) {
    const pageNum = wrapper.dataset.page;
    const checkbox = document.querySelector(`#pageCheckboxes input[data-page="${pageNum}"]`);
    if (checkbox && !checkbox.checked) continue; // skip unchecked pages

    const canvas = wrapper.querySelector("canvas");
    if (!canvas) continue;
    const width = canvas.width;
    const height = canvas.height;

    const leftX = parseInt(wrapper.dataset.leftMargin ?? wrapper.dataset.detectedLeft ?? 0, 10);
    const rightX = parseInt(wrapper.dataset.rightMargin ?? wrapper.dataset.detectedRight ?? width, 10);
    const cropWidth = Math.max(1, rightX - leftX);

    const lineElements = Array.from(wrapper.querySelectorAll(".line-overlay"));
    const yPositions = lineElements
      .map(line => parseInt(line.dataset.y, 10))
      .filter(n => !isNaN(n))
      .sort((a, b) => a - b);

    if (yPositions.length === 0) continue; // skip pages without lines

    // Loop through lines to crop sections
    for (let i = 0; i < yPositions.length; i++) {
      const startY = yPositions[i];
      const endY = i < yPositions.length - 1 ? yPositions[i + 1] : height;
      const cropHeight = Math.max(1, endY - startY);

      const croppedCanvas = document.createElement("canvas");
      croppedCanvas.width = cropWidth;
      croppedCanvas.height = cropHeight;
      const croppedCtx = croppedCanvas.getContext("2d");

      // Draw cropped portion
      croppedCtx.drawImage(canvas, leftX, startY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

      const dataUrl = croppedCanvas.toDataURL("image/png");
      const blob = await (await fetch(dataUrl)).blob();
      zip.file(`Page${pageNum}_Q${i + 1}.png`, blob);
      imageCount++;
    }
  }

  if (!imageCount) return alert("No selected pages with red lines found.");

  const content = await zip.generateAsync({ type: "blob" });
  saveAs(content, "extracted_questions.zip"); // download zip
});

// ----------------------
// Toggle checkbox panel visibility
// ----------------------
document.getElementById("togglePagesBtn")?.addEventListener("click", () => {
  const container = document.getElementById("pageCheckboxes");
  if (!container) return;
  container.style.display = container.style.display === "none" ? "block" : "none";
});
