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
    var rawCover = firstBook ? (firstBook.cover || firstBook.book_cover || '') : '';
    var coverUrl = rawCover
        ? (rawCover.indexOf('/') === 0 ? rawCover : '/proxy_image?url=' + encodeURIComponent(rawCover))
        : '/image/default_cover.png';

    var countLabel = (booklist.book_count || (booklist.books ? booklist.books.length : 0)) + ' 本';
    var authorLabel = firstBook ? (firstBook.author || firstBook.book_author || firstBook.novelname || '') : '榜单精选';

    return '<a href="booklist_detail?listid=' + encodeURIComponent(booklist.id) + '" class="book-card" title="' + escapeHtml(booklist.title) + '">'
        + '<div class="cover-wrap">'
        + '<img src="' + escapeHtml(coverUrl) + '" alt="' + escapeHtml(booklist.title) + '" loading="lazy" onerror="this.src=\'/image/default_cover.png\'">'
        + '<span class="src-badge"><i class="fas fa-crown me-1" style="font-size:9.5px;color:#fbbf24;"></i>' + escapeHtml(countLabel) + '</span>'
        + '</div>'
        + '<div class="b-title">' + escapeHtml(booklist.title) + '</div>'
        + '<div class="b-author">' + escapeHtml(authorLabel) + '</div>'
        + '</a>';
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