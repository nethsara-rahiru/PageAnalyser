const fileInput = document.getElementById("fileInput");
const container = document.getElementById("canvasContainer");

let loadedPDF = null; // Store globally for future use (e.g., selected pages later)

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = async () => {
    const pdfData = new Uint8Array(reader.result);
    const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
    loadedPDF = pdf; // store for later use

    container.innerHTML = ''; // Clear previous content

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.5 });

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({ canvasContext: ctx, viewport }).promise;

      // Wrapper
      const wrapper = document.createElement("div");
      wrapper.className = "canvasWrapper";
      wrapper.setAttribute("data-page", pageNum);
      wrapper.style.position = "relative";
      wrapper.style.marginBottom = "30px";
      wrapper.style.width = canvas.width + "px";
      wrapper.style.height = canvas.height + "px";
      wrapper.appendChild(canvas);

      // Label
      const label = document.createElement("div");
      label.className = "page-label";
      label.textContent = `Page ${pageNum}`;
      label.style.margin = "30px 0 4px 4px";
      label.style.fontWeight = "bold";

      container.appendChild(label);
      container.appendChild(wrapper);

      detectAllHorizontalLines(canvas, wrapper);
    }

    // ✅ Only call after full render
    createPageToggles(pdf.numPages);
  };

  reader.readAsArrayBuffer(file);
});

function detectAllHorizontalLines(canvas, wrapper) {
  const allLineYs = [];  // Store all lines, even rejected ones
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height).data;

  const brightnessThreshold = 120;
  const pixelCoverageRatio = 0.6;
  const lines = [];

  // ✅ Step 1: Auto-detect left and right content margins
 const marginScanTop = Math.floor(height * 0.05);  // 10% from top
 const marginScanBottom = Math.floor(height * 0.95); // 90% from bottom
 const darkPixelCutoffPerColumn = 5;

  let detectedLeft = 0;
  for (let x = 0; x < width; x++) {
    let colDark = 0;
    for (let y = marginScanTop; y < marginScanBottom; y++) {
      const i = (y * width + x) * 4;
      const r = imageData[i], g = imageData[i + 1], b = imageData[i + 2];
      const brightness = (r + g + b) / 3;
      if (brightness < brightnessThreshold) colDark++;
    }
    if (colDark > darkPixelCutoffPerColumn) {
      detectedLeft = x;
      break;
    }
  }

  let detectedRight = width - 1;
  for (let x = width - 1; x >= 0; x--) {
    let colDark = 0;
    for (let y = marginScanTop; y < marginScanBottom; y++) {
      const i = (y * width + x) * 4;
      const r = imageData[i], g = imageData[i + 1], b = imageData[i + 2];
      const brightness = (r + g + b) / 3;
      if (brightness < brightnessThreshold) colDark++;
    }
    if (colDark > darkPixelCutoffPerColumn) {
      detectedRight = x;
      break;
    }
  }

  // ✅ Draw vertical margin lines
  const leftLine = document.createElement("div");
  leftLine.style.position = "absolute";
  leftLine.style.top = "0";
  leftLine.style.left = `${detectedLeft}px`;
  leftLine.style.height = `${canvas.height}px`;
  leftLine.style.width = "2px";
  leftLine.style.backgroundColor = "green";
  leftLine.style.zIndex = "5";
  wrapper.appendChild(leftLine);

  const rightLine = document.createElement("div");
  rightLine.style.position = "absolute";
  rightLine.style.top = "0";
  rightLine.style.left = `${detectedRight}px`;
  rightLine.style.height = `${canvas.height}px`;
  rightLine.style.width = "2px";
  rightLine.style.backgroundColor = "blue";
  rightLine.style.zIndex = "5";
  wrapper.appendChild(rightLine);

  console.log(`Left margin: ${detectedLeft}px, Right margin: ${detectedRight}px`);

  // ✅ Step 2: Detect horizontal lines and place blue boxes
  const boxOffsetLeft = 10;
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
      const minLineGap = 50; // minimum distance between lines in px
      const maxClusterGap = 100; // used to define a loose group

        if (lines.length === 0 || y - lines[lines.length - 1] > minLineGap) {
          const nearbyLines = lines.filter(prevY => y - prevY < maxClusterGap);
          if (nearbyLines.length >= 2) {
            continue;
          }

          lines.push(y);

          // ✅ Marker based on detected margin
          const markerLeft = detectedLeft + boxOffsetLeft;
          const markerTop = y + boxOffsetTop;

          const markerData = ctx.getImageData(markerLeft, markerTop, boxWidth, boxHeight).data;
          let markerDarkPixels = 0;

          for (let i = 0; i < markerData.length; i += 4) {
            const r = markerData[i];
            const g = markerData[i + 1];
            const b = markerData[i + 2];
            const brightness = (r + g + b) / 3;
            if (brightness < 100) markerDarkPixels++;
          }

          const totalPixels = boxWidth * boxHeight;
          const darkRatio = markerDarkPixels / totalPixels;

          const marker = document.createElement("div");
          marker.className = darkRatio > 0.01 ? "blue-marker" : "gray-marker";
          marker.style.left = `${markerLeft}px`;
          marker.style.top = `${markerTop}px`;
          marker.style.width = `${boxWidth}px`;
          marker.style.height = `${boxHeight}px`;
          marker.setAttribute("data-y", y);
          wrapper.appendChild(marker);

          if (darkRatio > 0.01) {
            const line = document.createElement("div");
            line.className = "line-overlay";
            line.style.top = `${y}px`;
            line.setAttribute("data-y", y);
            wrapper.appendChild(line);
          }
        }

    }
  }
    
    // After your detection loop, e.g. after for(let y=1; y<height-1; y++) { ... }
   if (lines.length > 0) {
      const lastLineY = lines[lines.length - 1];

      // Optionally, avoid duplicating if lastLineY already has a line
      if (!lines.includes(lastLineY)) {
        lines.push(lastLineY);
      }

      // Create footer red line breaker
      const footerLine = document.createElement("div");
      footerLine.className = "footer-line-breaker line-overlay"; // Add common line class
      footerLine.style.position = "absolute";
      footerLine.style.top = `${lastLineY}px`;
      footerLine.style.left = "0";
      footerLine.style.width = "100%";
      footerLine.style.height = "4px";  // thicker to stand out
      footerLine.style.backgroundColor = "red";
      footerLine.style.zIndex = "10";
      footerLine.setAttribute("data-y", lastLineY);  // Key for removal

      wrapper.appendChild(footerLine);
    }


    
    wrapper.addEventListener("mousemove", (e) => {
      const mouseY = e.offsetY;
      const threshold = 15;

      // Remove previous helper lines
      const oldHelpers = wrapper.querySelectorAll(".helper-line");
      oldHelpers.forEach(line => line.remove());

      // Add new helper lines if near mouse
      allLineYs.forEach(y => {
        if (Math.abs(mouseY - y) < threshold && !lines.includes(y)) {
          const helper = document.createElement("div");
          helper.className = "helper-line";
          helper.style.top = `${y}px`;
          wrapper.appendChild(helper);
        }
      });
    });

    wrapper.addEventListener("click", (e) => {
      const clickY = Math.round(e.offsetY);
      const toggleThreshold = 8;

      // Check if user clicked near an existing red line
      const existingIndex = lines.findIndex(lineY => Math.abs(lineY - clickY) <= toggleThreshold);

      if (existingIndex !== -1) {
        // 🔴 Remove red line from list
        const yToRemove = lines[existingIndex];
        lines.splice(existingIndex, 1);

        // Remove red line from DOM
        const redLine = wrapper.querySelector(`.line-overlay[data-y="${yToRemove}"]`);
        if (redLine) redLine.remove();

        // Remove matching blue marker
        const marker = wrapper.querySelector(`.blue-marker[data-y="${yToRemove}"]`);
        if (marker) marker.remove();

        // Remove footer marker if this was the footer line
        const footerMarker = wrapper.querySelector(`.footer-marker`);
        if (footerMarker && footerMarker.getAttribute('data-y') == yToRemove.toString()) {
          footerMarker.remove();

          // If other lines remain, add footer marker to new last line
          if (lines.length > 0) {
            const newFooterY = Math.max(...lines);
            addFooterMarker(newFooterY);
          }
        }

      } else {
        // 🔴 Add new red line and blue marker at clickY
        lines.push(clickY);

        const line = document.createElement("div");
        line.className = "line-overlay";
        line.style.top = `${clickY}px`;
        line.setAttribute("data-y", clickY);
        wrapper.appendChild(line);

        const marker = document.createElement("div");
        marker.className = "blue-marker";
        marker.style.left = `${detectedLeft + boxOffsetLeft}px`;
        marker.style.top = `${clickY + boxOffsetTop}px`;
        marker.style.width = `${boxWidth}px`;
        marker.style.height = `${boxHeight}px`;
        marker.setAttribute("data-y", clickY);
        wrapper.appendChild(marker);

        // Update footer marker: remove old and add new on the bottom-most line
        const footerMarkerOld = wrapper.querySelector(".footer-marker");
        if (footerMarkerOld) footerMarkerOld.remove();

        const newFooterY = Math.max(...lines);
        addFooterMarker(newFooterY);
      }
    });

    function addFooterMarker(y) {
      const wrapper = document.getElementById("canvasContainer").lastChild;
      if (!wrapper) return;

      const existingFooter = wrapper.querySelector(".footer-marker");
      if (existingFooter) existingFooter.remove();

      const footerMarker = document.createElement("div");
      footerMarker.className = "footer-marker";
      footerMarker.style.top = `${y}px`;
      footerMarker.setAttribute("data-y", y);
      footerMarker.style.height = "6px";  // or whatever thickness you want

      wrapper.appendChild(footerMarker);
    }
}

function parsePageSelector(input, totalPages) {
  const pages = new Set();
  const parts = input.split(',');

  for (let part of parts) {
    part = part.trim();
    if (/^\d+$/.test(part)) {
      const num = parseInt(part);
      if (num >= 1 && num <= totalPages) pages.add(num);
    } else if (/^\d+-\d+$/.test(part)) {
      let [start, end] = part.split('-').map(n => parseInt(n));
      if (start > end) [start, end] = [end, start];
      for (let i = start; i <= end; i++) {
        if (i >= 1 && i <= totalPages) pages.add(i);
      }
    }
  }

  return [...pages].sort((a, b) => a - b);
}

function createPageToggles(totalPages) {
  const checkboxContainer = document.getElementById("pageCheckboxes");
  checkboxContainer.innerHTML = ''; // Clear old

  for (let i = 1; i <= totalPages; i++) {
    const label = document.createElement("label");
    label.style.display = "flex";
    label.style.cursor = "pointer";

    label.innerHTML = `
      <input type="checkbox" data-page="${i}" checked />
      Page ${i}
    `;
    checkboxContainer.appendChild(label);
  }

  // ✅ This part must come AFTER creating all checkboxes
  checkboxContainer.querySelectorAll("input[type=checkbox]").forEach(checkbox => {
  checkbox.addEventListener("change", () => {
    const pageNum = parseInt(checkbox.getAttribute("data-page"));

    // Only hide/show the canvas and label, not the checkbox label itself
    const canvasWrapper = document.querySelector(`.canvasWrapper[data-page="${pageNum}"]`);
    const pageLabel = document.querySelector(`.page-label[data-page="${pageNum}"]`);

    if (canvasWrapper) {
      canvasWrapper.style.display = checkbox.checked ? "block" : "none";
    }
    if (pageLabel) {
      pageLabel.style.display = checkbox.checked ? "block" : "none";
    }
  });
});

}

document.getElementById("downloadBtn").addEventListener("click", async () => {
  const zip = new JSZip();
  const wrappers = document.querySelectorAll(".canvasWrapper");

  let imageCount = 1;

  for (let wrapper of wrappers) {
    const pageNum = wrapper.getAttribute("data-page");
    const checkbox = document.querySelector(`#pageCheckboxes input[data-page="${pageNum}"]`);
    if (!checkbox || !checkbox.checked) continue;

    const canvas = wrapper.querySelector("canvas");
    const ctx = canvas.getContext("2d");
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    // Get left and right margin lines
    const leftLine = wrapper.querySelector("div[style*='background-color: green']");
    const rightLine = wrapper.querySelector("div[style*='background-color: blue']");
    const leftX = parseInt(leftLine?.style.left || 0);
    const rightX = parseInt(rightLine?.style.left || canvasWidth);
    const width = rightX - leftX;

    // Get all red line Y values and sort them
    const lineElements = Array.from(wrapper.querySelectorAll(".line-overlay"));
    const yPositions = lineElements.map(line => parseInt(line.getAttribute("data-y"))).sort((a, b) => a - b);

    if (yPositions.length === 0) continue;

    for (let i = 0; i < yPositions.length; i++) {
      const startY = yPositions[i];
      const endY = i < yPositions.length - 1 ? yPositions[i + 1] : canvasHeight;
      const height = endY - startY;

      // Create cropped image
      const croppedCanvas = document.createElement("canvas");
      croppedCanvas.width = width;
      croppedCanvas.height = height;
      const croppedCtx = croppedCanvas.getContext("2d");

      croppedCtx.drawImage(canvas, leftX, startY, width, height, 0, 0, width, height);
      const dataUrl = croppedCanvas.toDataURL("image/png");

      const response = await fetch(dataUrl);
      const blob = await response.blob();
      zip.file(`Page${pageNum}_Q${i + 1}.png`, blob);

      imageCount++;
    }
  }

  if (imageCount === 1) {
    alert("No selected pages with red lines found.");
    return;
  }

  zip.generateAsync({ type: "blob" }).then(content => {
    saveAs(content, "extracted_questions.zip");
  });
});

document.getElementById("togglePagesBtn").addEventListener("click", () => {
  const checkboxContainer = document.getElementById("pageCheckboxes");
  checkboxContainer.style.display = checkboxContainer.style.display === "none" ? "block" : "none";
});
