/* 书单详情页: 渲染 window.__LIST__ (服务端注入) */
(function () {
    var LIST = window.__LIST__ || {};
    var rawBooks = (LIST.books || []).slice();
    var currentSort = '';

    var STATUS_MAP = {
        '完结': 'completed', '已完结': 'completed',
        '连载': 'serializing', '连载中': 'serializing',
        '暂停': 'paused'
    };
    function statusClass(s) { return STATUS_MAP[s] || 'serializing'; }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }
    function stars(n) {
        n = Math.max(0, Math.min(5, Number(n) || 0));
        return '<i class="fas fa-star"></i>'.repeat(n) + '<i class="far fa-star"></i>'.repeat(5 - n);
    }
    // 正文里 emoji 是 [xxx], 参考站会替换成图片; 我们只保留文字, 剥掉 img 标签
    function cleanComment(html) {
        if (!html) return '';
        return String(html).replace(/<img[^>]*>/g, '');
    }
    // 书名: 兼容书旗 (novelname) 与旧字段
    function bookTitle(b) { return b.novelname || b.book_title || ''; }
    // 封面: 书旗给绝对 URL; 走本站代理避免混合内容与防盗链
    function bookCover(b) {
        var raw = b.cover || b.book_cover || '';
        if (!raw) return '/image/default_cover.png';
        if (raw.indexOf('/') === 0) return raw;
        return '/proxy_image?url=' + encodeURIComponent(raw);
    }
    // 详情链接: 走本站书详情页, 用书旗源
    function detailUrl(b) {
        return '/book_detail?source=' + encodeURIComponent(b.source || '书旗')
            + '&name=' + encodeURIComponent(bookTitle(b))
            + '&bookid=' + encodeURIComponent(b.novelid || '');
    }

    function render() {
        var bl = LIST;
        document.title = (bl.listname || '书单') + ' - Novelia';
        var navTitle = document.getElementById('navTitleText');
        if (navTitle) navTitle.textContent = bl.listname || '书单详情';

        document.getElementById('booklist-title').textContent = bl.listname || '书单';
        document.getElementById('user-avatar').src = bl.reader_avatar || '/uploads/avatars/default-avatar.png';
        document.getElementById('user-name').textContent = bl.reader_name || '书旗';
        document.getElementById('book-count').textContent = bl.booknum || rawBooks.length;
        document.getElementById('books-count').textContent = '(' + rawBooks.length + ' 本书)';

        // 收藏数与发布时间: 榜单数据源不提供时隐藏, 不留 "0 收藏" 这类空占位
        var favEl = document.getElementById('fav-count');
        if (favEl) {
            var favItem = favEl.closest('.jj-stats-item');
            if (Number(bl.favnum) > 0) favEl.textContent = bl.favnum;
            else if (favItem) favItem.style.display = 'none';
        }
        var timeEl = document.getElementById('publish-time');
        if (timeEl) {
            var timeItem = timeEl.closest('.jj-stats-item');
            if (bl.publish_time) timeEl.textContent = bl.publish_time;
            else if (timeItem) timeItem.style.display = 'none';
        }

        if (bl.introduction && String(bl.introduction).trim()) {
            document.getElementById('booklist-description').textContent = bl.introduction;
            document.getElementById('description-section').style.display = 'block';
        }
        var tags = bl.categories || bl.xx_num || [];
        if (tags && tags.length) {
            var box = document.getElementById('keywords-section');
            box.innerHTML = tags.map(function (t) {
                return '<span class="jj-tag">' + esc(t.title || t) + '</span>';
            }).join('');
            box.style.display = 'flex';
        }
        renderBooks();
    }

    function renderBooks() {
        var grid = document.getElementById('books-grid');
        var books = rawBooks.slice();
        if (currentSort === 'novelstar_desc') books.sort(function (a, b) { return (b.novelstar || 0) - (a.novelstar || 0); });
        else if (currentSort === 'novelname_asc') books.sort(function (a, b) { return String(bookTitle(a)).localeCompare(String(bookTitle(b)), 'zh'); });

        if (!books.length) {
            grid.innerHTML = '<div class="empty-state">暂无书籍</div>';
            return;
        }
        grid.innerHTML = books.map(function (b) {
            var scoreTag = b.novel_review_score ? '<div class="book-score-tag">' + esc(b.novel_review_score) + '</div>' : '';
            var ratingRow = (b.novelstar > 0 || b.novelstep_name)
                ? '<div class="book-rating-row">'
                    + (b.novelstar > 0 ? '<div class="book-rating"><div class="rating-stars">' + stars(b.novelstar) + '</div><span class="rating-score">' + b.novelstar + '星</span></div>' : '')
                    + (b.novelstep_name ? '<span class="status-tag ' + statusClass(b.novelstep_name) + '">' + esc(b.novelstep_name) + '</span>' : '')
                  + '</div>'
                : '';
            var rec = b.comment && String(b.comment).trim()
                ? '<div class="book-recommendation"><div class="recommendation-text">' + esc(cleanComment(b.comment)) + '</div></div>'
                : '';
            var desc = b.novelintroshort
                ? '<div class="book-recommendation"><div class="recommendation-text">' + esc(b.novelintroshort) + '</div></div>'
                : '';
            return ''
                + '<div class="book-card" data-url="' + esc(detailUrl(b)) + '">'
                +   '<div class="book-card-content">'
                +     '<div class="book-cover">'
                +       '<img src="' + esc(bookCover(b)) + '" alt="' + esc(bookTitle(b)) + '" onerror="this.src=\'/image/default_cover.png\'">'
                +       '<div class="book-number">' + esc(b.index) + '</div>' + scoreTag
                +     '</div>'
                +     '<div class="book-info">'
                +       '<h3 class="book-title">' + esc(bookTitle(b)) + '</h3>'
                +       '<div class="book-meta">'
                +         '<span class="book-author"><i class="fas fa-user-edit me-1"></i>' + esc(b.authorname || b.author_name || '') + '</span>'
                +         (b.novelsize ? '<span class="book-size"><i class="fas fa-file-alt me-1"></i>' + esc(b.novelsize) + '字</span>' : '')
                +       '</div>'
                +       ratingRow
                +       '<div class="book-stats">'
                +         (b.novelbefavoritedcount ? '<span>收藏: ' + esc(b.novelbefavoritedcount) + '</span>' : '')
                +         (b.renewdate ? '<span>更新: ' + esc(b.renewdate) + '</span>' : '')
                +       '</div>'
                +       (b.novelclass_str ? '<div class="book-stats"><span>分类: ' + esc(b.novelclass_str) + '</span></div>' : '')
                +     '</div>'
                +   '</div>' + rec + desc
                + '</div>';
        }).join('');
    }

    document.addEventListener('DOMContentLoaded', function () {
        if (!LIST || (!LIST.books && !LIST.listname)) {
            document.getElementById('loading').innerHTML = '加载失败，请刷新重试';
            return;
        }
        render();
        document.getElementById('loading').style.display = 'none';
        document.getElementById('content').style.display = 'block';
        document.getElementById('book-sort').addEventListener('change', function (e) {
            currentSort = e.target.value;
            renderBooks();
        });
        document.addEventListener('click', function (e) {
            var card = e.target.closest('.book-card');
            if (card && card.dataset.url) window.location.href = card.dataset.url;
        });
    });
})();
