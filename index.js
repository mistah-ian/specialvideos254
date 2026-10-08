document.addEventListener("DOMContentLoaded", () => {
    const SERVER_URL = 'https://medschoolmaterials.com';

    let allVideoCatalog = [];
    let flatPlaylist = [];
    let currentVideoIndex = -1;
    let previewTimer = null;
    let tokensDatabase = [];

    // Local Storage: Only the user's phone number is persisted locally
    let storedPhone = localStorage.getItem('user_phone') || '';

    // DOM Elements Selection
    const searchBtn = document.getElementById('search-bar-btn');
    const searchOptions = document.getElementById('search-bar-options');
    const btnTitle = searchBtn.querySelector('.search-bar-btn-title');
    const btnIcon = searchBtn.querySelector('.search-bar-btn-icon');
    const modelsWrapper = document.getElementById('models-wrapper');

    const videoModal = document.getElementById('video-modal');
    const modalVideo = videoModal.querySelector('video');
    const modalVideoSource = modalVideo.querySelector('source');
    const modalCloseBtn = document.getElementById('video-modal-close-btn');
    const prevContainer = videoModal.querySelector('.video-modal-video-container-previous');
    const nextContainer = videoModal.querySelector('.video-modal-video-container-next');
    const prevBtn = document.getElementById('video-modal-video-container-previous-btn');
    const nextBtn = document.getElementById('video-modal-video-container-next-btn');

    const paywallModal = document.getElementById('paywall-modal');
    const paywallCloseBtn = document.getElementById('paywall-modal-content-close-btn');
    const payInput = document.getElementById('paywall-modal-content-details-phone-number-input');
    const payError = document.querySelector('.paywall-modal-content-details-phone-number-invalid-error');
    const payBtn = document.getElementById('paywall-modal-content-details-pay-btn');
    const detailsView = document.querySelector('.paywall-modal-content-details');
    const waitView = document.querySelector('.paywall-modal-content-please-wait');

    // Pre-fill input if a valid phone number exists in LocalStorage
    if (storedPhone) {
        payInput.value = formatPhoneNumberString(storedPhone);
    }

    /* =========================================
       1. Phone Masking & Validation (0X-XXX-XXX-XX)
       ========================================= */
    function formatPhoneNumberString(value) {
        const digits = value.replace(/\D/g, '').slice(0, 10);
        let formatted = '';
        if (digits.length > 0) formatted += digits.slice(0, 2);
        if (digits.length > 2) formatted += '-' + digits.slice(2, 5);
        if (digits.length > 5) formatted += '-' + digits.slice(5, 8);
        if (digits.length > 8) formatted += '-' + digits.slice(8, 10);
        return formatted;
    }

    payInput.addEventListener('input', (e) => {
        payError.style.display = 'none';
        const rawDigits = e.target.value.replace(/\D/g, '');
        e.target.value = formatPhoneNumberString(rawDigits);
    });

    function validatePhone(formattedVal) {
        const digits = formattedVal.replace(/\D/g, '');
        if (digits.length !== 10) return false;
        if (!digits.startsWith('07') && !digits.startsWith('01')) return false;
        return digits;
    }

    /* =========================================
       2. Initialize Platform via mmw.php (Avoids CORS)
       ========================================= */
    async function initPlatform() {
        try {
            // Fetch access tokens through mmw.php
            const tokensRes = await fetch(`${SERVER_URL}/mmw.php?action=get_tokens&t=${Date.now()}`);
            if (tokensRes.ok) {
                tokensDatabase = await tokensRes.json();
            }

            // Fetch video catalog through mmw.php
            const videosRes = await fetch(`${SERVER_URL}/mmw.php?action=get_videos&t=${Date.now()}`);
            allVideoCatalog = await videosRes.json();

            renderCatalog(allVideoCatalog);
        } catch (err) {
            console.error("Error initializing platform catalog:", err);
            modelsWrapper.innerHTML = '<p style="text-align:center; color: white;">Failed to load catalog. Please refresh.</p>';
        }
    }

    /* =========================================
       3. Access Control Verification (tokens.json)
       ========================================= */
    function isVideoUnlockedForUser(uniqueId) {
        if (!storedPhone) return false;
        const userDigits = storedPhone.replace(/\D/g, '');

        const record = tokensDatabase.find(item => item.phone_number.replace(/\D/g, '') === userDigits);
        if (!record) return false;

        const ids = record.accessible_videos_ids.split(' | ').map(s => s.trim());
        const dates = record.expiration_dates.split(' | ').map(s => s.trim());

        const index = ids.indexOf(uniqueId);
        if (index === -1) return false;

        const expString = dates[index]; // Expected format: MM/DD/YYYY-HHMM
        if (!expString) return false;

        const [datePart, timePart] = expString.split('-');
        if (!datePart || !timePart) return false;

        const [m, d, y] = datePart.split('/');
        const hh = timePart.slice(0, 2);
        const mm = timePart.slice(2, 4);

        const expDate = new Date(y, m - 1, d, hh, mm);
        return Date.now() < expDate.getTime();
    }

    /* =========================================
       4. Render UI Catalog & Search Dropdown
       ========================================= */
    function renderCatalog(catalog) {
        modelsWrapper.innerHTML = '';
        flatPlaylist = [];

        // Reset search options dropdown
        searchOptions.innerHTML = `
            <div class="search-bar-options-item" data-model-id="all">
                <p class="search-bar-options-item-title">All Models</p>
                <p class="search-bar-options-item-desc">Show all</p>
            </div>
        `;

        catalog.forEach((model) => {
            // Populate Search Dropdown Item
            const optionDiv = document.createElement('div');
            optionDiv.className = 'search-bar-options-item';
            optionDiv.setAttribute('data-model-id', model.id);
            optionDiv.innerHTML = `
                <p class="search-bar-options-item-title">${model.model_name}</p>
                <p class="search-bar-options-item-desc">${model.search_bar_desc}</p>
            `;
            searchOptions.appendChild(optionDiv);

            // Populate Model Section
            const modelSection = document.createElement('div');
            modelSection.className = 'model-complete';
            modelSection.setAttribute('data-model-id', model.id);

            const titleH2 = document.createElement('h2');
            titleH2.className = 'model-name';
            titleH2.textContent = model.model_name;
            modelSection.appendChild(titleH2);

            const videosContainer = document.createElement('div');
            videosContainer.className = 'videos-container';

            // Split delimited strings
            const paths = model.file_paths.split(' | ').map(s => s.trim());
            const uniqueIds = model.video_unique_ids.split(' | ').map(s => s.trim());
            const titles = model.video_titles.split(' | ').map(s => s.trim());
            const previewTimes = model.preview_times.split(' | ').map(s => s.trim());
            const prices = model.video_prices.split(' | ').map(s => s.trim());

            paths.forEach((path, idx) => {
                const uniqueId = uniqueIds[idx];
                const videoTitle = titles[idx];
                const pTimeMs = parseInt(previewTimes[idx]) || 5000;
                const priceText = prices[idx] || "10 KES";

                const videoObj = {
                    uniqueId,
                    title: videoTitle,
                    src: path,
                    previewTimeMs: pTimeMs,
                    priceText,
                    modelId: model.id
                };

                const playlistIndex = flatPlaylist.length;
                flatPlaylist.push(videoObj);

                const cardDiv = document.createElement('div');
                cardDiv.className = 'videos-container-individual';
                cardDiv.setAttribute('data-index', playlistIndex);

                cardDiv.innerHTML = `
                    <video controls controlslist="nodownload nopictureinpicture nofullscreen" disablepictureinpicture playsinline>
                        <source src="${path}" type="video/mp4">
                    </video>
                    <p class="video-title">${videoTitle}</p>
                `;

                cardDiv.addEventListener('click', () => openVideoModal(playlistIndex));
                videosContainer.appendChild(cardDiv);
            });

            modelSection.appendChild(videosContainer);
            modelsWrapper.appendChild(modelSection);
        });

        attachDropdownClickHandlers();
    }

    /* =========================================
       5. Dropdown Menu Controls
       ========================================= */
    function openDropdown() {
        searchOptions.style.display = 'block';
        btnIcon.textContent = '▲';
        searchBtn.style.borderBottom = 'none';
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';
    }

    function closeDropdown() {
        searchOptions.style.display = 'none';
        btnIcon.textContent = '▼';
        searchBtn.style.borderBottom = '';
        document.documentElement.style.overflow = '';
        document.body.style.overflow = '';
    }

    searchBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (searchOptions.style.display === 'block') {
            closeDropdown();
        } else {
            openDropdown();
        }
    });

    function attachDropdownClickHandlers() {
        const optionItems = searchOptions.querySelectorAll('.search-bar-options-item');
        optionItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const selectedTitle = item.querySelector('.search-bar-options-item-title').textContent;
                const modelId = item.getAttribute('data-model-id');

                btnTitle.textContent = selectedTitle;
                closeDropdown();

                const modelSections = document.querySelectorAll('.model-complete');
                modelSections.forEach(sec => {
                    if (modelId === 'all' || sec.getAttribute('data-model-id') === modelId) {
                        sec.style.display = 'flex';
                    } else {
                        sec.style.display = 'none';
                    }
                });
            });
        });
    }

    window.addEventListener('click', (e) => {
        const searchBarContainer = document.querySelector('.search-bar');
        if (searchBarContainer && !searchBarContainer.contains(e.target) && searchOptions.style.display === 'block') {
            closeDropdown();
        }
    });

    /* =========================================
       6. Video Modal & Preview Paywall
       ========================================= */
    function openVideoModal(index) {
        if (index < 0 || index >= flatPlaylist.length) return;

        currentVideoIndex = index;
        const videoData = flatPlaylist[currentVideoIndex];

        // Toggle Next / Previous Navigation Visibility
        if (currentVideoIndex === 0) {
            prevContainer.style.visibility = 'hidden';
        } else {
            prevContainer.style.visibility = 'visible';
        }

        if (currentVideoIndex === flatPlaylist.length - 1) {
            nextContainer.style.visibility = 'hidden';
        } else {
            nextContainer.style.visibility = 'visible';
        }

        // Assign video source and play
        modalVideoSource.setAttribute('src', videoData.src);
        modalVideo.load();

        videoModal.style.display = 'flex';
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';

        // Check if unlocked for user
        const unlocked = isVideoUnlockedForUser(videoData.uniqueId);

        clearTimeout(previewTimer);
        if (!unlocked) {
            previewTimer = setTimeout(() => {
                triggerPaywall(videoData);
            }, videoData.previewTimeMs);
        }
    }

    function triggerPaywall(videoData) {
        modalVideo.pause();

        // Dynamically update pay button with price from videos.json
        payBtn.textContent = `Pay ${videoData.priceText}`;

        detailsView.style.display = 'block';
        waitView.style.display = 'none';
        payError.style.display = 'none';

        paywallModal.style.display = 'flex';
    }

    function closeVideoModal() {
        clearTimeout(previewTimer);
        modalVideo.pause();
        modalVideoSource.setAttribute('src', '');
        videoModal.style.display = 'none';
        paywallModal.style.display = 'none';
        document.documentElement.style.overflow = '';
        document.body.style.overflow = '';
    }

    modalCloseBtn.addEventListener('click', closeVideoModal);
    paywallCloseBtn.addEventListener('click', () => {
        paywallModal.style.display = 'none';
        closeVideoModal();
    });

    prevBtn.addEventListener('click', () => {
        if (currentVideoIndex > 0) {
            openVideoModal(currentVideoIndex - 1);
        }
    });

    nextBtn.addEventListener('click', () => {
        if (currentVideoIndex < flatPlaylist.length - 1) {
            openVideoModal(currentVideoIndex + 1);
        }
    });

    /* =========================================
       7. Payment Triggering & Polling
       ========================================= */
    payBtn.addEventListener('click', async () => {
        const validPhone = validatePhone(payInput.value);

        if (!validPhone) {
            payError.style.display = 'block';
            return;
        }

        payError.style.display = 'none';
        const currentVideo = flatPlaylist[currentVideoIndex];

        // Store user phone in LocalStorage
        localStorage.setItem('user_phone', validPhone);
        storedPhone = validPhone;

        detailsView.style.display = 'none';
        waitView.style.display = 'flex';

        try {
            const response = await fetch(`${SERVER_URL}/mmw.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone_number: validPhone,
                    video_id: currentVideo.uniqueId,
                    amount: currentVideo.priceText
                })
            });

            const data = await response.json();

            if (data.success && data.checkout_id) {
                pollPaymentStatus(data.checkout_id, currentVideo);
            } else {
                alert(data.message || "Failed to trigger payment.");
                detailsView.style.display = 'block';
                waitView.style.display = 'none';
            }
        } catch (err) {
            alert("Payment error occurred. Please try again.");
            detailsView.style.display = 'block';
            waitView.style.display = 'none';
        }
    });

    function pollPaymentStatus(checkoutId, videoData) {
        const interval = setInterval(async () => {
            try {
                const res = await fetch(`${SERVER_URL}/mmw.php?action=check_payment&checkout_id=${checkoutId}`);
                const result = await res.json();

                if (result.status === 'COMPLETED') {
                    clearInterval(interval);

                    // Re-sync tokens from mmw.php
                    const tokensRes = await fetch(`${SERVER_URL}/mmw.php?action=get_tokens&t=${Date.now()}`);
                    if (tokensRes.ok) {
                        tokensDatabase = await tokensRes.json();
                    }

                    paywallModal.style.display = 'none';
                    alert("Payment successful! Full video unlocked for 24 hours.");

                    modalVideo.play();
                }
            } catch (e) {
                // Ignore transient polling errors
            }
        }, 3000);
    }

    // Run initialization on page load
    initPlatform();
});