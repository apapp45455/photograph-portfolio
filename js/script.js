document.addEventListener("DOMContentLoaded", () => {
  const gallery = document.getElementById("gallery-container");
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightbox-img");
  const lightboxInfo = document.querySelector(".lightbox-info");
  const lightboxCaption = document.getElementById("lightbox-caption");
  const lightboxMetadata = document.getElementById("lightbox-metadata");
  const closeBtn = document.querySelector(".close-btn");
  const prevBtn = document.getElementById("prev-btn");
  const nextBtn = document.getElementById("next-btn");

  // --- Configuration ---
  const imagePath = "images/";
  const images = [
    "中原大學_室設.jpg",
    "中原大學_黑冠麻鷺.jpg",
    "中原大學_莊敬樓.jpg",
    "信義_101.jpg",
    "信義_新光三越.jpg",
    "內壢_火車站.jpg",
    "內壢火車站_天橋.jpg",
    "四四南村_仰角.jpg",
    "四四南村_店家.jpg"
  ];

  let currentIndex = 0;

  // --- Helpers ---
  const getCaption = (filename) => {
    // Remove extension and replace underscores with spaces
    return filename.replace(/\.[^/.]+$/, "").replace(/_/g, " ");
  };

  // --- Initialization ---
  const initGallery = () => {
    images.forEach((imgName, index) => {
      // Create wrapper
      const wrapper = document.createElement("div");
      wrapper.classList.add("gallery-item-wrapper");

      const img = document.createElement("img");
      img.src = imagePath + imgName;
      img.alt = getCaption(imgName);
      img.classList.add("gallery-item");
      img.loading = "lazy"; // Native lazy loading

      // Fade in when loaded
      img.onload = () => {
        img.classList.add("loaded");
      };

      wrapper.appendChild(img);
      gallery.appendChild(wrapper);

      // Click event
      wrapper.addEventListener("click", () => {
        openLightbox(index);
      });
    });
  };

  // --- Lightbox Logic ---
  const updateLightboxImage = () => {
    const imgName = images[currentIndex];
    const fullPath = imagePath + imgName;
    
    // Reset state
    lightboxImg.src = fullPath;
    lightboxCaption.textContent = getCaption(imgName);
    lightboxMetadata.innerHTML = '<div class="metadata-loading">Loading metadata...</div>';

    // Trigger fade-in animation
    [lightboxImg, lightboxInfo].forEach(el => {
      el.classList.remove("fade-in");
      void el.offsetWidth; // Trigger reflow
      el.classList.add("fade-in");
    });
    
    // Check for file protocol restriction
    if (window.location.protocol === 'file:') {
      lightboxMetadata.innerHTML = '<div class="metadata-error">Metadata unavailable in local file mode (CORS restriction). Please use a local server.</div>';
      return;
    }

    // Use a new image object for EXIF parsing to avoid caching issues on the DOM element
    const tempImg = new Image();
    tempImg.src = fullPath; 
    // Add crossOrigin attribute if images are from external/CDN (not the case here, but good practice)
    // tempImg.crossOrigin = "Anonymous"; 

    tempImg.onload = function() {
      // EXIF.getData needs the image to be loaded
      EXIF.getData(this, function() {
        const make = EXIF.getTag(this, "Make");
        const model = EXIF.getTag(this, "Model");
        const fNumberTag = EXIF.getTag(this, "FNumber");
        const exposureTime = EXIF.getTag(this, "ExposureTime");
        const iso = EXIF.getTag(this, "ISOSpeedRatings");
        const focalLengthTag = EXIF.getTag(this, "FocalLength");

        // Check if we found ANY relevant data
        if (!make && !model && !fNumberTag && !exposureTime && !iso && !focalLengthTag) {
           lightboxMetadata.innerHTML = '<div class="metadata-empty">No EXIF data found</div>';
           return;
        }

        const fNumber = fNumberTag ? `f/${parseFloat(fNumberTag).toFixed(1)}` : "--";
        const focalLength = focalLengthTag ? `${parseFloat(focalLengthTag).toFixed(0)}mm` : "--";

        let shutterSpeed = "--";
        if (exposureTime) {
          if (exposureTime >= 1) {
            shutterSpeed = `${exposureTime}s`;
          } else {
            shutterSpeed = `1/${Math.round(1 / exposureTime)}s`;
          }
        }

        lightboxMetadata.innerHTML = `
          <div class="metadata-grid">
            <div class="metadata-item"><span class="label">Camera</span><span class="value">${make || ''} ${model || ''}</span></div>
            <div class="metadata-item"><span class="label">Aperture</span><span class="value">${fNumber}</span></div>
            <div class="metadata-item"><span class="label">Shutter</span><span class="value">${shutterSpeed}</span></div>
            <div class="metadata-item"><span class="label">ISO</span><span class="value">${iso || "--"}</span></div>
            <div class="metadata-item"><span class="label">Focal</span><span class="value">${focalLength}</span></div>
          </div>
        `;
      });
    };

    tempImg.onerror = function() {
        lightboxMetadata.innerHTML = '<div class="metadata-error">Failed to load image data</div>';
    };
  };

  const openLightbox = (index) => {
    currentIndex = index;
    updateLightboxImage();
    lightbox.classList.add("active"); // Use class for display: flex
    document.body.style.overflow = "hidden"; // Prevent background scrolling
  };

  const closeLightbox = () => {
    lightbox.classList.remove("active");
    document.body.style.overflow = "";
  };

  const showNext = (e) => {
    if (e) e.stopPropagation();
    currentIndex = (currentIndex + 1) % images.length;
    updateLightboxImage();
  };

  const showPrev = (e) => {
    if (e) e.stopPropagation();
    currentIndex = (currentIndex - 1 + images.length) % images.length;
    updateLightboxImage();
  };

  // --- Event Listeners ---
  closeBtn.addEventListener("click", closeLightbox);

  // Close on background click
  lightbox.addEventListener("click", (e) => {
    if (
      e.target === lightbox ||
      (e.target.closest(".lightbox-content-wrapper") === null &&
        !e.target.closest(".nav-btn"))
    ) {
      // If clicking background or outside content/buttons
      if (e.target === lightbox) closeLightbox();
    }
  });

  prevBtn.addEventListener("click", showPrev);
  nextBtn.addEventListener("click", showNext);

  // Keyboard support
  document.addEventListener("keydown", (e) => {
    if (!lightbox.classList.contains("active")) return;

    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowRight") showNext();
    if (e.key === "ArrowLeft") showPrev();
  });

  // Run
  initGallery();
});
