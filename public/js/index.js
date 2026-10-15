document.addEventListener('DOMContentLoaded', function() {
    updateNavbar();
    bindEvents();
    new LayoutManager().init();
    
    setTimeout(function() {
        if (document.getElementById('featured-list-booklists')) loadFeaturedBooklists(true);
    }, 500);
    
    var wrapper = document.querySelector('.featured-multirow-wrapper');
    if (wrapper) {
        wrapper.addEventListener('wheel', function(e) {
            if (e.deltaY !== 0) {
                e.preventDefault();
                this.scrollLeft += e.deltaY;
            }
        }, { passive: false });
    }
    
    document.addEventListener('keydown', function(e) {
        if (e.key === 'F5') {
            e.preventDefault();
            refreshRandomBooklists();
        }
    });
});

function updateNavbar() {
    updateTopNavbar();
    updateBottomNavbar();
}

function updateTopNavbar() {
    var isLoggedIn = TokenManager.isLoggedIn();
    var user = isLoggedIn ? TokenManager.getUserInfo() : null;
    
    var navRight = document.querySelector('.nav-right');
    if (!navRight) return;
    
    if (isLoggedIn) {
        var nickname = escapeHtml((user && user.nickname) || '用户');
        var avatar = escapeHtml((user && user.avatar) || '/uploads/avatars/default-avatar.png');
        var isMember = user && user.is_member;
        navRight.innerHTML = `
            <div class="dropdown">
                <a class="nav-user d-flex align-items-center gap-2" href="#" data-bs-toggle="dropdown" aria-expanded="false" style="text-decoration:none;">
                    <div class="nav-user-avatar-wrap">
                        <img src="${avatar}" class="nav-user-avatar" alt="用户头像" onerror="this.src='/uploads/avatars/default-avatar.png'">
                        <span class="online-dot"></span>
                    </div>
                    <span class="nav-user-nickname d-none d-sm-inline">${nickname}</span>
                    ${isMember ? '<span class="member-badge-sm">👑 VIP</span>' : ''}
                </a>
                <ul class="dropdown-menu dropdown-menu-end shadow-sm border-0" style="border-radius:12px; margin-top:10px;">
                    <li><a class="dropdown-item py-2" href="user_center"><i class="fas fa-user-circle me-2 text-primary"></i>个人中心</a></li>
                    <li><a class="dropdown-item py-2" href="/book_source.json"><i class="fas fa-cloud-arrow-down me-2 text-success"></i>导出 Legado 书源</a></li>
                    <li><hr class="dropdown-divider"></li>
                    <li><a class="dropdown-item py-2 text-danger logout-btn" href="#"><i class="fas fa-sign-out-alt me-2"></i>退出登录</a></li>
                </ul>
            </div>
        `;
    } else {
        navRight.innerHTML = `
            <a class="btn btn-outline-primary d-flex align-items-center gap-2" href="user_login" style="border-radius:999px;padding:6px 16px;font-size:13.5px;font-weight:600;text-decoration:none;">
                <i class="fas fa-sign-in-alt"></i>
                <span>登录 / 注册</span>
            </a>
        `;
    }
}

function updateNavLeft(container, isLoggedIn, user) {
    container.innerHTML = '';
    
    if (isLoggedIn && user) {
        var nickname = escapeHtml(user.nickname || '用户');
        var avatar = escapeHtml(user.avatar || '/uploads/avatars/default-avatar.png');
        var isMember = user.is_member || false;
        
        var userWrapper = document.createElement('div');
        userWrapper.className = 'dropdown';
        
        var toggle = document.createElement('a');
        toggle.className = 'nav-user';
        toggle.href = '#';
        toggle.setAttribute('data-bs-toggle', 'dropdown');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.title = '用户中心';
        toggle.innerHTML = `
            <div class="nav-user-avatar-wrap">
                <img src="${avatar}" class="nav-user-avatar" alt="头像" onerror="this.src='/uploads/avatars/default-avatar.png'">
                <span class="online-dot"></span>
            </div>
            <span class="nav-user-nickname">${nickname}</span>
            ${isMember ? '<span class="member-badge-sm">👑 VIP</span>' : ''}
        `;
        userWrapper.appendChild(toggle);
        
        var menu = document.createElement('ul');
        menu.className = 'dropdown-menu dropdown-menu-start';
        menu.innerHTML = `
            <li><a class="dropdown-item" href="user_center"><i class="fas fa-user me-2"></i>个人中心</a></li>
            <li><a class="dropdown-item" href="notifications"><i class="fas fa-envelope me-2"></i>消息中心</a></li>
            <li><hr class="dropdown-divider"></li>
            <li><a class="dropdown-item text-danger logout-btn" href="#"><i class="fas fa-sign-out-alt me-2"></i>退出登录</a></li>
        `;
        userWrapper.appendChild(menu);
        container.appendChild(userWrapper);
        
    } else {
        var defaultAvatar = '/uploads/avatars/default-avatar.png';
        
        var loginLink = document.createElement('a');
        loginLink.className = 'nav-user nav-user-offline';
        loginLink.href = 'user_login';
        loginLink.title = '点击登录';
        loginLink.innerHTML = `
            <div class="nav-user-avatar-wrap">
                <img src="${defaultAvatar}" class="nav-user-avatar" alt="默认头像" onerror="this.src='/uploads/avatars/default-avatar.png'">
                <span class="offline-dot"></span>
            </div>
        `;
        container.appendChild(loginLink);
    }
}

function updateNavRight(container, isLoggedIn) {
    container.innerHTML = '';
    
    if (isLoggedIn) {
        var notifBtn = document.createElement('a');
        notifBtn.className = 'btn-notification position-relative';
        notifBtn.href = 'notifications';
        notifBtn.title = '消息中心';
        notifBtn.innerHTML = '<i class="fas fa-bell"></i>';
        container.appendChild(notifBtn);
    }
    
    var searchWrapper = document.createElement('div');
    searchWrapper.className = 'nav-search-wrapper';
    searchWrapper.innerHTML = `
        <form action="booklist_index" method="get" class="nav-search">
            <input type="text" name="q" class="form-control" placeholder="搜索书单..." value="">
            <input type="hidden" name="type" value="local">
            <button type="submit" class="btn">
                <i class="fas fa-search"></i>
            </button>
        </form>
    `;
    container.appendChild(searchWrapper);
    
    var mobileSearch = document.createElement('button');
    mobileSearch.className = 'mobile-search-btn';
    mobileSearch.type = 'button';
    mobileSearch.setAttribute('data-bs-toggle', 'modal');
    mobileSearch.setAttribute('data-bs-target', '#mobileSearchModal');
    mobileSearch.innerHTML = '<i class="fas fa-search"></i>';
    container.appendChild(mobileSearch);
}

function updateBottomNavbar() {
    var isLoggedIn = TokenManager.isLoggedIn();
    var bottomNav = document.querySelector('.bottom-nav');
    
    if (!bottomNav) return;
    
    bottomNav.innerHTML = '';
    
    var currentPageName = window.currentPageName || 'booklist_index';
    var isIndexPage = currentPageName === 'booklist_index';
    var isDiscoverPage = currentPageName === 'booklist_discover';
    
    var items = [];
    
    items.push({
        href: 'booklist_index',
        icon: 'fa-home',
        label: '首页',
        active: isIndexPage
    });
    
    items.push({
        href: 'booklist_discover',
        icon: 'fa-book',
        label: '发现',
        active: isDiscoverPage
    });
    
    if (isLoggedIn) {
        items.push({
            href: 'booklist_create',
            icon: 'fa-plus-circle',
            label: '创建'
        });
        items.push({
            href: 'user_center',
            icon: 'fa-user',
            label: '我的'
        });
    } else {
        items.push({
            href: 'user_login',
            icon: 'fa-sign-in-alt',
            label: '登录'
        });
    }
    
    items.forEach(function(item) {
        var a = document.createElement('a');
        a.className = 'nav-item' + (item.active ? ' active' : '');
        a.href = item.href;
        a.innerHTML = `
            <i class="fas ${item.icon} nav-icon"></i>
            <span class="nav-label">${item.label}</span>
        `;
        bottomNav.appendChild(a);
    });
}

function handleLogout() {
    Swal.fire({
        title: '确认退出？',
        text: '您将退出当前登录状态',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: '确认退出',
        cancelButtonText: '取消',
        confirmButtonColor: '#dc3545'
    }).then(function(result) {
        if (result.isConfirmed) {
            TokenManager.logout();
            updateNavbar();
        }
    });
}

function bindEvents() {
    document.addEventListener('click', function(e) {
        if (e.target.closest('.logout-btn')) {
            e.preventDefault();
            handleLogout();
        }
    });
    
    document.addEventListener('click', function(e) {
        var link = e.target.closest('a[href*="notifications"], a[href*="user_center"]');
        if (link && !TokenManager.isLoggedIn()) {
            e.preventDefault();
            window.location.href = 'user_login';
        }
    });
    
    document.addEventListener('loginStatusChanged', function() {
        updateNavbar();
    });
}

class LayoutManager {
    constructor() {
        this.bottomNav = document.querySelector('.bottom-navbar');
        this.container = document.querySelector('.container-fluid');
    }
    
    init() {
        this.adjustLayout();
        this.addEventListeners();
    }
    
    adjustLayout() {
        if (!this.bottomNav || !this.container) return;
        
        var navHeight = this.bottomNav.offsetHeight;
        var safeSpacing = Math.max(navHeight * 0.2, 16);
        
        this.container.style.paddingBottom = navHeight + safeSpacing + 'px';
    }
    
    addEventListeners() {
        var self = this;
        window.addEventListener('resize', this.debounce(function() {
            self.adjustLayout();
        }, 250));
        
        window.addEventListener('load', function() {
            setTimeout(function() { self.adjustLayout(); }, 100);
        });
    }
    
    debounce(func, wait) {
        var timeout;
        return function executedFunction() {
            var args = arguments;
            var later = function() {
                clearTimeout(timeout);
                func.apply(null, args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
}

function scrollRecommended(direction) {
    var container = document.getElementById('recommended-novels');
    var scrollAmount = 120;
    if (direction === 'next') {
        container.scrollLeft += scrollAmount;
    } else {
        container.scrollLeft -= scrollAmount;
    }
}

function scrollFeaturedMultiRow(direction) {
    var container = document.querySelector('.featured-multirow-wrapper');
    var scrollAmount = 300;
    if (direction === 'next') {
        container.scrollLeft += scrollAmount;
    } else {
        container.scrollLeft -= scrollAmount;
    }
}

var featuredPage = 1;
var featuredSort = 'latest';
var featuredLoading = false;

function loadFeaturedBooklists(clear) {
    if (featuredLoading) return;
    
    featuredLoading = true;
    var container = document.getElementById('featured-list-booklists');
    var loadBtn = document.getElementById('load-more-featured');
    var spinner = document.getElementById('loading-featured');
    
    if (clear) {
        container.innerHTML = '<div class="text-center py-3"><i class="fas fa-spinner fa-spin"></i> 加载中...</div>';
    }
    
    if (loadBtn) loadBtn.disabled = true;
    if (spinner) spinner.classList.remove('d-none');
    
    var params = new URLSearchParams({
        sort: featuredSort,
        page: featuredPage
    });
    
    fetch('api/get_featured_booklists?' + params)
        .then(function(response) {
            if (!response.ok) throw new Error('网络响应不正常');
            return response.json();
        })
        .then(function(data) {
            if (data.success) {
                if (clear) container.innerHTML = '';
                
                if (data.booklists && data.booklists.length > 0) {
                    data.booklists.forEach(function(booklist) {
                        container.innerHTML += createFeaturedBooklistHTML(booklist);
                    });
                    
                    if (loadBtn) {
                        loadBtn.style.display = 'block';
                        loadBtn.disabled = false;
                    }
                    
                    if (data.booklists.length < 10) {
                        loadBtn.style.display = 'none';
                        if (featuredPage > 1) {
                            showNotification('没有更多书单了', 'info');
                        }
                    }
                } else {
                    if (clear) {
                        container.innerHTML = '<div class="empty-state"><i class="fas fa-star fa-2x text-muted mb-3"></i><p class="text-muted">暂无书单</p></div>';
                    }
                    if (loadBtn) loadBtn.style.display = 'none';
                    if (featuredPage > 1) {
                        showNotification('没有更多书单了', 'info');
                        featuredPage--;
                    }
                }
            } else {
                throw new Error(data.message || '加载失败');
            }
        })
        .catch(function(error) {
            if (clear) {
                container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle fa-2x text-warning mb-3"></i><p class="text-muted">加载失败，请刷新重试</p><button class="btn btn-sm btn-outline-primary mt-2" onclick="loadFeaturedBooklists(true)"><i class="fas fa-redo me-1"></i>重新加载</button></div>';
            } else {
                showNotification('加载失败', 'error');
                featuredPage--;
            }
        })
        .finally(function() {
            featuredLoading = false;
            if (loadBtn) loadBtn.disabled = false;
            if (spinner) spinner.classList.add('d-none');
        });
}

function loadMoreFeatured() {
    if (featuredLoading) return;
    featuredPage++;
    loadFeaturedBooklists(false);
}

function changeFeaturedSort(sortType) {
    featuredSort = sortType;
    featuredPage = 1;
    loadFeaturedBooklists(true);
}

function createFeaturedBooklistHTML(booklist) {
    var firstBook = booklist.books && booklist.books.length > 0 ? booklist.books[0] : null;
    var coverUrl = firstBook ? firstBook.book_cover : '/image/default_cover.png';
    
    var updateBadge = '';
    if (booklist.has_new_books) {
        updateBadge = '<div class="cover-update-badge">已更新</div>';
    } else if (booklist.time_label) {
        updateBadge = '<div class="cover-time-badge">' + booklist.time_label + '</div>';
    }
    
    var keywordsHTML = '';
    if (booklist.custom_keywords) {
        var keywords = booklist.custom_keywords.split(',');
        var displayKeywords = keywords.slice(0, 2);
        displayKeywords.forEach(function(keyword) {
            if (keyword.trim()) {
                keywordsHTML += '<span class="keyword-tag">' + escapeHtml(keyword.trim()) + '</span>';
            }
        });
    }
    
    var descriptionHTML = booklist.description ? '<p class="featured-description">' + escapeHtml(booklist.description) + '</p>' : '';
    
    return '<a href="booklist_jjdetail?listid=' + booklist.id + '" class="featured-item"><div class="featured-cover"><img src="' + escapeHtml(coverUrl) + '" alt="' + escapeHtml(booklist.title) + '" onerror="this.src=\'/image/default_cover.png\'">' + updateBadge + '</div><div class="featured-content"><h6 class="featured-title">' + escapeHtml(booklist.title) + '</h6><div class="featured-meta"><span class="book-count">' + booklist.book_count + ' 本书</span><span class="view-count"><i class="fas fa-heart"></i> ' + booklist.like_count + '</span><span class="view-count"><i class="fas fa-eye"></i> ' + booklist.view_count + '</span></div>' + descriptionHTML + (keywordsHTML ? '<div class="keywords">' + keywordsHTML + '</div>' : '') + '</div></a>';
}

var recommendedCooldown = false;
var recommendedCountdownInterval = null;
var recommendedPage = 1;

function refreshRecommendedBooklists() {
    if (recommendedCooldown) return;
    
    var refreshBtn = document.getElementById('refresh-podium');
    var refreshText = document.getElementById('refresh-podium-text');
    var countdownEl = document.getElementById('podium-countdown');
    
    refreshBtn.disabled = true;
    refreshText.classList.add('d-none');
    countdownEl.classList.remove('d-none');
    
    var countdown = 5;
    countdownEl.textContent = countdown + 's';
    
    recommendedCountdownInterval = setInterval(function() {
        countdown--;
        countdownEl.textContent = countdown + 's';
        
        if (countdown <= 0) {
            clearInterval(recommendedCountdownInterval);
            recommendedCooldown = false;
            refreshBtn.disabled = false;
            refreshText.classList.remove('d-none');
            countdownEl.classList.add('d-none');
        }
    }, 1000);
    
    recommendedCooldown = true;
    recommendedPage++;
    
    fetch('api/get_recommended_booklists?page=' + recommendedPage + '&limit=5')
        .then(function(response) { return response.json(); })
        .then(function(data) {
            if (data.success && data.booklists.length > 0) {
                displayRecommendedBooklists(data.booklists);
                
                if (!data.hasMore) {
                    refreshBtn.disabled = true;
                    refreshBtn.innerHTML = '<i class="fas fa-check me-1"></i><span>已无更多</span>';
                }
            } else {
                showNotification('暂无更多推荐书单', 'warning');
                recommendedPage--;
            }
        })
        .catch(function(error) {
            showNotification('刷新失败，请重试', 'error');
            recommendedPage--;
        })
        .finally(function() {
            setTimeout(function() {
                clearInterval(recommendedCountdownInterval);
                recommendedCooldown = false;
                refreshBtn.disabled = false;
                refreshText.classList.remove('d-none');
                countdownEl.classList.add('d-none');
            }, 5000);
        });
}

function displayRecommendedBooklists(booklists) {
    var container = document.getElementById('recommended-booklists');
    
    if (!booklists || booklists.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-crown fa-2x text-muted mb-3"></i><p class="text-muted">暂无推荐书单</p></div>';
        return;
    }
    
    var html = '<div class="recommended-booklists-scroll">';
    
    booklists.forEach(function(booklist, index) {
        var firstBook = booklist.books && booklist.books.length > 0 ? booklist.books[0] : null;
        var coverUrl = firstBook ? firstBook.book_cover : '/image/default_cover.png';
        
        var rankClass = '';
        var rankIcon = '';
        
        if (index === 0) {
            rankClass = 'first';
            rankIcon = '<i class="fas fa-crown fa-xs"></i>';
        } else if (index === 1) {
            rankClass = 'second';
            rankIcon = '<i class="fas fa-medal fa-xs"></i>';
        } else if (index === 2) {
            rankClass = 'third';
            rankIcon = '<i class="fas fa-medal fa-xs"></i>';
        } else {
            rankClass = 'normal';
            rankIcon = index + 1;
        }
        
        html += '<a href="booklist_jjdetail?listid=' + booklist.id + '" class="recommended-booklist-item"><div class="recommended-booklist-cover"><img src="' + escapeHtml(coverUrl) + '" alt="' + escapeHtml(booklist.title) + '" onerror="this.src=\'/image/default_cover.png\'"><div class="rank-badge ' + rankClass + '">' + rankIcon + '</div></div><h6 class="recommended-booklist-title">' + escapeHtml(booklist.title.length > 8 ? booklist.title.substring(0, 8) + '...' : booklist.title) + '</h6></a>';
    });
    
    html += '</div>';
    container.innerHTML = html;
}

var refreshCooldown = false;
var countdownInterval = null;

function refreshRandomBooklists() {
    if (refreshCooldown) return;
    
    var refreshBtn = document.getElementById('refresh-random');
    var refreshText = document.getElementById('refresh-text');
    var countdownEl = document.getElementById('countdown');
    
    refreshBtn.disabled = true;
    refreshText.classList.add('d-none');
    countdownEl.classList.remove('d-none');
    
    var countdown = 5;
    countdownEl.textContent = countdown + 's';
    
    countdownInterval = setInterval(function() {
        countdown--;
        countdownEl.textContent = countdown + 's';
        
        if (countdown <= 0) {
            clearInterval(countdownInterval);
            refreshCooldown = false;
            refreshBtn.disabled = false;
            refreshText.classList.remove('d-none');
            countdownEl.classList.add('d-none');
        }
    }, 1000);
    
    refreshCooldown = true;
    
    Promise.all([
        fetch('api/get_random_booklists').then(function(r) { return r.json(); }),
        fetch('api/get_jj_booklists').then(function(r) { return r.json(); })
    ])
    .then(function(results) {
        var normalData = results[0];
        var jjData = results[1];
        var container = document.getElementById('random-booklists');
        container.innerHTML = '';
        
        var allBooklists = [];
        
        if (normalData.success) {
            allBooklists = allBooklists.concat(normalData.booklists);
        }
        
        if (jjData.success) {
            allBooklists = allBooklists.concat(jjData.booklists);
        }
        
        allBooklists.sort(function() { return Math.random() - 0.5; });
        
        allBooklists.forEach(function(booklist) {
            var booklistHtml = createRandomBooklistHTML(booklist);
            container.innerHTML += booklistHtml;
        });
    })
    .catch(function(error) {
        showNotification('刷新失败，请重试', 'error');
    })
    .finally(function() {
        setTimeout(function() {
            clearInterval(countdownInterval);
            refreshCooldown = false;
            refreshBtn.disabled = false;
            refreshText.classList.remove('d-none');
            countdownEl.classList.add('d-none');
        }, 5000);
    });
}

function createRandomBooklistHTML(booklist) {
    var firstBook = booklist.books && booklist.books.length > 0 ? booklist.books[0] : null;
    var coverUrl = firstBook ? firstBook.book_cover : '/image/default_cover.png';
    
    var isJJ = booklist.is_jj || 
               (booklist.listid && typeof booklist.listid !== 'undefined') || 
               (booklist.source && booklist.source.toLowerCase().includes('jj')) ||
               (booklist.listid && !booklist.id);
    
    if (isJJ && coverUrl && coverUrl !== '/image/default_cover.png') {
        coverUrl = '/proxy_image?url=' + encodeURIComponent(coverUrl);
    }
    
    var coverHeights = [
        { class: 'short', height: 100 },
        { class: 'short', height: 120 },
        { class: 'medium', height: 140 },
        { class: 'medium', height: 160 },
        { class: 'tall', height: 180 },
        { class: 'tall', height: 200 },
        { class: 'extra-tall', height: 220 }
    ];
    var randomCover = coverHeights[Math.floor(Math.random() * coverHeights.length)];
    
    var cardClass = isJJ ? 'random-card jj-booklist ' + randomCover.class : 'random-card ' + randomCover.class;
    
    var updateBadge = '';
    if (!isJJ) {
        if (booklist.has_new_books) {
            updateBadge = '<div class="cover-update-badge">已更新</div>';
        } else if (booklist.time_label) {
            updateBadge = '<div class="cover-time-badge">' + booklist.time_label + '</div>';
        }
    }
    
    if (isJJ) {
        var levelHTML = '';
        if (booklist.level) {
            levelHTML = '<div class="jj-level"><span class="level-badge level-' + escapeHtml(String(booklist.level).toLowerCase()) + '">' + escapeHtml(booklist.level) + '级</span></div>';
        }
        
        var categoryHTML = '';
        if (booklist.categories && booklist.categories.length > 0) {
            categoryHTML = '<span class="stat jj-category">' + escapeHtml(booklist.categories[0]) + '</span>';
        }
        
        return '<a href="/booklist_jjdetail?listid=' + booklist.listid + '" class="masonry-item"><div class="' + cardClass + '"><div class="random-cover" style="height: ' + randomCover.height + 'px"><img src="' + escapeHtml(coverUrl) + '" alt="' + escapeHtml(booklist.title) + '" onerror="this.src=\'/image/default_cover.png\'"><div class="cover-badge jj-badge">晋江</div></div><div class="random-content"><h6 class="random-title">' + escapeHtml(booklist.title) + '</h6>' + levelHTML + (randomCover.class !== 'short' ? '<div class="book-previews">' + (booklist.books && booklist.books.length > 0 ? '<div class="book-preview"><span class="book-title">' + escapeHtml(booklist.books[0].book_title) + '</span></div>' : '') + (booklist.book_count > 1 ? '<div class="book-preview more-books">+' + (booklist.book_count - 1) + ' 本书</div>' : '') + '</div>' : '') + '<div class="random-footer"><div class="user-info"><img src="' + escapeHtml(booklist.avatar || 'https://static.jjwxc.net/images/logo.png') + '" class="user-avatar" alt="' + escapeHtml(booklist.nickname) + '"><span class="user-name">' + escapeHtml(booklist.nickname) + '</span></div><div class="random-stats"><span class="stat"><i class="fas fa-heart"></i> ' + booklist.like_count + '</span>' + categoryHTML + '</div></div></div></div></a>';
    } else {
        var booksHTML = '';
        
        if (randomCover.class === 'short') {
            booksHTML = '';
        } else if (randomCover.class === 'medium') {
            if (booklist.books && booklist.books.length > 0) {
                booksHTML = '<div class="book-previews"><div class="book-preview"><span class="book-title">' + escapeHtml(booklist.books[0].book_title) + '</span></div>' + (booklist.book_count > 1 ? '<div class="book-preview more-books">+' + (booklist.book_count - 1) + ' 本书</div>' : '') + '</div>';
            }
        } else {
            var displayBooks = booklist.books ? booklist.books.slice(0, 2) : [];
            displayBooks.forEach(function(book) {
                booksHTML += '<div class="book-preview"><span class="book-title">' + escapeHtml(book.book_title) + '</span></div>';
            });
            
            if (booklist.book_count > 2) {
                booksHTML += '<div class="book-preview more-books">+' + (booklist.book_count - 2) + ' 本书</div>';
            }
            
            booksHTML = '<div class="book-previews">' + booksHTML + '</div>';
        }
        
        var statsHTML = '';
        if (randomCover.class === 'short') {
            statsHTML = '<span class="stat"><i class="fas fa-heart"></i> ' + booklist.like_count + '</span>';
        } else {
            statsHTML = '<span class="stat"><i class="fas fa-heart"></i> ' + booklist.like_count + '</span><span class="stat"><i class="fas fa-eye"></i> ' + booklist.view_count + '</span>';
        }
        
        return '<a href="booklist_jjdetail?listid=' + booklist.id + '" class="masonry-item"><div class="' + cardClass + '"><div class="random-cover" style="height: ' + randomCover.height + 'px"><img src="' + escapeHtml(coverUrl) + '" alt="' + escapeHtml(booklist.title) + '" onerror="this.src=\'/image/default_cover.png\'"><div class="cover-badge">' + booklist.book_count + ' 本</div>' + updateBadge + '</div><div class="random-content"><h6 class="random-title">' + escapeHtml(booklist.title) + '</h6>' + booksHTML + '<div class="random-footer"><div class="user-info"><img src="' + escapeHtml(booklist.avatar || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=identicon&s=24') + '" class="user-avatar" alt="' + escapeHtml(booklist.nickname) + '"><span class="user-name">' + escapeHtml(booklist.nickname) + '</span></div><div class="random-stats">' + statsHTML + '</div></div></div></div></a>';
    }
}

var jjLoading = false;
var jjCurrentPage = 1;
var jjSort = 'fav_count';

function changeJJSort(sort) {
    jjSort = sort;
    jjCurrentPage = 1;
    
    var container = document.getElementById('jj-search-results');
    var loadBtn = document.getElementById('load-more-jj');
    
    container.innerHTML = '<div class="search-loading"><i class="fas fa-spinner fa-spin"></i> 加载中...</div>';
    loadBtn.style.display = 'none';
    
    loadJJResults();
}

function loadMoreJJResults() {
    if (jjLoading) return;
    
    jjCurrentPage++;
    loadJJResults();
}

function loadJJResults() {
    if (jjLoading) return;
    
    jjLoading = true;
    var container = document.getElementById('jj-search-results');
    var loadBtn = document.getElementById('load-more-jj');
    var loadingSpinner = document.getElementById('loading-jj');
    
    if (jjCurrentPage === 1) {
        container.innerHTML = '<div class="search-loading"><i class="fas fa-spinner fa-spin"></i> 加载中...</div>';
    }
    
    if (loadBtn) {
        loadBtn.disabled = true;
    }
    if (loadingSpinner) {
        loadingSpinner.classList.remove('d-none');
    }
    
    var keyword = window.searchKeyword || '';
    var url = '/api/search_jj_booklists?q=' + encodeURIComponent(keyword) + '&page=' + jjCurrentPage + '&sort=' + jjSort;
    
    fetch(url)
        .then(function(response) { return response.json(); })
        .then(function(data) {
            if (data.success) {
                if (jjCurrentPage === 1) {
                    container.innerHTML = '';
                }
                
                if (data.booklists && data.booklists.length > 0) {
                    data.booklists.forEach(function(booklist) {
                        var booklistHtml = createJJResultHTML(booklist);
                        container.innerHTML += booklistHtml;
                    });
                    
                    if (loadBtn) {
                        loadBtn.style.display = 'block';
                        loadBtn.disabled = false;
                    }
                    
                    if (data.total && data.booklists.length < 20) {
                        if (loadBtn) loadBtn.style.display = 'none';
                        if (jjCurrentPage === 1) {
                            showNotification('没有更多书单了', 'info');
                        }
                    }
                } else {
                    if (jjCurrentPage === 1) {
                        container.innerHTML = '<div class="empty-state"><i class="fas fa-search fa-3x text-muted mb-3"></i><h4 class="text-muted">没有找到晋江书单</h4></div>';
                    }
                    if (loadBtn) loadBtn.style.display = 'none';
                    
                    if (jjCurrentPage > 1) {
                        showNotification('没有更多书单了', 'info');
                        jjCurrentPage--;
                    }
                }
            } else {
                throw new Error(data.message || '加载失败');
            }
        })
        .catch(function(error) {
            if (jjCurrentPage === 1) {
                container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle fa-2x text-warning mb-3"></i><p class="text-muted">加载失败，请刷新重试</p></div>';
            } else {
                showNotification('加载失败', 'error');
                jjCurrentPage--;
            }
        })
        .finally(function() {
            jjLoading = false;
            if (loadBtn) {
                loadBtn.disabled = false;
            }
            if (loadingSpinner) {
                loadingSpinner.classList.add('d-none');
            }
        });
}

function createJJResultHTML(booklist) {
    var firstBook = booklist.display_novelinfo && booklist.display_novelinfo.length > 0 ? booklist.display_novelinfo[0] : null;
    var coverUrl = '/image/default_cover.png';
    
    if (firstBook) {
        var rawCoverUrl = firstBook.novel_cover || firstBook.localImg || '/image/default_cover.png';
        coverUrl = '/proxy_image?url=' + encodeURIComponent(rawCoverUrl);
    }
    
    var bookCount = booklist.display_novelinfo ? booklist.display_novelinfo.length : (booklist.recommend_count || 0);
    var subject = booklist.subject ? stripTags(booklist.subject) : '无标题书单';
    
    var coverHeights = [
        { class: 'short', height: 100 },
        { class: 'short', height: 120 },
        { class: 'medium', height: 140 },
        { class: 'medium', height: 160 },
        { class: 'tall', height: 180 },
        { class: 'tall', height: 200 },
        { class: 'extra-tall', height: 220 }
    ];
    var randomCover = coverHeights[Math.floor(Math.random() * coverHeights.length)];
    
    var levelHTML = '';
    if (booklist.level) {
        var levelLower = escapeHtml(String(booklist.level).toLowerCase());
        levelHTML = '<div class="jj-level"><span class="level-badge level-' + levelLower + '">' + escapeHtml(booklist.level) + '级</span></div>';
    }
    
    var booksHTML = '';
    var displayBooks = booklist.display_novelinfo ? booklist.display_novelinfo.slice(0, 2) : [];
    
    if (randomCover.class === 'short') {
        booksHTML = '';
    } else if (randomCover.class === 'medium') {
        if (displayBooks.length > 0) {
            var bookTitle = displayBooks[0].novelname || '未知书名';
            booksHTML = '<div class="book-previews"><div class="book-preview"><span class="book-title">' + escapeHtml(bookTitle) + '</span></div>' + (bookCount > 1 ? '<div class="book-preview more-books">+' + (bookCount - 1) + ' 本书</div>' : '') + '</div>';
        }
    } else {
        if (displayBooks.length > 0) {
            booksHTML = '<div class="book-previews">';
            displayBooks.forEach(function(book) {
                var bookTitle = book.novelname || '未知书名';
                booksHTML += '<div class="book-preview"><span class="book-title">' + escapeHtml(bookTitle) + '</span></div>';
            });
            
            if (bookCount > 2) {
                booksHTML += '<div class="book-preview more-books">+' + (bookCount - 2) + ' 本书</div>';
            }
            
            booksHTML += '</div>';
        }
    }
    
    var categoryHTML = '';
    if (booklist.xx_num && booklist.xx_num.length > 0 && booklist.xx_num[0]) {
        categoryHTML = '<span class="stat jj-category">' + escapeHtml(booklist.xx_num[0]) + '</span>';
    }
    
    var statsHTML = '';
    if (randomCover.class === 'short') {
        statsHTML = '<span class="stat"><i class="fas fa-heart"></i> ' + (booklist.fav_count || 0) + '</span>';
    } else {
        statsHTML = '<span class="stat"><i class="fas fa-heart"></i> ' + (booklist.fav_count || 0) + '</span>' + categoryHTML;
    }
    
    return '<a href="/booklist_jjdetail?listid=' + booklist.listid + '" class="masonry-item"><div class="random-card jj-booklist ' + randomCover.class + '"><div class="random-cover" style="height: ' + randomCover.height + 'px"><img src="' + escapeHtml(coverUrl) + '" alt="' + escapeHtml(subject) + '" onerror="this.src=\'/image/default_cover.png\'"><div class="cover-badge jj-badge">晋江</div></div><div class="random-content"><h6 class="random-title">' + escapeHtml(subject.length > 50 ? subject.substring(0, 50) + '...' : subject) + '</h6>' + levelHTML + booksHTML + '<div class="random-footer"><div class="user-info"><img src="https://m-static.jjwxc.net/images/wap/logo2.png" class="user-avatar" alt="晋江"><span class="user-name">晋江</span></div><div class="random-stats">' + statsHTML + '</div></div></div></div></a>';
}

function stripTags(text) {
    if (!text) return '';
    return text.replace(/<[^>]*>/g, '');
}

function switchSearchType(type) {
    var url = new URL(window.location.href);
    url.searchParams.set('type', type);
    url.searchParams.set('page', '1');
    window.location.href = url.toString();
}

function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showNotification(message, type) {
    type = type || 'success';
    var toast = Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 2000,
        timerProgressBar: true,
        background: '#ffffff',
        width: '280px',
        padding: '8px 12px',
        customClass: {
            popup: 'mini-toast',
            title: 'mini-toast-title'
        },
        didOpen: function(toast) {
            toast.addEventListener('mouseenter', Swal.stopTimer);
            toast.addEventListener('mouseleave', Swal.resumeTimer);
        }
    });
    
    toast.fire({
        icon: type,
        title: message
    });
}