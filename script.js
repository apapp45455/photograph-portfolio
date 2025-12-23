document.addEventListener("DOMContentLoaded", () => {
  const gallery = document.getElementById("gallery-container");
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightbox-img");
  const lightboxCaption = document.getElementById("lightbox-caption");
  const closeBtn = document.querySelector(".close-btn");
  const prevBtn = document.getElementById("prev-btn");
  const nextBtn = document.getElementById("next-btn");

  // --- Configuration ---
  const imagePath = "images/";
  const images = [
    "中原_土木館.jpg",
    "中原_室設外景.JPG",
    "四四南村_街景.jpg",
    "四四南村_天空.jpg",
    "內壢_天橋.JPG",
    "內壢_車站.jpeg",
    "信義_101.jpeg",
    "信義_新光三越.jpeg"
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
    lightboxImg.src = imagePath + imgName;
    lightboxCaption.textContent = getCaption(imgName);
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
