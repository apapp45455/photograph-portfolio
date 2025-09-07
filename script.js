document.addEventListener('DOMContentLoaded', () => {
    const gallery = document.getElementById('gallery-container');
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    const closeBtn = document.querySelector('.close-btn');

    // --- 設定 ---
    // 請將你的圖片檔名放在這個陣列中
    const images = [
        "中原_土木館.jpg",
        "中原_室設外景.JPG",
        "四四南村_街景.jpg",
        "四四南村_天空.jpg"
    ];
    const imagePath = 'images/';

    // --- 動態載入圖片到畫廊 ---
    images.forEach(imgName => {
        const img = document.createElement('img');
        img.src = imagePath + imgName;
        img.alt = "攝影作品";
        img.classList.add('gallery-item');
        gallery.appendChild(img);

        // --- 為每張圖片添加點擊事件監聽器 ---
        img.addEventListener('click', () => {
            lightbox.style.display = 'flex'; // 顯示燈箱
            lightboxImg.src = img.src; // 設定燈箱圖片來源
        });
    });

    // --- 關閉燈箱的事件 ---
    const closeLightbox = () => {
        lightbox.style.display = 'none';
    };

    closeBtn.addEventListener('click', closeLightbox); // 點擊關閉按鈕
    lightbox.addEventListener('click', (e) => {
        // 如果點擊的是背景（而不是圖片本身），也關閉燈箱
        if (e.target === lightbox) {
            closeLightbox();
        }
    });
});
