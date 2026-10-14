/* 晋江书单详情页: 渲染 window.__LIST__ (服务端注入) */
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
    // 晋江正文里 emoji 是 [xxx], 参考站会替换成图片; 我们只保留文字, 剥掉 img 标签
    function cleanComment(html) {
        if (!html) return '';
        return String(html).replace(/<img[^>]*>/g, '');
    }

    function render() {
        var bl = LIST;
        document.title = (bl.listname || '书单') + ' - Novelia';
        var navTitle = document.getElementById('navTitleText');
        if (navTitle) navTitle.textContent = bl.listname || '书单详情';

        document.getElementById('booklist-title').textContent = bl.listname || '书单';
        document.getElementById('user-avatar').src = bl.reader_avatar || '/uploads/avatars/default-avatar.png';
        document.getElementById('user-name').textContent = bl.reader_name || '晋江';
        document.getElementById('book-count').textContent = bl.booknum || rawBooks.length;
        document.getElementById('fav-count').textContent = bl.favnum || 0;
        document.getElementById('publish-time').textContent = bl.publish_time || '';
        document.getElementById('books-count').textContent = '(' + rawBooks.length + ' 本书)';

        if (bl.introduction && String(bl.introduction).trim()) {
            document.getElementById('booklist-description').textContent = bl.introduction;
            document.getElementById('description-section').style.display = 'block';
        }
        if (bl.xx_num && bl.xx_num.length) {
            var box = document.getElementById('keywords-section');
            box.innerHTML = bl.xx_num.map(function (t) {
                return '<span class="jj-tag">' + esc(t.title) + '</span>';
            }).join('');
            box.style.display = 'flex';
        }
        renderBooks();
    }

    function renderBooks() {
        var grid = document.getElementById('books-grid');
        var books = rawBooks.slice();
        if (currentSort === 'novelstar_desc') books.sort(function (a, b) { return (b.novelstar || 0) - (a.novelstar || 0); });
        else if (currentSort === 'novelname_asc') books.sort(function (a, b) { return String(a.novelname).localeCompare(String(b.novelname), 'zh'); });

        if (!books.length) {
            grid.innerHTML = '<div class="empty-state">暂无书籍</div>';
            return;
        }
        grid.innerHTML = books.map(function (b) {
            var cover = b.cover ? ('/proxy_image?url=' + encodeURIComponent(b.cover)) : '/image/default_cover.png';
            var detailUrl = '/book_detail?source=' + encodeURIComponent('晋江')
                + '&name=' + encodeURIComponent(b.novelname || '')
                + '&bookid=' + encodeURIComponent(b.novelid || '');
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
            return ''
                + '<div class="book-card" data-url="' + esc(detailUrl) + '">'
                +   '<div class="book-card-content">'
                +     '<div class="book-cover">'
                +       '<img src="' + esc(cover) + '" alt="' + esc(b.novelname) + '" onerror="this.src=\'/image/default_cover.png\'">'
                +       '<div class="book-number">' + esc(b.index) + '</div>' + scoreTag
                +     '</div>'
                +     '<div class="book-info">'
                +       '<h3 class="book-title">' + esc(b.novelname) + '</h3>'
                +       '<div class="book-meta">'
                +         '<span class="book-author"><i class="fas fa-user-edit me-1"></i>' + esc(b.authorname) + '</span>'
                +         (b.novelsize ? '<span class="book-size"><i class="fas fa-file-alt me-1"></i>' + esc(b.novelsize) + '字</span>' : '')
                +       '</div>'
                +       ratingRow
                +       '<div class="book-stats">'
                +         (b.novelbefavoritedcount ? '<span>收藏: ' + esc(b.novelbefavoritedcount) + '</span>' : '')
                +         (b.renewdate ? '<span>更新: ' + esc(b.renewdate) + '</span>' : '')
                +       '</div>'
                +       (b.novelclass_str ? '<div class="book-stats"><span>分类: ' + esc(b.novelclass_str) + '</span></div>' : '')
                +     '</div>'
                +   '</div>' + rec
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
