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
  let galleryData = []; // Store full data objects
  let images = []; // Keep for index mapping
  let currentIndex = 0;

  // --- Helpers ---
  const getCaption = (filename) => {
    return filename.replace(/\.[^/.]+$/, "").replace(/_/g, " ");
  };

  // --- Initialization ---
  const initGallery = async () => {
    try {
      const response = await fetch('js/gallery-data.json');
      if (!response.ok) throw new Error('Failed to load gallery data');
      
      galleryData = await response.json();
      images = galleryData.map(item => item.filename); // Keep for legacy index logic

      renderGallery(galleryData);
    } catch (error) {
      console.error('Error initializing gallery:', error);
      gallery.innerHTML = '<p class="error-msg">Failed to load images. Please try again later.</p>';
    }
  };

  const renderGallery = (dataList) => {
    dataList.forEach((item, index) => {
      // Create wrapper
      const wrapper = document.createElement("div");
      wrapper.classList.add("gallery-item-wrapper");

      // Construct Picture Element for Responsive + WebP
      const picture = document.createElement("picture");
      
      // 1. WebP Source (Responsive)
      const sourceWebp = document.createElement("source");
      sourceWebp.type = "image/webp";
      sourceWebp.sizes = "(max-width: 600px) 100vw, (max-width: 1024px) 50vw, 33vw";
      sourceWebp.srcset = `
        ${item.versions.thumb.webp} 400w,
        ${item.versions.medium.webp} 1080w
      `;

      // 2. JPG Source (Responsive Fallback)
      const sourceJpg = document.createElement("source");
      sourceJpg.type = "image/jpeg";
      sourceJpg.sizes = "(max-width: 600px) 100vw, (max-width: 1024px) 50vw, 33vw";
      sourceJpg.srcset = `
        ${item.versions.thumb.jpg} 400w,
        ${item.versions.medium.jpg} 1080w
      `;

      // 3. Img Element (Default/Fallback)
      const img = document.createElement("img");
      img.src = item.versions.thumb.jpg; // Load small one initially
      img.alt = getCaption(item.filename);
      img.classList.add("gallery-item");
      img.loading = "lazy";
      img.width = item.width;   // Helps layout stability
      img.height = item.height; // Helps layout stability

      img.onload = () => {
        img.classList.add("loaded");
      };

      picture.appendChild(sourceWebp);
      picture.appendChild(sourceJpg);
      picture.appendChild(img);
      wrapper.appendChild(picture);
      gallery.appendChild(wrapper);

      // Click event
      wrapper.addEventListener("click", () => {
        openLightbox(index);
      });
    });
  };

  // --- Lightbox Logic ---
  const updateLightboxImage = () => {
    const item = galleryData[currentIndex];
    // Prefer Large WebP -> Large JPG -> Original
    // For simple <img> src, we can't force WebP unless browser supports it. 
    // But most do. Let's use the Large JPG for maximum compatibility in lightbox <img> tag, 
    // or we could replace lightbox <img> with <picture> too. 
    // For now, let's use the High-Quality Large JPG for safety and quality.
    const fullPath = item.versions.large.jpg || item.original; 
    
    // Reset state
    lightboxImg.src = fullPath;
    lightboxCaption.textContent = getCaption(item.filename);
    lightboxMetadata.innerHTML = '<div class="metadata-loading">Loading metadata...</div>';

    // Trigger fade-in animation
    [lightboxImg, lightboxInfo].forEach(el => {
      el.classList.remove("fade-in");
      void el.offsetWidth; // Trigger reflow
      el.classList.add("fade-in");
    });
    
    if (window.location.protocol === 'file:') {
      lightboxMetadata.innerHTML = '<div class="metadata-error">Metadata unavailable in local file mode.</div>';
      return;
    }

    // EXIF Logic (Loads the ORIGINAL file for metadata, as optimized ones usually strip it)
    const tempImg = new Image();
    tempImg.src = item.original; // Read EXIF from original source file

    tempImg.onload = function() {
      EXIF.getData(this, function() {
        const make = EXIF.getTag(this, "Make");
        // ... (rest of existing EXIF logic)
        const model = EXIF.getTag(this, "Model");
        const fNumberTag = EXIF.getTag(this, "FNumber");
        const exposureTime = EXIF.getTag(this, "ExposureTime");
        const iso = EXIF.getTag(this, "ISOSpeedRatings");
        const focalLengthTag = EXIF.getTag(this, "FocalLength");

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
