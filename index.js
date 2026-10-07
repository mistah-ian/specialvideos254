document.addEventListener("DOMContentLoaded", () => {
    const SERVER_URL = 'https://medschoolmaterials.com';

    let allVideoCatalog = [];
    let flatPlaylist = [];
    let currentVideoIndex = -1;
    let previewTimer = null;
    let tokensDatabase = [];

    let storedPhone = localStorage.getItem('user_phone') || '';

    const searchBtn = document.getElementById('search-bar-btn');
    const searchOptions = document.getElementById('search-bar-options');
    const btnTitle = searchBtn ? searchBtn.querySelector('.search-bar-btn-title') : null;
    const btnIcon = searchBtn ? searchBtn.querySelector('.search-bar-btn-icon') : null;
    const modelsWrapper = document.getElementById('models-wrapper');

    const videoModal = document.getElementById('video-modal');
    const modalVideo = videoModal ? videoModal.querySelector('video') : null;
    const modalVideoSource = modalVideo ? modalVideo.querySelector('source') : null;
    const modalCloseBtn = document.getElementById('video-modal-close-btn');
    const prevContainer = videoModal ? videoModal.querySelector('.video-modal-video-container-previous') : null;
    const nextContainer = videoModal ? videoModal.querySelector('.video-modal-video-container-next') : null;
    const prevBtn = document.getElementById('video-modal-video-container-previous-btn');
    const nextBtn = document.getElementById('video-modal-video-container-next-btn');

    const paywallModal = document.getElementById('paywall-modal');
    const paywallCloseBtn = document.getElementById('paywall-modal-content-close-btn');
    const payInput = document.getElementById('paywall-modal-content-details-phone-number-input');
    const payError = document.querySelector('.paywall-modal-content-details-phone-number-invalid-error');
    const payBtn = document.getElementById('paywall-modal-content-details-pay-btn');
    const detailsView = document.querySelector('.paywall-modal-content-details');
    const waitView = document.querySelector('.paywall-modal-content-please-wait');

    if (storedPhone && payInput) {
        payInput.value = formatPhoneNumberString(storedPhone);
    }

    /* Phone Masking & Validation */
    function formatPhoneNumberString(value) {
        const digits = value.replace(/\D/g, '').slice(0, 10);
        let formatted = '';
        if (digits.length > 0) formatted += digits.slice(0, 2);
        if (digits.length > 2) formatted += '-' + digits.slice(2, 5);
        if (digits.length > 5) formatted += '-' + digits.slice(5, 8);
        if (digits.length > 8) formatted += '-' + digits.slice(8, 10);
        return formatted;
    }

    if (payInput) {
        payInput.addEventListener('input', (e) => {
            if (payError) payError.style.display = 'none';
            const rawDigits = e.target.value.replace(/\D/g, '');
            e.target.value = formatPhoneNumberString(rawDigits);
        });
    }

    function validatePhone(formattedVal) {
        const digits = formattedVal.replace(/\D/g, '');
        if (digits.length !== 10) return false;
        if (!digits.startsWith('07') && !digits.startsWith('01')) return false;
        return digits;
    }

    /* Initialize Platform */
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
                modelsWrapper.innerHTML = '<p style="text-align:center; color: red; margin-top: 40px;">Failed to load catalog. Please check server JSON format.</p>';
            }
        }
    }

    /* Access Verification */
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

    /* Render Catalog */
    function renderCatalog(catalog) {
        if (!modelsWrapper) return;
        modelsWrapper.innerHTML = '';
        flatPlaylist = [];

        if (searchOptions) {
            searchOptions.innerHTML = `
                <div class="search-bar-options-item" data-model-id="all">
                    <p class="search-bar-options-item-title">All Models</p>
                    <p class="search-bar-options-item-desc">Show all available content</p>
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

    /* Dropdown Controls */
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

    /* Video Modal & Paywall Logic */
    function openVideoModal(index) {
        if (index < 0 || index >= flatPlaylist.length || !videoModal) return;

        currentVideoIndex = index;
        const videoData = flatPlaylist[currentVideoIndex];

        if (prevContainer) prevContainer.style.visibility = (currentVideoIndex === 0) ? 'hidden' : 'visible';
        if (nextContainer) nextContainer.style.visibility = (currentVideoIndex === flatPlaylist.length - 1) ? 'hidden' : 'visible';

        if (modalVideoSource && modalVideo) {
            modalVideoSource.setAttribute('src', videoData.src);
            modalVideo.load();
            modalVideo.play();
        }

        videoModal.style.display = 'flex';

        const unlocked = isVideoUnlockedForUser(videoData.uniqueId);

        clearTimeout(previewTimer);
        if (!unlocked) {
            previewTimer = setTimeout(() => {
                triggerPaywall(videoData);
            }, videoData.previewTimeMs);
        }
    }

    function triggerPaywall(videoData) {
        if (modalVideo) modalVideo.pause();

        if (payBtn) payBtn.textContent = `Pay ${videoData.priceText}`;
        if (detailsView) detailsView.style.display = 'block';
        if (waitView) waitView.style.display = 'none';
        if (payError) payError.style.display = 'none';

        if (paywallModal) paywallModal.style.display = 'flex';
    }

    function closeVideoModal() {
        clearTimeout(previewTimer);
        if (modalVideo) modalVideo.pause();
        if (modalVideoSource) modalVideoSource.setAttribute('src', '');
        if (videoModal) videoModal.style.display = 'none';
        if (paywallModal) paywallModal.style.display = 'none';
    }

    if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeVideoModal);
    if (paywallCloseBtn) {
        paywallCloseBtn.addEventListener('click', () => {
            if (paywallModal) paywallModal.style.display = 'none';
            closeVideoModal();
        });
    }

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            if (currentVideoIndex > 0) openVideoModal(currentVideoIndex - 1);
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            if (currentVideoIndex < flatPlaylist.length - 1) openVideoModal(currentVideoIndex + 1);
        });
    }

    /* Payment Actions */
    if (payBtn) {
        payBtn.addEventListener('click', async () => {
            const validPhone = validatePhone(payInput.value);

            if (!validPhone) {
                if (payError) payError.style.display = 'block';
                return;
            }

            if (payError) payError.style.display = 'none';
            const currentVideo = flatPlaylist[currentVideoIndex];

            localStorage.setItem('user_phone', validPhone);
            storedPhone = validPhone;

            if (detailsView) detailsView.style.display = 'none';
            if (waitView) waitView.style.display = 'flex';

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
                    if (detailsView) detailsView.style.display = 'block';
                    if (waitView) waitView.style.display = 'none';
                }
            } catch (err) {
                alert("Payment error occurred. Please try again.");
                if (detailsView) detailsView.style.display = 'block';
                if (waitView) waitView.style.display = 'none';
            }
        });
    }

    function pollPaymentStatus(checkoutId, videoData) {
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

                    if (modalVideo) modalVideo.play();
                }
            } catch (e) {
                // Ignore transient network errors
            }
        }, 3000);
    }

    initPlatform();
});