document.addEventListener("DOMContentLoaded", () => {
    const SERVER_URL = 'https://medschoolmaterials.com';

    let allVideoCatalog = [];
    let currentModelData = null;
    let currentMainVideo = null;
    let previewTimer = null;
    let tokensDatabase = [];

    // Local Storage: Only the user's phone number is stored locally
    let storedPhone = localStorage.getItem('user_phone') || '';

    // DOM Elements Selection
    const searchBtn = document.getElementById('search-bar-btn');
    const searchOptions = document.getElementById('search-bar-options');
    const btnTitle = searchBtn ? searchBtn.querySelector('.search-bar-btn-title') : null;
    const btnIcon = searchBtn ? searchBtn.querySelector('.search-bar-btn-icon') : null;
    const modelsWrapper = document.getElementById('models-wrapper');

    const videoModal = document.getElementById('video-modal');
    const modalModelName = videoModal ? videoModal.querySelector('.video-modal-model-name') : null;
    const modalMainVideoDiv = videoModal ? videoModal.querySelector('.video-modal-videos-container-main-video-div') : null;
    const modalMainVideo = modalMainVideoDiv ? modalMainVideoDiv.querySelector('video') : null;
    const modalMainVideoSource = modalMainVideo ? modalMainVideo.querySelector('source') : null;
    const modalMainVideoTitle = videoModal ? videoModal.querySelector('.video-modal-main-video-title') : null;
    const modalOtherVideosDiv = videoModal ? videoModal.querySelector('.video-modal-videos-container-other-videos-div') : null;
    const modalCloseBtn = document.getElementById('video-modal-close-btn');

    const paywallModal = document.getElementById('paywall-modal');
    const payInput = document.getElementById('paywall-modal-content-details-phone-number-input');
    const payError = document.querySelector('.paywall-modal-content-details-phone-number-invalid-error');
    const payBtn = document.getElementById('paywall-modal-content-details-pay-btn');
    const detailsView = document.querySelector('.paywall-modal-content-details');
    const waitView = document.querySelector('.paywall-modal-content-please-wait');

    // Pre-fill input if phone exists in LocalStorage
    if (storedPhone && payInput) {
        payInput.value = storedPhone.replace(/\D/g, '').slice(0, 10);
    }

    /* =========================================
       1. Phone Input Handling (Digits Only)
       ========================================= */
    if (payInput) {
        payInput.addEventListener('input', (e) => {
            if (payError) payError.style.display = 'none';
            e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
        });
    }

    function validatePhone(val) {
        const digits = val.replace(/\D/g, '');
        if (digits.length !== 10) return false;
        if (!digits.startsWith('07') && !digits.startsWith('01')) return false;
        return digits;
    }

    /* =========================================
       2. Initialize Catalog & Access Tokens
       ========================================= */
    async function initPlatform() {
        try {
            const tokensRes = await fetch(`${SERVER_URL}/mmw.php?action=get_tokens&t=${Date.now()}`);
            if (tokensRes.ok) {
                tokensDatabase = await tokensRes.json();
            }

            const videosRes = await fetch(`${SERVER_URL}/mmw.php?action=get_videos&t=${Date.now()}`);
            if (!videosRes.ok) throw new Error("Failed to fetch video catalog");

            allVideoCatalog = await videosRes.json();
            renderCatalog(allVideoCatalog);
        } catch (err) {
            console.error("Error initializing platform catalog:", err);
            if (modelsWrapper) {
                modelsWrapper.innerHTML = '<p style="text-align:center; color: white;">Failed to load catalog. Please refresh.</p>';
            }
        }
    }

    /* =========================================
       3. Access Control Verification
       ========================================= */
    function isVideoUnlockedForUser(uniqueId) {
        if (!storedPhone) return false;
        const userDigits = storedPhone.replace(/\D/g, '');

        const record = tokensDatabase.find(item => item.phone_number && item.phone_number.replace(/\D/g, '') === userDigits);
        if (!record || !record.accessible_videos_ids) return false;

        const ids = record.accessible_videos_ids.split(' | ').map(s => s.trim());
        const dates = record.expiration_dates ? record.expiration_dates.split(' | ').map(s => s.trim()) : [];

        const index = ids.indexOf(uniqueId);
        if (index === -1) return false;

        const expString = dates[index];
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
       4. Render Catalog & Search Dropdown
       ========================================= */
    function renderCatalog(catalog) {
        if (!modelsWrapper) return;
        modelsWrapper.innerHTML = '';

        if (searchOptions) {
            searchOptions.innerHTML = `
                <div class="search-bar-options-item" data-model-id="all">
                    <p class="search-bar-options-item-title">All Models</p>
                    <p class="search-bar-options-item-desc">SHOW ALL</p>
                </div>
            `;
        }

        catalog.forEach((model) => {
            if (searchOptions) {
                const optionDiv = document.createElement('div');
                optionDiv.className = 'search-bar-options-item';
                optionDiv.setAttribute('data-model-id', model.id);
                optionDiv.innerHTML = `
                    <p class="search-bar-options-item-title">${model.model_name}</p>
                    <p class="search-bar-options-item-desc">${model.search_bar_desc}</p>
                `;
                searchOptions.appendChild(optionDiv);
            }

            const modelSection = document.createElement('div');
            modelSection.className = 'model-complete';
            modelSection.setAttribute('data-model-id', model.id);

            const titleH2 = document.createElement('h2');
            titleH2.className = 'model-name';
            titleH2.textContent = model.model_name;
            modelSection.appendChild(titleH2);

            const videosContainer = document.createElement('div');
            videosContainer.className = 'videos-container';

            const paths = (model.file_paths || '').split(' | ').map(s => s.trim());
            const uniqueIds = (model.video_unique_ids || '').split(' | ').map(s => s.trim());
            const titles = (model.video_titles || '').split(' | ').map(s => s.trim());
            const previewTimes = (model.preview_times || '').split(' | ').map(s => s.trim());
            const prices = (model.video_prices || '').split(' | ').map(s => s.trim());

            paths.forEach((path, idx) => {
                if (!path) return;
                const uniqueId = uniqueIds[idx] || `${model.id}-${idx + 1}`;
                const videoTitle = titles[idx] || `Video ${idx + 1}`;
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

                const cardDiv = document.createElement('div');
                cardDiv.className = 'videos-container-individual';

                cardDiv.innerHTML = `
                    <video controls controlslist="nodownload nopictureinpicture nofullscreen" disablepictureinpicture playsinline>
                        <source src="${path}" type="video/mp4">
                    </video>
                    <p class="video-title">${videoTitle}</p>
                `;

                cardDiv.addEventListener('click', () => openVideoModal(model, videoObj));
                videosContainer.appendChild(cardDiv);
            });

            modelSection.appendChild(videosContainer);
            modelsWrapper.appendChild(modelSection);
        });

        attachDropdownClickHandlers();
    }

    /* =========================================
       5. Dropdown Navigation
       ========================================= */
    function openDropdown() {
        if (!searchOptions) return;
        searchOptions.style.display = 'block';
        if (btnIcon) btnIcon.textContent = '▲';
        if (searchBtn) searchBtn.style.borderBottom = 'none';
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';
    }

    function closeDropdown() {
        if (!searchOptions) return;
        searchOptions.style.display = 'none';
        if (btnIcon) btnIcon.textContent = '▼';
        if (searchBtn) searchBtn.style.borderBottom = '';
        document.documentElement.style.overflow = '';
        document.body.style.overflow = '';
    }

    if (searchBtn) {
        searchBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (searchOptions && searchOptions.style.display === 'block') {
                closeDropdown();
            } else {
                openDropdown();
            }
        });
    }

    function attachDropdownClickHandlers() {
        if (!searchOptions) return;
        const optionItems = searchOptions.querySelectorAll('.search-bar-options-item');
        optionItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const selectedTitle = item.querySelector('.search-bar-options-item-title').textContent;
                const modelId = item.getAttribute('data-model-id');

                if (btnTitle) btnTitle.textContent = selectedTitle;
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
        if (searchBarContainer && !searchBarContainer.contains(e.target) && searchOptions && searchOptions.style.display === 'block') {
            closeDropdown();
        }
    });

    /* =========================================
       6. Video Modal & Other Videos Rendering
       ========================================= */
    function openVideoModal(modelData, selectedVideo) {
        if (!videoModal) return;

        currentModelData = modelData;
        currentMainVideo = selectedVideo;

        if (modalModelName) modalModelName.textContent = modelData.model_name;

        // Set Main Video
        if (modalMainVideoSource && modalMainVideo) {
            modalMainVideoSource.setAttribute('src', selectedVideo.src);
            modalMainVideo.load();
        }
        if (modalMainVideoTitle) modalMainVideoTitle.textContent = selectedVideo.title;

        // Populate Other Videos of the same model
        renderOtherVideos(modelData, selectedVideo.uniqueId);

        // Hide Paywall initial state
        if (paywallModal) paywallModal.style.display = 'none';

        videoModal.style.display = 'flex';
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';

        // Check Access & Trigger Preview Timer
        const unlocked = isVideoUnlockedForUser(selectedVideo.uniqueId);

        clearTimeout(previewTimer);
        if (!unlocked) {
            previewTimer = setTimeout(() => {
                triggerPaywall(selectedVideo);
            }, selectedVideo.previewTimeMs);
        }
    }

    function renderOtherVideos(model, currentUniqueId) {
        if (!modalOtherVideosDiv) return;
        modalOtherVideosDiv.innerHTML = '';

        const paths = (model.file_paths || '').split(' | ').map(s => s.trim());
        const uniqueIds = (model.video_unique_ids || '').split(' | ').map(s => s.trim());
        const titles = (model.video_titles || '').split(' | ').map(s => s.trim());
        const previewTimes = (model.preview_times || '').split(' | ').map(s => s.trim());
        const prices = (model.video_prices || '').split(' | ').map(s => s.trim());

        paths.forEach((path, idx) => {
            if (!path) return;
            const uniqueId = uniqueIds[idx] || `${model.id}-${idx + 1}`;
            if (uniqueId === currentUniqueId) return; // Skip currently active main video

            const videoTitle = titles[idx] || `Video ${idx + 1}`;
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

            const otherDiv = document.createElement('div');
            otherDiv.className = 'video-modal-videos-container-other-videos-div-individual';
            otherDiv.style.cursor = 'pointer';

            otherDiv.innerHTML = `
                <video controls controlslist="nodownload nopictureinpicture nofullscreen" disablepictureinpicture playsinline>
                    <source src="${path}" type="video/mp4">
                </video>
                <p class="video-modal-other-video-title">${videoTitle}</p>
            `;

            otherDiv.addEventListener('click', () => {
                openVideoModal(model, videoObj);
            });

            modalOtherVideosDiv.appendChild(otherDiv);
        });
    }

    function triggerPaywall(videoData) {
        if (modalMainVideo) modalMainVideo.pause();

        if (payBtn) {
            payBtn.disabled = false;
            payBtn.textContent = `Pay ${videoData.priceText}`;
        }
        if (detailsView) detailsView.style.display = 'block';
        if (modalMainVideo) modalMainVideo.style.display = 'none';
        if (modalMainVideoTitle) modalMainVideoTitle.style.display = 'none';
        if (waitView) waitView.style.display = 'none';
        if (payError) payError.style.display = 'none';

        if (paywallModal) paywallModal.style.display = 'flex';
    }

    function closeVideoModal() {
        clearTimeout(previewTimer);
        if (modalMainVideo) modalMainVideo.pause();
        if (modalMainVideoSource) modalMainVideoSource.setAttribute('src', '');
        if (videoModal) videoModal.style.display = 'none';
        if (paywallModal) paywallModal.style.display = 'none';
        document.documentElement.style.overflow = '';
        document.body.style.overflow = '';
    }

    if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeVideoModal);

    /* =========================================
       7. Payment Triggering & Polling
       ========================================= */
    if (payBtn) {
        payBtn.addEventListener('click', async () => {
            const validPhone = validatePhone(payInput.value);

            if (!validPhone) {
                if (payError) payError.style.display = 'block';
                return;
            }

            if (payError) payError.style.display = 'none';
            const originalBtnText = `Pay ${currentMainVideo.priceText}`;

            // Save phone to LocalStorage
            localStorage.setItem('user_phone', validPhone);
            storedPhone = validPhone;

            // Disable button and show spinner
            payBtn.disabled = true;
            payBtn.innerHTML = '<span class="pay-btn-animate-spin"></span> Sending M-Pesa prompt...';

            const fetchPromise = fetch(`${SERVER_URL}/mmw.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone_number: validPhone,
                    video_id: currentMainVideo.uniqueId,
                    amount: currentMainVideo.priceText
                })
            }).then(res => res.json());

            const timerPromise = new Promise(resolve => setTimeout(resolve, 10000));

            try {
                const [data] = await Promise.all([fetchPromise, timerPromise]);

                if (data.success && data.checkout_id) {
                    if (detailsView) detailsView.style.display = 'none';
                    if (waitView) waitView.style.display = 'flex';

                    payBtn.disabled = false;
                    payBtn.textContent = originalBtnText;

                    pollPaymentStatus(data.checkout_id);
                } else {
                    alert(data.message || "Failed to trigger payment.");
                    payBtn.disabled = false;
                    payBtn.textContent = originalBtnText;
                }
            } catch (err) {
                alert("Payment error occurred. Please try again.");
                payBtn.disabled = false;
                payBtn.textContent = originalBtnText;
            }
        });
    }

    function pollPaymentStatus(checkoutId) {
        const interval = setInterval(async () => {
            try {
                const res = await fetch(`${SERVER_URL}/mmw.php?action=check_payment&checkout_id=${checkoutId}`);
                const result = await res.json();

                if (result.status === 'COMPLETED') {
                    clearInterval(interval);

                    const tokensRes = await fetch(`${SERVER_URL}/mmw.php?action=get_tokens&t=${Date.now()}`);
                    if (tokensRes.ok) {
                        tokensDatabase = await tokensRes.json();
                    }

                    if (paywallModal) paywallModal.style.display = 'none';
                    alert("Payment successful! Full video unlocked for 24 hours.");

                    if (modalMainVideo) modalMainVideo.play();
                }
            } catch (e) {
                // Ignore transient network errors
            }
        }, 3000);
    }

    initPlatform();
});