/* app.js - School Learning Map Dashboard Logic */

// Configurations
const DEFAULT_SHEET_URL = "https://docs.google.com/spreadsheets/d/1K6oaopjvflcic6JPdefbhXQNt1ljVRUhsrY0YSAlL2s/export?format=csv";

// App State
let rawData = [];         // Raw data loaded
let normalizedData = [];  // Standardized schema data
let filteredData = [];    // Filtered data for display

let currentActivity = "ALL";
let currentGrade = "ALL";
let currentSearch = "";
let selectedItemIndex = 0;
let currentPreviewTab = "doc"; // 'doc', 'slide', 'video', 'infographic'

// DOM Elements
const themeToggle = document.getElementById("theme-toggle");
const themeText = document.getElementById("theme-text");
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const statusCount = document.getElementById("status-count");
const syncBtn = document.getElementById("sync-btn");
const settingsBtn = document.getElementById("settings-btn");

// Stat Elements
const statPlans = document.getElementById("stat-plans");
const statSchools = document.getElementById("stat-schools");

// Filters Elements
const filterActivity = document.getElementById("filter-activity");
const filterGrades = document.getElementById("filter-grades");

// List & Detail Elements
const listCountTitle = document.getElementById("list-count-title");
const planList = document.getElementById("plan-list");
const detailView = document.getElementById("detail-view");

// Modal Elements
const settingsModal = document.getElementById("settings-modal");
const sheetsUrlInput = document.getElementById("sheets-url");
const modalClose = document.getElementById("modal-close");
const modalReset = document.getElementById("modal-reset");
const modalSave = document.getElementById("modal-save");

// --- Initialization ---
document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    initSettingsModal();
    setupEventListeners();
    
    // Load cached/offline data immediately for fast load
    loadDashboardData();
    
    // Fetch fresh live data from Google Sheets immediately
    syncDataFromGoogleSheets(false);
    
    // Poll the Google Sheet silently every 15 seconds for real-time updates
    setInterval(() => {
        syncDataFromGoogleSheets(true);
    }, 15000);
    
    // Re-sync silently in background when the user returns to this tab
    window.addEventListener("focus", () => {
        syncDataFromGoogleSheets(true);
    });
});

// --- Theme Management ---
function initTheme() {
    const savedTheme = localStorage.getItem("schoolMap_theme") || "light";
    document.documentElement.setAttribute("data-theme", savedTheme);
    updateThemeUI(savedTheme);
}

function updateThemeUI(theme) {
    if (theme === "dark") {
        themeToggle.innerHTML = `<i class="fa-solid fa-sun"></i> <span id="theme-text">โหมดสว่าง (Light)</span>`;
    } else {
        themeToggle.innerHTML = `<i class="fa-solid fa-moon"></i> <span id="theme-text">โหมดมืด (Dark)</span>`;
    }
}

themeToggle.addEventListener("click", () => {
    const currentTheme = document.documentElement.getAttribute("data-theme") || "light";
    const newTheme = currentTheme === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("schoolMap_theme", newTheme);
    updateThemeUI(newTheme);
});

// --- Settings Modal ---
function initSettingsModal() {
    const savedUrl = localStorage.getItem("schoolMap_sheetUrl") || DEFAULT_SHEET_URL;
    sheetsUrlInput.value = savedUrl;
}

function setupEventListeners() {
    // Open Settings
    settingsBtn.addEventListener("click", () => {
        settingsModal.classList.add("open");
    });

    // Close Settings
    modalClose.addEventListener("click", () => {
        settingsModal.classList.remove("open");
    });

    // Close modal on clicking overlay
    settingsModal.addEventListener("click", (e) => {
        if (e.target === settingsModal) {
            settingsModal.classList.remove("open");
        }
    });

    // Reset URL
    modalReset.addEventListener("click", () => {
        sheetsUrlInput.value = DEFAULT_SHEET_URL;
    });

    // Save URL & Sync
    modalSave.addEventListener("click", () => {
        const inputUrl = sheetsUrlInput.value.trim();
        if (inputUrl) {
            localStorage.setItem("schoolMap_sheetUrl", inputUrl);
            settingsModal.classList.remove("open");
            syncDataFromGoogleSheets();
        }
    });

    // Sync button manual trigger
    syncBtn.addEventListener("click", () => {
        syncDataFromGoogleSheets();
    });

    // Filter Change: Activity
    filterActivity.addEventListener("change", (e) => {
        currentActivity = e.target.value;
        selectedItemIndex = 0; // reset selected index
        applyFilters();
    });


}

// --- Data Parsing & Normalization ---

// Extract Spreadsheet ID from Google Sheets Share Link
function cleanSheetsUrl(url) {
    if (!url) return DEFAULT_SHEET_URL;
    if (url.includes("/export") || url.endsWith(".csv")) {
        return url;
    }
    // Extract ID using regex
    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) {
        return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv`;
    }
    return url;
}

// Normalize row data keys dynamically to safeguard against header shifts
function normalizeDataRow(row) {
    const keys = Object.keys(row);
    const getVal = (pattern) => {
        const match = keys.find(k => k.replace(/\s+/g, '').includes(pattern.replace(/\s+/g, '')));
        if (match && row[match] !== null && row[match] !== undefined) {
            return String(row[match]).trim();
        }
        return '';
    };

    return {
        timestamp: getVal('ประทับเวลา'),
        email: getVal('ที่อยู่อีเมล'),
        name: getVal('1.1'),
        school: getVal('1.2'),
        grade: getVal('1.3').replace(/\s+/g, ''),
        month: getVal('1.4'),
        activity: getVal('1.5'),
        pdf: getVal('1.6'),
        doc: getVal('1.7'),
        slide: getVal('2.1'),
        video: getVal('2.2'),
        infographic: getVal('2.3') || getVal('อินโฟกราฟิก')
    };
}

// --- Loading Data Flows ---

function loadDashboardData() {
    // 1. Try cached data first, but only if it's not older/smaller than INITIAL_DATA
    const cachedDataStr = localStorage.getItem("schoolMap_cachedData");
    let parsedCache = null;
    if (cachedDataStr) {
        try {
            parsedCache = JSON.parse(cachedDataStr);
        } catch (e) {
            console.error("Error parsing cached data", e);
        }
    }

    const hasInitialData = typeof INITIAL_DATA !== 'undefined' && Array.isArray(INITIAL_DATA);
    
    if (parsedCache && (!hasInitialData || parsedCache.length >= INITIAL_DATA.length)) {
        rawData = parsedCache;
        normalizedData = rawData.map(normalizeDataRow);
        updateStatusUI(true, "ซิงก์จากข้อมูลแคชล่าสุด");
        renderDashboard();
        return;
    }

    // 2. Try default offline data from data.js
    if (hasInitialData) {
        rawData = INITIAL_DATA;
        normalizedData = rawData.map(normalizeDataRow);
        updateStatusUI(false, "ใช้งานแบบออฟไลน์ (ข้อมูลสำรอง)");
        renderDashboard();
    } else {
        updateStatusUI(false, "ไม่มีข้อมูลเริ่มต้น กรุณาเชื่อมต่ออินเทอร์เน็ต");
    }
}

// Fetch live data from Google Sheets CSV Export
function syncDataFromGoogleSheets(isSilent = false) {
    const rawUrl = localStorage.getItem("schoolMap_sheetUrl") || DEFAULT_SHEET_URL;
    const csvUrl = cleanSheetsUrl(rawUrl);

    if (!isSilent) {
        // Show loading spinner
        syncBtn.innerHTML = `<i class="fa-solid fa-arrows-rotate spinner"></i>`;
        syncBtn.disabled = true;
        statusDot.className = "status-dot"; // remove active class to stop pulse during load
        statusText.innerText = "กำลังซิงก์ข้อมูลจาก Google Sheets...";
    }

    fetch(csvUrl)
        .then(response => {
            if (!response.ok) throw new Error("Network response was not ok: " + response.statusText);
            return response.text();
        })
        .then(csvText => {
            Papa.parse(csvText, {
                header: true,
                skipEmptyLines: true,
                complete: function(results) {
                    if (results.data && results.data.length > 0) {
                        const dataStr = JSON.stringify(results.data);
                        const cachedStr = localStorage.getItem("schoolMap_cachedData");

                        if (dataStr !== cachedStr || !isSilent) {
                            // Save current selection to restore it
                            let prevSelected = null;
                            if (filteredData && filteredData[selectedItemIndex]) {
                                prevSelected = filteredData[selectedItemIndex];
                            }

                            // Success! Save data
                            rawData = results.data;
                            normalizedData = rawData.map(normalizeDataRow);
                            localStorage.setItem("schoolMap_cachedData", dataStr);
                            
                            updateStatusUI(true, "ซิงก์อยู่กับ Google Sheet สด");
                            
                            // Render dashboard
                            renderDashboard();

                            // Restore selection
                            if (prevSelected) {
                                const newIdx = filteredData.findIndex(item => 
                                    item.name === prevSelected.name && 
                                    item.grade === prevSelected.grade && 
                                    item.activity === prevSelected.activity
                                );
                                if (newIdx >= 0) {
                                    selectedItemIndex = newIdx;
                                    // Highlight active card
                                    drawPlanListCards();
                                }
                            }
                        } else {
                            // If no changes, just ensure the dot is active
                            updateStatusUI(true, "ซิงก์อยู่กับ Google Sheet สด");
                        }
                    } else {
                        throw new Error("No data rows found in CSV");
                    }
                },
                error: function(err) {
                    throw new Error("CSV Parsing failed: " + err.message);
                }
            });
        })
        .catch(error => {
            console.error("Sync error:", error);
            if (!isSilent) {
                updateStatusUI(false, "ซิงก์ล้มเหลว (ใช้ออฟไลน์)");
                // Fallback load
                loadDashboardData();
            }
        })
        .finally(() => {
            if (!isSilent) {
                // Restore icon
                syncBtn.innerHTML = `<i class="fa-solid fa-arrows-rotate"></i>`;
                syncBtn.disabled = false;
            }
        });
}

function updateStatusUI(isLive, message) {
    if (isLive) {
        statusDot.className = "status-dot active";
        statusText.innerText = message;
    } else {
        statusDot.className = "status-dot";
        statusDot.style.backgroundColor = "var(--text-muted)";
        statusText.innerText = message;
    }
}

// --- Dashboard Render Controllers ---

function renderDashboard() {
    // Update total count labels
    statusCount.innerText = `${normalizedData.length} แผนบูรณาการ`;
    statPlans.innerText = `${normalizedData.length} สื่อนวัตกรรม`;

    // Calculate dynamic unique schools
    const uniqueSchools = [...new Set(normalizedData.map(d => d.school))].filter(s => s);
    statSchools.innerText = `${uniqueSchools.length} สถาบัน`;

    // Populate Activity Dropdown
    populateActivityFilter();

    // Render Grade Filters
    renderGradeTabs();

    // Apply all filters and draw the lists
    applyFilters();
}

function populateActivityFilter() {
    // Save current selection value
    const prevSelection = filterActivity.value;

    // Extract unique activities
    const activities = [...new Set(normalizedData.map(d => d.activity))].filter(a => a).sort();
    
    // Reset option list
    filterActivity.innerHTML = `<option value="ALL">กิจกรรมทั้งหมด</option>`;
    
    activities.forEach(act => {
        const option = document.createElement("option");
        option.value = act;
        option.innerText = act;
        filterActivity.appendChild(option);
    });

    // Restore selection if still exists
    if (activities.includes(prevSelection)) {
        filterActivity.value = prevSelection;
        currentActivity = prevSelection;
    } else {
        filterActivity.value = "ALL";
        currentActivity = "ALL";
    }
}

function renderGradeTabs() {
    const standardGrades = ['ป.1', 'ป.2', 'ป.3', 'ป.4', 'ป.5', 'ป.6', 'ม.1', 'ม.2', 'ม.3'];
    
    // Clear tabs container
    filterGrades.innerHTML = "";

    // 1. Render "ทั้งหมด" tab
    const allTab = document.createElement("button");
    allTab.className = `tab-filter ${currentGrade === "ALL" ? "active" : ""}`;
    allTab.innerHTML = `ทั้งหมด`;
    allTab.addEventListener("click", () => {
        setActiveGradeTab("ALL");
    });
    filterGrades.appendChild(allTab);

    // 2. Render each grade tab
    standardGrades.forEach(grade => {
        const gradeTab = document.createElement("button");
        gradeTab.className = `tab-filter ${currentGrade === grade ? "active" : ""}`;
        gradeTab.innerHTML = `${grade}`;
        gradeTab.addEventListener("click", () => {
            setActiveGradeTab(grade);
        });
        filterGrades.appendChild(gradeTab);
    });
}

function setActiveGradeTab(grade) {
    currentGrade = grade;
    selectedItemIndex = 0;
    
    if (grade === "ALL") {
        currentActivity = "ALL";
        filterActivity.value = "ALL";
    }
    
    // Re-render grade tabs to update active state CSS
    const tabs = filterGrades.querySelectorAll(".tab-filter");
    const standardGrades = ["ALL", 'ป.1', 'ป.2', 'ป.3', 'ป.4', 'ป.5', 'ป.6', 'ม.1', 'ม.2', 'ม.3'];
    
    tabs.forEach((tab, index) => {
        if (standardGrades[index] === grade) {
            tab.classList.add("active");
        } else {
            tab.classList.remove("active");
        }
    });

    applyFilters();
}

function applyFilters() {
    const cleanCurrentGrade = currentGrade.replace(/\s+/g, '');
    filteredData = normalizedData.filter(item => {
        // 1. Activity filter
        const matchActivity = currentActivity === "ALL" || item.activity === currentActivity;
        
        // 2. Grade filter
        const itemGrade = item.grade.replace(/\s+/g, '');
        const matchGrade = cleanCurrentGrade === "ALL" || itemGrade === cleanCurrentGrade;
        
        return matchActivity && matchGrade;
    });

    // Update list title count
    listCountTitle.innerHTML = `<i class="fa-solid fa-list-check"></i> แผนการสอนบูรณาการที่ร่วมวิจัย (${filteredData.length})`;

    // Draw list cards
    drawPlanListCards();
    
    // Draw detail view
    drawDetailView();
}

function drawPlanListCards() {
    planList.innerHTML = "";

    if (filteredData.length === 0) {
        planList.innerHTML = `
            <div style="text-align: center; color: var(--text-muted); padding: 40px 16px; font-size: 13px;">
                <i class="fa-solid fa-circle-info" style="font-size: 24px; margin-bottom: 8px; display: block;"></i>
                ไม่พบแผนการสอนที่ตรงกับตัวกรอง
            </div>
        `;
        return;
    }

    filteredData.forEach((item, idx) => {
        const card = document.createElement("div");
        card.className = `plan-item-card ${idx === selectedItemIndex ? "active" : ""}`;
        
        // Check resource links existence
        const hasDoc = item.doc && item.doc.startsWith("http");
        const hasSlide = item.slide && item.slide.startsWith("http");
        const hasVideo = item.video && item.video.startsWith("http");
        const hasInfographic = item.infographic && item.infographic.startsWith("http");

        card.innerHTML = `
            <div class="plan-card-meta">
                <span class="grade-badge">ระดับ ${item.grade}</span>
                <span class="plan-date"><i class="fa-regular fa-calendar"></i> ${item.month}</span>
            </div>
            <h3 class="plan-title">${item.activity}</h3>
            <div class="plan-details">
                <div class="plan-details-item" title="${item.school}">
                    <i class="fa-solid fa-school"></i> ${item.school}
                </div>
                <div class="plan-details-item" title="${item.name}">
                    <i class="fa-solid fa-user"></i> ${item.name}
                </div>
            </div>
            <div class="plan-status-dots">
                <div class="status-indicator-dot ${hasDoc ? 'active-doc' : ''}" title="${hasDoc ? 'แผนการสอน Doc (ส่งแล้ว)' : 'ไม่มีแผนการสอน Doc'}"></div>
                <div class="status-indicator-dot ${hasSlide ? 'active-slide' : ''}" title="${hasSlide ? 'ชุดสไลด์ (ส่งแล้ว)' : 'ไม่มีชุดสไลด์'}"></div>
                <div class="status-indicator-dot ${hasVideo ? 'active-video' : ''}" title="${hasVideo ? 'วิดีโอ (ส่งแล้ว)' : 'ไม่มีวิดีโอ'}"></div>
                <div class="status-indicator-dot ${hasInfographic ? 'active-infographic' : ''}" title="${hasInfographic ? 'อินโฟกราฟิก (ส่งแล้ว)' : 'ไม่มีอินโฟกราฟิก'}"></div>
            </div>
        `;

        card.addEventListener("click", () => {
            // Update active selection
            const activeCard = planList.querySelector(".plan-item-card.active");
            if (activeCard) activeCard.classList.remove("active");
            card.classList.add("active");
            
            selectedItemIndex = idx;
            
            // Auto reset tab to first available resource
            const selectedItem = filteredData[selectedItemIndex];
            if (selectedItem.doc.startsWith("http")) {
                currentPreviewTab = "doc";
            } else if (selectedItem.slide.startsWith("http")) {
                currentPreviewTab = "slide";
            } else if (selectedItem.video.startsWith("http")) {
                currentPreviewTab = "video";
            } else if (selectedItem.infographic.startsWith("http")) {
                currentPreviewTab = "infographic";
            } else {
                currentPreviewTab = "doc";
            }

            drawDetailView();
        });

        planList.appendChild(card);
    });
}

// Helper: Extract GDrive file ID
function extractGDriveId(url) {
    if (!url) return null;
    const match = url.match(/(?:id=|\/d\/|presentation\/d\/|document\/d\/|file\/d\/)([a-zA-Z0-9_-]{25,})/);
    return match ? match[1] : null;
}

// Helper: build direct embed preview URL
function getEmbedUrl(url, type) {
    const id = extractGDriveId(url);
    if (!id) return url; // Fallback to raw URL
    
    // Only use Google Slides presentation embed if the URL is natively a Google Slides link
    if (url.includes('docs.google.com/presentation')) {
        return `https://docs.google.com/presentation/d/${id}/embed?start=false&loop=false&delayms=3000`;
    }
    if (url.includes('docs.google.com/document') || url.includes('/document/d/')) {
        return `https://docs.google.com/document/d/${id}/preview`;
    }
    // PDF, video, PowerPoint (.pptx) uploads, and other general assets preview Gdrive view
    return `https://drive.google.com/file/d/${id}/preview`;
}

function drawDetailView() {
    if (filteredData.length === 0 || !filteredData[selectedItemIndex]) {
        detailView.innerHTML = `
            <div class="empty-detail-state">
                <i class="fa-solid fa-file-invoice"></i>
                <h3>ไม่พบข้อมูลแผนบูรณาการ</h3>
                <p>กรุณาปรับเงื่อนไขตัวกรอง หรือค้นหาใหม่อีกครั้ง</p>
            </div>
        `;
        return;
    }

    const item = filteredData[selectedItemIndex];
    
    // Check links
    const hasDoc = item.doc && item.doc.startsWith("http");
    const hasSlide = item.slide && item.slide.startsWith("http");
    const hasVideo = item.video && item.video.startsWith("http");
    const hasInfographic = item.infographic && item.infographic.startsWith("http");

    // Clear detail view
    detailView.innerHTML = "";

    // Create Header Badge row
    const badgeRow = document.createElement("div");
    badgeRow.className = "detail-header-badges";
    badgeRow.innerHTML = `
        <span class="detail-meta-pill primary">ระดับชั้น ${item.grade}</span>
        <span class="detail-meta-pill">ประจำ ${item.month}</span>
    `;
    detailView.appendChild(badgeRow);

    // Title Row
    const titleSection = document.createElement("div");
    titleSection.className = "detail-title-section";
    titleSection.innerHTML = `<h2 class="detail-main-title">${item.activity}</h2>`;
    detailView.appendChild(titleSection);

    // Author Profile Box
    const authorPanel = document.createElement("div");
    authorPanel.className = "author-panel";
    authorPanel.innerHTML = `
        <div class="author-meta-item">
            <i class="fa-solid fa-user-tie"></i>
            <span>ออกแบบโดย: <strong>${item.name}</strong></span>
        </div>
        <div class="author-meta-item">
            <i class="fa-solid fa-school"></i>
            <span>${item.school}</span>
        </div>
        <div class="author-meta-item">
            <i class="fa-solid fa-envelope"></i>
            <span><a href="mailto:${item.email}">${item.email}</a></span>
        </div>
    `;
    detailView.appendChild(authorPanel);

    // Resource Navigation Tabs
    const tabsContainer = document.createElement("div");
    tabsContainer.className = "preview-tabs-container";
    
    const tabs = [
        { id: "doc", label: "บทสรุปแผนและสมรรถนะ (Doc)", active: hasDoc, icon: "fa-file-word" },
        { id: "slide", label: "ชุดสไลด์นำเสนอ (Slides)", active: hasSlide, icon: "fa-file-powerpoint" },
        { id: "video", label: "วิดีโอนำเข้าบทเรียน (Video)", active: hasVideo, icon: "fa-circle-play" },
        { id: "infographic", label: "อินโฟกราฟิกความรู้", active: hasInfographic, icon: "fa-circle-info" }
    ];

    tabs.forEach(tab => {
        const btn = document.createElement("button");
        btn.className = `preview-tab ${currentPreviewTab === tab.id ? "active" : ""} ${!tab.active ? "disabled" : ""}`;
        btn.innerHTML = `<i class="fa-solid ${tab.icon}"></i> ${tab.label}`;
        
        if (tab.active) {
            btn.addEventListener("click", () => {
                currentPreviewTab = tab.id;
                // Re-render only tabs and viewport
                const allTabElements = tabsContainer.querySelectorAll(".preview-tab");
                allTabElements.forEach((t, i) => {
                    t.className = `preview-tab ${tabs[i].id === tab.id ? "active" : ""} ${!tabs[i].active ? "disabled" : ""}`;
                });
                renderViewport(item);
            });
        } else {
            btn.title = "คุณครูไม่ได้อัปโหลดภารกิจชิ้นนี้";
        }
        tabsContainer.appendChild(btn);
    });
    detailView.appendChild(tabsContainer);

    // Viewport Preview Container
    const viewportContainer = document.createElement("div");
    viewportContainer.id = "preview-viewport";
    detailView.appendChild(viewportContainer);

    // Initial render of viewport
    renderViewport(item);
}

// Help map parsed subject keys to display names
function getSubjectDisplayName(key, customName) {
    if (customName) return customName;
    const defaultNames = {
        thai: "ภาษาไทย",
        math: "คณิตศาสตร์",
        science: "วิทยาศาสตร์และเทคโนโลยี",
        social: "สังคมศึกษา ศาสนา และวัฒนธรรม",
        health: "สุขศึกษาและพลศึกษา",
        art: "ศิลปะ",
        career: "การงานอาชีพ",
        foreign: "ภาษาต่างประเทศ"
    };
    return defaultNames[key] || key;
}

// Search curriculum data parsed from DOC files
function findCurriculumData(item) {
    if (typeof CURRICULUM_DATA === 'undefined') return null;
    const cleanStr = (s) => (s || '').replace(/\s+/g, '');
    const tClean = cleanStr(item.name);
    const gClean = cleanStr(item.grade);
    const aClean = cleanStr(item.activity);
    
    // 1. Exact match
    const exactKey = `${tClean}_${gClean}_${aClean}`;
    if (CURRICULUM_DATA[exactKey]) {
        return CURRICULUM_DATA[exactKey];
    }
    
    // 2. Fuzzy match
    const keys = Object.keys(CURRICULUM_DATA);
    
    // Try to match teacher AND grade AND activity
    let match = keys.find(k => {
        const parts = k.split('_');
        if (parts.length >= 3) {
            const kt = parts[0];
            const kg = parts[1];
            const ka = parts[2];
            return (kt.includes(tClean) || tClean.includes(kt)) &&
                   (kg === gClean) &&
                   (ka.includes(aClean) || aClean.includes(ka));
        }
        return false;
    });
    if (match) return CURRICULUM_DATA[match];

    // Try to match teacher AND grade
    match = keys.find(k => {
        const parts = k.split('_');
        if (parts.length >= 3) {
            const kt = parts[0];
            const kg = parts[1];
            return (kt.includes(tClean) || tClean.includes(kt)) && (kg === gClean);
        }
        return false;
    });
    if (match) return CURRICULUM_DATA[match];

    // Try to match activity AND grade
    match = keys.find(k => {
        const parts = k.split('_');
        if (parts.length >= 3) {
            const kg = parts[1];
            const ka = parts[2];
            return (kg === gClean) && (ka.includes(aClean) || aClean.includes(ka));
        }
        return false;
    });
    if (match) return CURRICULUM_DATA[match];

    return null;
}

function renderViewport(item) {
    const viewport = document.getElementById("preview-viewport");
    viewport.innerHTML = "";

    // If Summary tab (doc) is active, show the rich curriculum layout
    if (currentPreviewTab === "doc") {
        viewport.className = ""; // Remove iframe styling wrappers for a flexible visual layout
        
        // Find matching parsed data from DOC files
        const docData = findCurriculumData(item);
        
        // Find fallback template in CURRICULUM_TEMPLATES
        let fallback = CURRICULUM_TEMPLATES[item.activity];
        if (!fallback) {
            const matchingKey = Object.keys(CURRICULUM_TEMPLATES).find(key => item.activity.includes(key));
            fallback = matchingKey ? CURRICULUM_TEMPLATES[matchingKey] : CURRICULUM_TEMPLATES["สัปดาห์วันวิทยาศาสตร์"];
        }

        const formatText = (text) => {
            if (!text) return '';
            return text.replace(/\[GRADE\]/g, item.grade);
        };

        // Merge parsed docData with fallback template
        const concept = (docData && docData.concept) ? docData.concept : fallback.concept;
        const objectives = (docData && docData.objectives && docData.objectives.length > 0) ? docData.objectives : fallback.objectives;
        
        const hasParsedSequence = docData && docData.sequence && docData.sequence.some(s => s && s.trim());
        const sequence = hasParsedSequence ? docData.sequence.filter(s => s && s.trim()) : fallback.sequence;
        
        const stem = fallback.stem;
        const evaluation = fallback.evaluation;
        const product = fallback.product;

        const indicatorsData = (docData && docData.indicators && Object.keys(docData.indicators).length > 0) 
            ? docData.indicators 
            : fallback.indicators;

        let indicatorsHTML = "";
        Object.entries(indicatorsData).forEach(([subjKey, subjVal]) => {
            if (!subjVal) return;
            const subjectName = getSubjectDisplayName(subjKey, subjVal.subject);
            const betweenText = formatText(subjVal.between);
            const endText = formatText(subjVal.end);
            
            if (betweenText || endText) {
                indicatorsHTML += `
                    <div class="indicator-card">
                        <div class="indicator-subject">${subjectName}</div>
                        ${betweenText ? `
                        <div class="indicator-block">
                            <span class="indicator-label">ตัวชี้วัดระหว่างทาง:</span>
                            <span>${betweenText}</span>
                        </div>` : ''}
                        ${endText ? `
                        <div class="indicator-block">
                            <span class="indicator-label">ตัวชี้วัดปลายทาง:</span>
                            <span>${endText}</span>
                        </div>` : ''}
                    </div>
                `;
            }
        });

        // Render Summary Tab Curriculum Sections
        viewport.innerHTML = `
            <!-- Concept Alert Box -->
            <div class="concept-alert-box">
                <div class="concept-title">
                    <i class="fa-regular fa-lightbulb"></i>
                    แนวคิดการเรียนรู้บูรณาการแบบองค์รวม (Integrated Learning Concept)
                </div>
                <div class="concept-text">${formatText(concept)}</div>
            </div>

            <!-- 1. Curriculum Connections -->
            <div class="curriculum-section">
                <div class="curriculum-section-title">
                    <i class="fa-solid fa-wand-magic-sparkles"></i>
                    การเชื่อมโยงกิจกรรมบูรณาการกับกลุ่มสาระการเรียนรู้และตัวชี้วัด (ทวิชา/ครบทวิชาหลัก)
                </div>
                <div class="indicators-grid">
                    ${indicatorsHTML}
                </div>
            </div>

            <!-- 2. STEM Matrix -->
            <div class="curriculum-section">
                <div class="curriculum-section-title">
                    <i class="fa-solid fa-cubes"></i>
                    ตารางความเชื่อมโยงแผนบูรณาการ STEM (Integration Matrix)
                </div>
                <div class="stem-grid">
                    <div class="stem-card stem-s">
                        <div class="stem-badge">S</div>
                        <div class="stem-text">${formatText(stem.s)}</div>
                    </div>
                    <div class="stem-card stem-t">
                        <div class="stem-badge">T</div>
                        <div class="stem-text">${formatText(stem.t)}</div>
                    </div>
                    <div class="stem-card stem-e">
                        <div class="stem-badge">E</div>
                        <div class="stem-text">${formatText(stem.e)}</div>
                    </div>
                    <div class="stem-card stem-m">
                        <div class="stem-badge">M</div>
                        <div class="stem-text">${formatText(stem.m)}</div>
                    </div>
                </div>
            </div>

            <!-- 3. Objectives -->
            <div class="curriculum-section">
                <div class="curriculum-section-title">
                    <i class="fa-solid fa-book-bookmark"></i>
                    จุดประสงค์การเรียนรู้ตามสมรรถนะ
                </div>
                <ul class="objectives-list">
                    ${objectives.map(obj => `<li class="objective-item">${formatText(obj)}</li>`).join('')}
                </ul>
            </div>

            <!-- 4. Active Learning Sequence -->
            <div class="curriculum-section">
                <div class="curriculum-section-title">
                    <i class="fa-solid fa-list-ol"></i>
                    ขั้นจัดกิจกรรมแบบ Active Learning (Learning Sequence)
                </div>
                <div class="sequence-list">
                    ${sequence.map((seq, i) => `
                        <div class="sequence-step">
                            <div class="step-number">${i+1}</div>
                            <div class="step-text">${formatText(seq)}</div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- 5. Evaluation -->
            <div class="curriculum-section">
                <div class="curriculum-section-title">
                    <i class="fa-solid fa-clipboard-check"></i>
                    แนวทางวัดและประเมินผล
                </div>
                <div class="eval-box">
                    ${formatText(evaluation)}
                </div>
            </div>

            <!-- 6. Creative Deliverables -->
            <div class="curriculum-section">
                <div class="curriculum-section-title">
                    <i class="fa-solid fa-shapes"></i>
                    ชิ้นงาน & นวัตกรรมสร้างสรรค์
                </div>
                <div class="product-box">
                    ${formatText(product)}
                </div>
            </div>
        `;
        return;
    }

    // Otherwise (Slides, Video, Infographic), display iframe viewer
    viewport.className = "iframe-preview-wrapper"; // Apply fixed iframe frame styles
    
    let fileUrl = "";
    let tabLabel = "";
    let tabIcon = "";

    if (currentPreviewTab === "slide") {
        fileUrl = item.slide;
        tabLabel = "ชุดสไลด์นำเสนอ";
        tabIcon = "fa-file-powerpoint";
    } else if (currentPreviewTab === "video") {
        fileUrl = item.video;
        tabLabel = "วิดีโอนำเข้าบทเรียน";
        tabIcon = "fa-circle-play";
    } else if (currentPreviewTab === "infographic") {
        fileUrl = item.infographic;
        tabLabel = "อินโฟกราฟิกความรู้";
        tabIcon = "fa-circle-info";
    }

    if (!fileUrl || !fileUrl.startsWith("http")) {
        viewport.innerHTML = `
            <div class="preview-error-state">
                <i class="fa-solid fa-folder-open"></i>
                <p>ไม่ได้ส่งภารกิจ <strong>${tabLabel}</strong> สำหรับโครงการนี้</p>
            </div>
        `;
        return;
    }

    const embedUrl = getEmbedUrl(fileUrl, currentPreviewTab);
    const isGDrive = fileUrl.includes("drive.google.com") || fileUrl.includes("docs.google.com");

    if (isGDrive) {
        viewport.innerHTML = `
            <iframe src="${embedUrl}" class="preview-iframe" allow="autoplay; encrypted-media" allowfullscreen></iframe>
        `;
    } else {
        viewport.innerHTML = `
            <div class="preview-error-state">
                <i class="fa-solid ${tabIcon}" style="font-size: 36px; color: var(--color-primary);"></i>
                <p>ลิงก์ของผลงานชิ้นนี้ชี้ไปยังเว็บไซต์ภายนอกระบบ:<br><small>${fileUrl}</small></p>
                <a href="${fileUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-open-link">
                    <i class="fa-solid fa-arrow-up-right-from-square"></i> เปิดดูผลงานในหน้าต่างใหม่
                </a>
            </div>
        `;
    }
}
