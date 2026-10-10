document.addEventListener("DOMContentLoaded", () => {
    const SERVER_URL = 'https://medschoolmaterials.com';

    let allVideoCatalog = [];
    let currentModelData = null;
    let currentMainVideo = null;
    let previewTimer = null;
    let pollInterval = null;
    let onVideoPlayHandler = null;
    let tokensDatabase = [];

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

    const waitText = document.querySelector('.paywall-modal-content-please-wait-please-wait-text');
    const waitTimeText = document.querySelector('.paywall-modal-content-please-wait-time-text');
    const waitSpinner = document.querySelector('.paywall-modal-content-please-wait-spinner');

    /* =========================================
       1. Multi-Phone LocalStorage Helpers
       ========================================= */
    function getStoredPhones() {
        try {
            const raw = localStorage.getItem('user_phones');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) return parsed;
            }
        } catch (e) {}

        // Fallback for legacy single-phone storage
        const legacy = localStorage.getItem('user_phone');
        if (legacy) {
            const clean = legacy.replace(/\D/g, '').slice(0, 10);
            if (clean) return [clean];
        }
        return [];
    }

    function addStoredPhone(phone) {
        const phones = getStoredPhones();
        const clean = phone.replace(/\D/g, '').slice(0, 10);
        if (!clean) return;

        // Move to end if existing, ensuring latest phone is last
        const filtered = phones.filter(p => p !== clean);
        filtered.push(clean);

        localStorage.setItem('user_phones', JSON.stringify(filtered));
        localStorage.setItem('user_phone', clean); // Maintain single-phone fallback key
    }

    // Pre-fill input with the most recently used phone number
    const storedPhones = getStoredPhones();
    if (storedPhones.length > 0 && payInput) {
        payInput.value = storedPhones[storedPhones.length - 1];
    }

    /* =========================================
       2. Phone Input Handling (Digits Only)
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
       3. Initialize Catalog & Access Tokens
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
                modelsWrapper.innerHTML = '<p style="text-align:center; color: red; font-size:large; margin-top: 30px;">Failed to load catalog. Please refresh.</p>';
            }
        }
    }

    /* =========================================
       4. Multi-Phone Access Verification
       ========================================= */
    function isVideoUnlockedForUser(uniqueId) {
        const phonesList = getStoredPhones();
        if (phonesList.length === 0) return false;

        // Iterate through all stored phone numbers
        for (const phone of phonesList) {
            const userDigits = phone.replace(/\D/g, '');

            const record = tokensDatabase.find(item => item.phone_number && item.phone_number.replace(/\D/g, '') === userDigits);
            if (!record || !record.accessible_videos_ids) continue;

            const ids = record.accessible_videos_ids.split(' | ').map(s => s.trim());
            const dates = record.expiration_dates ? record.expiration_dates.split(' | ').map(s => s.trim()) : [];

            const index = ids.indexOf(uniqueId);
            if (index === -1) continue;

            const expString = dates[index];
            if (!expString) continue;

            const [datePart, timePart] = expString.split('-');
            if (!datePart || !timePart) continue;

            const [m, d, y] = datePart.split('/');
            const hh = timePart.slice(0, 2);
            const mm = timePart.slice(2, 4);

            const expDate = new Date(expString); // ISO strings parse natively and accurately in all browsers
            return Date.now() < expDate.getTime();
        }

        return false;
    }

    /* =========================================
       5. Render Catalog & Search Dropdown
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
       6. Dropdown Navigation
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
       7. State Reset & Modal Controls
       ========================================= */
    function resetModalState() {
        if (previewTimer) {
            clearTimeout(previewTimer);
            previewTimer = null;
        }
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }

        if (modalMainVideo) {
            if (onVideoPlayHandler) {
                modalMainVideo.removeEventListener('play', onVideoPlayHandler);
                onVideoPlayHandler = null;
            }
            modalMainVideo.pause();
            modalMainVideo.currentTime = 0;
            modalMainVideo.style.display = '';
        }

        if (modalMainVideoTitle) {
            modalMainVideoTitle.style.display = '';
        }
        if (modalMainVideoSource) {
            modalMainVideoSource.setAttribute('src', '');
        }

        if (paywallModal) paywallModal.style.display = 'none';
        if (detailsView) detailsView.style.display = 'block';
        if (waitView) waitView.style.display = 'none';
        if (payError) payError.style.display = 'none';

        if (waitText) {
            waitText.innerHTML = 'Please wait while we confirm your payment.';
            waitText.style.color = '';
            waitText.style.fontSize = '';
            waitText.style.textAlign = '';
        }
        if (waitTimeText) waitTimeText.style.display = '';
        if (waitSpinner) waitSpinner.style.display = '';

        if (payBtn) {
            payBtn.disabled = false;
            if (currentMainVideo) {
                payBtn.textContent = `Pay ${currentMainVideo.priceText}`;
            }
        }
    }

    function openVideoModal(modelData, selectedVideo) {
        if (!videoModal) return;

        resetModalState();

        currentModelData = modelData;
        currentMainVideo = selectedVideo;

        if (modalModelName) modalModelName.textContent = modelData.model_name;

        if (modalMainVideoSource && modalMainVideo) {
            modalMainVideoSource.setAttribute('src', selectedVideo.src);
            modalMainVideo.load();
        }
        if (modalMainVideoTitle) modalMainVideoTitle.textContent = selectedVideo.title;

        renderOtherVideos(modelData, selectedVideo.uniqueId);

        videoModal.style.display = 'flex';
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';

        const unlocked = isVideoUnlockedForUser(selectedVideo.uniqueId);

        if (!unlocked && modalMainVideo) {
            onVideoPlayHandler = () => {
                clearTimeout(previewTimer);
                previewTimer = setTimeout(() => {
                    triggerPaywall(selectedVideo);
                }, selectedVideo.previewTimeMs);
            };
            modalMainVideo.addEventListener('play', onVideoPlayHandler, { once: true });
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
            if (uniqueId === currentUniqueId) return;

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
        resetModalState();
        if (videoModal) videoModal.style.display = 'none';
        document.documentElement.style.overflow = '';
        document.body.style.overflow = '';
        currentModelData = null;
        currentMainVideo = null;
    }

    if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeVideoModal);

    /* =========================================
       8. Payment Triggering & Polling
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

            // Save phone to array in localStorage
            addStoredPhone(validPhone);

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
        if (pollInterval) clearInterval(pollInterval);

        pollInterval = setInterval(async () => {
            try {
                const res = await fetch(`${SERVER_URL}/mmw.php?action=check_payment&checkout_id=${checkoutId}`);
                const result = await res.json();

                if (result.status === 'COMPLETED') {
                    clearInterval(pollInterval);
                    pollInterval = null;

                    const tokensRes = await fetch(`${SERVER_URL}/mmw.php?action=get_tokens&t=${Date.now()}`);
                    if (tokensRes.ok) {
                        tokensDatabase = await tokensRes.json();
                    }

                    if (waitText) {
                        waitText.innerHTML = '&#10003; Payment successful!';
                        waitText.style.color = 'green';
                        waitText.style.fontSize = 'larger';
                        waitText.style.textAlign = 'center';
                    }
                    if (waitTimeText) waitTimeText.style.display = 'none';
                    if (waitSpinner) waitSpinner.style.display = 'none';

                    setTimeout(() => {
                        if (paywallModal) paywallModal.style.display = 'none';
                        if (modalMainVideo) {
                            modalMainVideo.style.display = '';
                            modalMainVideo.play();
                        }
                        if (modalMainVideoTitle) modalMainVideoTitle.style.display = '';
                    }, 1000);
                }
            } catch (e) {
                // Ignore transient network errors
            }
        }, 3000);
    }

    initPlatform();
});