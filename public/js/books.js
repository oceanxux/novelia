// 首页书籍卡片流与最近阅读展示
(function () {
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function detailHref(b) {
        return '/book_detail?source=' + encodeURIComponent(b.source || '') +
            '&url=' + encodeURIComponent(b.book_url || '') +
            '&bookid=' + encodeURIComponent(b.bookid || '');
    }

    function cardHTML(b) {
        var cover = b.cover || '/image/default_cover.png';
        var author = b.author || '佚名';
        return '<a class="book-card" href="' + detailHref(b) + '">' +
            '<div class="cover-wrap">' +
            '<img src="' + esc(cover) + '" alt="' + esc(b.title) + '" loading="lazy" onerror="this.src=\'/image/default_cover.png\'">' +
            '<span class="src-badge">' + esc(b.source || '') + '</span>' +
            '</div>' +
            '<div class="b-title" title="' + esc(b.title) + '">' + esc(b.title) + '</div>' +
            '<div class="b-author"><i class="fas fa-feather-alt me-1" style="font-size:10px;opacity:.7;"></i>' + esc(author) + '</div>' +
            '</a>';
    }

    function render(id, books) {
        var box = document.getElementById(id);
        if (!box) return;
        if (!books || !books.length) {
            box.innerHTML = '<div class="book-empty"><i class="fas fa-book-open fa-2x mb-2" style="opacity:0.4;"></i><p>暂无相关书籍</p></div>';
            return;
        }
        box.innerHTML = books.map(cardHTML).join('');
    }

    // 渲染最近阅读书籍卡片 (本地存储)
    function renderRecentRead() {
        var box = document.getElementById('recent-books');
        var section = document.getElementById('recent-section');
        if (!box || !section) return;

        try {
            var history = JSON.parse(localStorage.getItem('reading_history') || '[]');
            if (!history || !history.length) {
                section.style.display = 'none';
                return;
            }
            section.style.display = 'block';
            box.innerHTML = history.slice(0, 10).map(function (item) {
                var cover = item.cover || '/image/default_cover.png';
                var href = '/book_detail?source=' + encodeURIComponent(item.source || '') +
                    '&url=' + encodeURIComponent(item.url || '') +
                    '&bookid=' + encodeURIComponent(item.bookid || '');
                return '<a class="book-card" href="' + href + '">' +
                    '<div class="cover-wrap">' +
                    '<img src="' + esc(cover) + '" alt="' + esc(item.title) + '" loading="lazy" onerror="this.src=\'/image/default_cover.png\'">' +
                    '<span class="src-badge" style="background:rgba(99,102,241,0.92);">' + esc(item.source || '最近') + '</span>' +
                    '</div>' +
                    '<div class="b-title">' + esc(item.title) + '</div>' +
                    '<div class="b-author" style="color:#818cf8;"><i class="fas fa-bookmark me-1" style="font-size:10px;"></i>' + esc(item.lastChapter || '继续阅读') + '</div>' +
                    '</a>';
            }).join('');
        } catch (e) {
            section.style.display = 'none';
        }
    }

    // section: recommend | hot | random
    function loadBooks(section) {
        var map = { recommend: 'recommend-books', hot: 'hot-books', random: 'random-books' };
        var box = document.getElementById(map[section]);
        if (!box) return;
        box.innerHTML = '<div class="loading-dot"><i class="fas fa-spinner fa-spin me-2"></i>好书加载中...</div>';

        var sort = section === 'recommend' ? 'random' : (section === 'hot'
            ? (document.getElementById('hot-sort') ? document.getElementById('hot-sort').value : 'hot')
            : 'random');
        var limit = section === 'recommend' ? 12 : 16;

        fetch('/api/books?sort=' + sort + '&limit=' + limit + '&page=' + (1 + Math.floor(Math.random() * 4)))
            .then(function (r) { return r.json(); })
            .then(function (d) {
                if (d && d.success) render(map[section], d.books);
                else render(map[section], []);
            })
            .catch(function () { render(map[section], []); });
    }

    window.loadBooks = loadBooks;
    window.renderRecentRead = renderRecentRead;

    document.addEventListener('DOMContentLoaded', function () {
        renderRecentRead();
        loadBooks('recommend');
        loadBooks('hot');
        loadBooks('random');
    });
})();
