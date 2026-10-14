/**
 * Token 管理器
 */
class TokenManager {
    static TOKEN_KEY = 'user_token';
    static USER_INFO_KEY = 'user_info';
    static TOKEN_EXPIRE_DAYS = 30;
    
    /**
     * 获取存储的 Token
     * @returns {string|null}
     */
    static getToken() {
        return localStorage.getItem(this.TOKEN_KEY);
    }
    
    /**
     * 设置 Token（同时同步到 Cookie）
     * @param {string} token
     */
    static setToken(token) {
        if (!token) {
            this.removeToken();
            return;
        }
        
        localStorage.setItem(this.TOKEN_KEY, token);
        
        // 同步设置 Cookie
        const expires = new Date();
        expires.setDate(expires.getDate() + this.TOKEN_EXPIRE_DAYS);
        const expiresStr = expires.toUTCString();
        
        document.cookie = `user_token=${token}; path=/; expires=${expiresStr}; SameSite=Lax`;
        document.cookie = `X-Novel-Token=${token}; path=/; expires=${expiresStr}; SameSite=Lax`;
    }
    
    /**
     * 移除 Token（仅清理本地，不调用 API）
     */
    static removeToken() {
        localStorage.removeItem(this.TOKEN_KEY);
        localStorage.removeItem(this.USER_INFO_KEY);
        
        // 清除 Cookie
        document.cookie = 'user_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        document.cookie = 'X-Novel-Token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    }
    
    /**
     * 获取用户信息
     * @returns {object|null}
     */
    static getUserInfo() {
        const info = localStorage.getItem(this.USER_INFO_KEY);
        return info ? JSON.parse(info) : null;
    }
    
    /**
     * 设置用户信息
     * @param {object|null} userInfo
     */
    static setUserInfo(userInfo) {
        if (userInfo) {
            localStorage.setItem(this.USER_INFO_KEY, JSON.stringify(userInfo));
        } else {
            localStorage.removeItem(this.USER_INFO_KEY);
        }
    }
    
    /**
     * 检查是否已登录
     * @returns {boolean}
     */
    static isLoggedIn() {
        return !!this.getToken();
    }
    
    /**
     * 设置请求头（用于 fetch）
     * @param {object} headers - 现有请求头
     * @returns {object} 添加了 Authorization 的请求头
     */
    static setAuthHeader(headers = {}) {
        const token = this.getToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        return headers;
    }
    
    /**
     * 封装的 fetch 请求（自动携带 token，处理 401）
     * @param {string} url
     * @param {object} options - fetch 配置
     * @returns {Promise<Response>}
     */
    static async fetch(url, options = {}) {
        const headers = this.setAuthHeader(options.headers || {});
        const response = await fetch(url, { ...options, headers });
        
        // 如果返回 401，自动清除 token 并跳转登录
        if (response.status === 401) {
            this.removeToken();
            const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
            window.location.href = `user_login?return_url=${returnUrl}`;
            throw new Error('登录已过期，请重新登录');
        }
        
        return response;
    }
    
    /**
     * 登出
     * @returns {Promise<void>}
     */
    static async logout() {
        const token = this.getToken();
        
        if (token) {
            try {
                await fetch('/api/logout', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
            } catch (e) {
                // 即使 API 调用失败，也清除本地状态
                console.warn('登出 API 调用失败:', e);
            }
        }
        
        // 清除本地状态
        this.removeToken();
        window.location.href = 'user_login?success=logged_out';
    }
    
    /**
     * 检查登录状态，未登录则跳转
     * @param {string|null} returnUrl - 登录后返回的 URL
     * @returns {boolean} 是否已登录
     */
    static checkAuthAndRedirect(returnUrl = null) {
        if (this.isLoggedIn()) {
            return true;
        }
        
        const url = returnUrl || window.location.pathname + window.location.search;
        window.location.href = `user_login?return_url=${encodeURIComponent(url)}`;
        return false;
    }
    
    /**
     * 同步 URL 中的 token 到 localStorage
     * @returns {boolean} 是否从 URL 同步了 token
     */
    static syncTokenFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        const urlToken = urlParams.get('token');
        
        if (urlToken && !this.getToken()) {
            this.setToken(urlToken);
            // 移除 URL 中的 token 参数
            const newUrl = window.location.pathname + window.location.hash;
            window.history.replaceState({}, '', newUrl);
            return true;
        }
        return false;
    }
    
    /**
     * 同步 Cookie 中的 token 到 localStorage
     * @returns {boolean} 是否从 Cookie 同步了 token
     */
    static syncTokenFromCookie() {
        const cookies = document.cookie.split(';');
        for (const cookie of cookies) {
            const trimmed = cookie.trim();
            if (!trimmed) continue;
            
            const eqIndex = trimmed.indexOf('=');
            if (eqIndex === -1) continue;
            
            const name = trimmed.substring(0, eqIndex);
            const value = trimmed.substring(eqIndex + 1);
            
            if ((name === 'X-Novel-Token' || name === 'user_token') && value && !this.getToken()) {
                this.setToken(value);
                return true;
            }
        }
        return false;
    }
    
    /**
     * 初始化：检查并同步 token
     */
    static init() {
        // 1. 从 URL 同步
        if (this.syncTokenFromUrl()) {
            window.location.reload();
            return;
        }
        
        // 2. 从 Cookie 同步
        if (this.syncTokenFromCookie()) {
            window.location.reload();
            return;
        }
    }
}

// 页面加载时自动初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        TokenManager.init();
    });
} else {
    TokenManager.init();
}

// 导出供其他模块使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TokenManager;
}